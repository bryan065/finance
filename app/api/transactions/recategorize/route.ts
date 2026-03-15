// POST /api/transactions/recategorize
// Re-runs AI categorization on all transactions currently assigned 'Other'.
// Returns { updated, skipped } on success, { error } on failure.

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { categorizeAll, type Category } from '@/lib/categorize'

export async function POST() {
  try {
    // Fetch transactions categorized as 'Other' that were NOT manually set.
    // Requires the category_manual column — run this if you haven't already:
    //   ALTER TABLE transactions
    //     ADD COLUMN IF NOT EXISTS category_manual BOOLEAN NOT NULL DEFAULT FALSE;
    const result = await query(`
      SELECT t.id, t.merchant
      FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE c.name = 'Other'
        AND t.category_manual = FALSE
      ORDER BY t.date DESC
    `)

    if (result.rows.length === 0) {
      return NextResponse.json({ updated: 0, skipped: 0 })
    }

    const ids: number[]       = result.rows.map((r: { id: number }) => r.id)
    const merchants: string[] = result.rows.map((r: { merchant: string }) => r.merchant)

    // Pass 0: load DB history for non-Other merchants
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
    for (const r of historyResult.rows) {
      knownCategories[r.merchant] = r.category as Category
    }

    // Load all category ids
    const catRows = await query('SELECT id, name FROM categories')
    const categoryIdByName: Record<string, number> = {}
    for (const r of catRows.rows) categoryIdByName[r.name] = r.id

    // Categorize
    const categories = await categorizeAll(merchants, knownCategories)

    let updated = 0
    let skipped = 0

    for (let i = 0; i < ids.length; i++) {
      const cat = categories[i]
      if (cat === 'Other') { skipped++; continue }

      const categoryId = categoryIdByName[cat]
      if (!categoryId) { skipped++; continue }

      await query(
        'UPDATE transactions SET category_id = $1 WHERE id = $2',
        [categoryId, ids[i]]
      )
      updated++
    }

    return NextResponse.json({ updated, skipped })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)

    // Detect the missing-migration case and surface a clear hint
    if (message.includes('category_manual')) {
      return NextResponse.json(
        { error: 'DB column missing. Run: ALTER TABLE transactions ADD COLUMN IF NOT EXISTS category_manual BOOLEAN NOT NULL DEFAULT FALSE;' },
        { status: 500 }
      )
    }

    console.error('[recategorize]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
