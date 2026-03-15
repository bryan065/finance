// POST /api/transactions/bulk
// Inserts a batch of parsed transactions into the DB.
// - Looks up account_id from the account code
// - Looks up split_config for the transaction year
// - AI-categorizes all merchants (keyword lookup + Claude fallback)
// - Skips duplicates (same account + date + merchant + amount)
// Returns { inserted, skipped }

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import type { ParsedRow } from '@/lib/parsers'
import { categorizeAll, type Category } from '@/lib/categorize'
import { getSplitRatio } from '@/lib/split'

export async function POST(request: NextRequest) {
  const { rows, account }: { rows: ParsedRow[]; account: string } = await request.json()

  if (!rows?.length || !account) {
    return NextResponse.json({ error: 'Missing rows or account' }, { status: 400 })
  }

  // Look up account_id
  const acctResult = await query('SELECT id FROM accounts WHERE code = $1', [account])
  if (acctResult.rows.length === 0) {
    return NextResponse.json({ error: `Unknown account: ${account}` }, { status: 400 })
  }
  const accountId: number = acctResult.rows[0].id

  // Pre-load all categories into a name→id map
  const catRows = await query('SELECT id, name FROM categories')
  const categoryIdByName: Record<string, number> = {}
  for (const r of catRows.rows) categoryIdByName[r.name] = r.id
  const defaultCategoryId: number = categoryIdByName['Other']
  if (!defaultCategoryId) {
    return NextResponse.json({ error: "Category 'Other' not found in DB" }, { status: 500 })
  }

  // Pass 0: load previously categorized merchants from the DB
  // Uses the most-recent non-Other category seen for each merchant name.
  const historyResult = await query(`
    SELECT DISTINCT ON (t.merchant)
      t.merchant,
      c.name AS category
    FROM transactions t
    JOIN categories c ON c.id = t.category_id
    WHERE c.name != 'Other'
    ORDER BY t.merchant, t.date DESC
  `)
  const knownCategories: Record<string, Category> = {}
  for (const r of historyResult.rows) knownCategories[r.merchant] = r.category as Category

  // Categorize all merchants: pass 0 (DB history) → pass 1 (keyword) → pass 2 (Claude)
  const merchants = rows.map(r => r.merchant)
  let categories: string[]
  try {
    categories = await categorizeAll(merchants, knownCategories)
  } catch (err) {
    console.error('[bulk] categorizeAll failed, falling back to Other:', err)
    categories = merchants.map(() => 'Other')
  }

  // Cache split ratios by (year, category) — key: `${year}:${category}`
  const splitCache: Record<string, { shirley: number; johnson: number }> = {}
  async function getSplit(year: number, categoryName: string) {
    const key = `${year}:${categoryName}`
    if (splitCache[key]) return splitCache[key]
    const ratio = await getSplitRatio(year, categoryName)
    splitCache[key] = ratio
    return ratio
  }

  let inserted = 0
  let skipped  = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]

    // Duplicate check: same account + date + merchant + amount
    const dup = await query(
      `SELECT id FROM transactions
       WHERE account_id = $1 AND date = $2 AND merchant = $3 AND amount = $4`,
      [accountId, row.date, row.merchant, row.amount]
    )
    if (dup.rows.length > 0) { skipped++; continue }

    // Resolve category id (fall back to Other if category isn't in DB)
    const categoryId = categoryIdByName[categories[i]] ?? defaultCategoryId

    // Calculate shares (default type = joint)
    const year         = parseInt(row.date.slice(0, 4), 10)
    const categoryName = categories[i] ?? 'Other'
    const split        = await getSplit(year, categoryName)
    const shirleyShare = row.amount * split.shirley
    const johnsonShare = row.amount * split.johnson

    await query(
      `INSERT INTO transactions
         (date, merchant, amount, account_id, category_id, type, paid_by, shirley_share, johnson_share)
       VALUES ($1, $2, $3, $4, $5, 'joint', $6, $7, $8)`,
      [
        row.date,
        row.merchant,
        row.amount,
        accountId,
        categoryId,
        row.paidBy,
        shirleyShare,
        johnsonShare,
      ]
    )
    inserted++
  }

  return NextResponse.json({ inserted, skipped })
}
