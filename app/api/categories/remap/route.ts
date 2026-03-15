// POST /api/categories/remap
//
// Bulk-updates every category whose roll_up_1 (or roll_up_2) matches `from`
// to the value `to`.  Used for renaming or deleting a roll-up group.
//
// Body: { field: 'roll_up_1' | 'roll_up_2', from: string, to: string }

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

const ALLOWED_FIELDS = ['roll_up_1', 'roll_up_2'] as const
type AllowedField = (typeof ALLOWED_FIELDS)[number]

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { field, from, to } = body as { field: string; from: string; to: string }

    if (!ALLOWED_FIELDS.includes(field as AllowedField)) {
      return NextResponse.json({ error: 'field must be roll_up_1 or roll_up_2' }, { status: 400 })
    }
    if (!from?.trim()) return NextResponse.json({ error: '`from` is required' }, { status: 400 })
    if (!to?.trim())   return NextResponse.json({ error: '`to` is required'   }, { status: 400 })
    if (from.trim() === to.trim()) {
      return NextResponse.json({ error: '`from` and `to` are the same' }, { status: 400 })
    }

    // Use parameterised column name via a safe allowlist (no user input in SQL text)
    const sql = field === 'roll_up_1'
      ? `UPDATE categories SET roll_up_1 = $1 WHERE roll_up_1 = $2`
      : `UPDATE categories SET roll_up_2 = $1 WHERE roll_up_2 = $2`

    const result = await query(sql, [to.trim(), from.trim()])
    return NextResponse.json({ updated: result.rowCount ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
