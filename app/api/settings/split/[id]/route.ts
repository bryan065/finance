// PATCH  /api/settings/split/:id  — update ratio + category assignments
// DELETE /api/settings/split/:id  — remove ratio (cascade deletes categories)

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ── PATCH ───────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const idInt = parseInt(id, 10)
    if (isNaN(idInt)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const { name, shirley_pct, notes, category_ids } = await request.json()

    // Build SQL updates
    const updates: string[] = []
    const values: unknown[] = []
    let i = 1

    if (name !== undefined) {
      updates.push(`name = $${i++}`)
      values.push(name ?? null)
    }
    if (notes !== undefined) {
      updates.push(`notes = $${i++}`)
      values.push(notes ?? null)
    }
    if (typeof shirley_pct === 'number') {
      if (shirley_pct < 0 || shirley_pct > 100) {
        return NextResponse.json({ error: 'shirley_pct must be 0–100' }, { status: 400 })
      }
      const shirleyRatio = +(shirley_pct / 100).toFixed(4)
      const johnsonRatio = +(1 - shirleyRatio).toFixed(4)
      updates.push(`shirley_ratio = $${i++}`)
      values.push(shirleyRatio)
      updates.push(`johnson_ratio = $${i++}`)
      values.push(johnsonRatio)
    }

    if (updates.length > 0) {
      values.push(idInt)
      const result = await query(
        `UPDATE split_config SET ${updates.join(', ')} WHERE id = $${i} RETURNING id`,
        values
      )
      if (result.rows.length === 0) {
        return NextResponse.json({ error: 'Split config not found' }, { status: 404 })
      }
    }

    // Replace category assignments if category_ids provided
    if (Array.isArray(category_ids)) {
      await query(
        'DELETE FROM split_config_categories WHERE split_config_id = $1',
        [idInt]
      )
      if (category_ids.length > 0) {
        const placeholders = category_ids.map((_, j) => `($${j * 2 + 1}, $${j * 2 + 2})`).join(', ')
        const catValues = category_ids.flatMap((catId: number) => [idInt, catId])
        await query(
          `INSERT INTO split_config_categories (split_config_id, category_id) VALUES ${placeholders}`,
          catValues
        )
      }
    }

    // Return updated row with categories
    const full = await query(`
      SELECT
        sc.id, sc.year, sc.name,
        sc.shirley_ratio::float, sc.johnson_ratio::float, sc.notes,
        COALESCE(
          json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name)
          FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS categories
      FROM split_config sc
      LEFT JOIN split_config_categories scc ON scc.split_config_id = sc.id
      LEFT JOIN categories c ON c.id = scc.category_id
      WHERE sc.id = $1
      GROUP BY sc.id
    `, [idInt])

    if (full.rows.length === 0) {
      return NextResponse.json({ error: 'Split config not found' }, { status: 404 })
    }

    return NextResponse.json({ ratio: full.rows[0] })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[settings/split PATCH]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const idInt = parseInt(id, 10)
    if (isNaN(idInt)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
    }

    const result = await query(
      'DELETE FROM split_config WHERE id = $1 RETURNING id',
      [idInt]
    )

    if (result.rows.length === 0) {
      return NextResponse.json({ error: 'Split config not found' }, { status: 404 })
    }

    return NextResponse.json({ deleted: idInt })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
