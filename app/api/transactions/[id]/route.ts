// API Route: PATCH /api/transactions/:id
// Updates category, type, and/or paidBy for a transaction.
// Also recalculates shirley_share / johnson_share based on the final type:
//   - joint    → apply the split_config ratio for the transaction's year
//   - personal → 100% to the named person, 0% to the other

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { getSplitRatio } from '@/lib/split'

type UpdateTransactionBody = {
  category?: string
  type?: 'joint' | 'personal'
  paidBy?: 'Shirley' | 'Johnson'
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body: UpdateTransactionBody = await request.json()

  // Look up the category_id from the category name
  let categoryId: number | undefined
  if (body.category) {
    const catResult = await query(
      'SELECT id FROM categories WHERE name = $1',
      [body.category]
    )
    if (catResult.rows.length === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 400 })
    }
    categoryId = catResult.rows[0].id
  }

  // Fetch the current transaction including its category name (for split lookup)
  const txResult = await query(
    `SELECT t.amount, t.date, t.type, t.paid_by, c.name AS category_name
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     WHERE t.id = $1`,
    [id]
  )
  if (txResult.rows.length === 0) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 })
  }
  const tx = txResult.rows[0]

  // Resolve the final type and paidBy (use incoming value or fall back to current DB value)
  const finalType   = body.type   ?? tx.type
  const finalPaidBy = body.paidBy ?? tx.paid_by

  // Recalculate shares based on the final type
  let shirleyShare: number
  let johnsonShare: number

  if (finalType === 'personal') {
    // 100% to the named person
    shirleyShare = finalPaidBy === 'Shirley' ? tx.amount : 0
    johnsonShare = finalPaidBy === 'Johnson' ? tx.amount : 0
  } else {
    // joint — look up split ratio for (year, category)
    const year = new Date(tx.date).getFullYear()
    // If category is being changed, use the new category for split lookup
    let categoryName = tx.category_name as string
    if (body.category) {
      categoryName = body.category
    }
    try {
      const split = await getSplitRatio(year, categoryName)
      shirleyShare = tx.amount * split.shirley
      johnsonShare = tx.amount * split.johnson
    } catch {
      return NextResponse.json({ error: `No split config found for year ${year}` }, { status: 400 })
    }
  }

  // Build the SQL update
  const updates: string[] = []
  const values: unknown[] = []
  let i = 1

  if (categoryId !== undefined) {
    updates.push(`category_id = $${i++}`)
    values.push(categoryId)
    // Mark as manually categorized so re-categorize won't overwrite it
    updates.push(`category_manual = $${i++}`)
    values.push(true)
  }
  if (body.type !== undefined) {
    updates.push(`type = $${i++}`)
    values.push(body.type)
  }
  if (body.paidBy !== undefined) {
    updates.push(`paid_by = $${i++}`)
    values.push(body.paidBy)
  }

  // Always write the recalculated shares
  updates.push(`shirley_share = $${i++}`)
  values.push(shirleyShare)
  updates.push(`johnson_share = $${i++}`)
  values.push(johnsonShare)

  if (updates.length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  values.push(id)

  const result = await query(
    `UPDATE transactions SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  )

  return NextResponse.json({ success: true, transaction: result.rows[0] })
}
