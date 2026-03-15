// PATCH  /api/categories/:id  — update name, roll_up_1, roll_up_2, is_housing
// DELETE /api/categories/:id  — delete if not referenced by any transactions

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const idInt = parseInt(id, 10)
    if (isNaN(idInt)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { name, roll_up_1, roll_up_2, is_housing } = await request.json()

    const updates: string[] = []
    const values:  unknown[] = []
    let i = 1

    if (name      !== undefined) { updates.push(`name = $${i++}`);       values.push(name.trim()) }
    if (roll_up_1 !== undefined) { updates.push(`roll_up_1 = $${i++}`);  values.push(roll_up_1.trim()) }
    if (roll_up_2 !== undefined) { updates.push(`roll_up_2 = $${i++}`);  values.push(roll_up_2.trim()) }
    if (is_housing !== undefined){ updates.push(`is_housing = $${i++}`); values.push(is_housing) }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
    }

    values.push(idInt)
    const result = await query(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    return NextResponse.json({ category: result.rows[0] })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const idInt = parseInt(id, 10)
    if (isNaN(idInt)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    // Check if used by any transactions
    const txCheck = await query(
      'SELECT COUNT(*) AS n FROM transactions WHERE category_id = $1',
      [idInt]
    )
    const txCount = parseInt(txCheck.rows[0].n, 10)
    if (txCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete — used by ${txCount} transaction${txCount !== 1 ? 's' : ''}` },
        { status: 409 }
      )
    }

    const result = await query(
      'DELETE FROM categories WHERE id = $1 RETURNING id',
      [idInt]
    )
    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Category not found' }, { status: 404 })
    }

    return NextResponse.json({ deleted: idInt })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
