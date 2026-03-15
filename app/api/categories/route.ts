// GET  /api/categories  — all categories ordered by roll_up_1, name
// POST /api/categories  — create a new category

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function GET() {
  try {
    const result = await query(`
      SELECT id, name, roll_up_1, roll_up_2, is_housing
      FROM categories
      ORDER BY roll_up_1, name
    `)
    return NextResponse.json({ categories: result.rows })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { name, roll_up_1, roll_up_2, is_housing } = await request.json()

    if (!name?.trim())      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    if (!roll_up_1?.trim()) return NextResponse.json({ error: 'Roll-up 1 is required' }, { status: 400 })
    if (!roll_up_2?.trim()) return NextResponse.json({ error: 'Roll-up 2 is required' }, { status: 400 })

    const result = await query(
      `INSERT INTO categories (name, roll_up_1, roll_up_2, is_housing)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name.trim(), roll_up_1.trim(), roll_up_2.trim(), is_housing ?? false]
    )
    return NextResponse.json({ category: result.rows[0] }, { status: 201 })
  } catch (err) {
    const msg = String(err)
    if (msg.includes('unique') || msg.includes('duplicate')) {
      return NextResponse.json({ error: 'A category with that name already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
