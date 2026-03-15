// GET  /api/settings/split        — returns all split configs with their categories
// POST /api/settings/split        — creates a new split config with category assignments
//
// SplitRow shape:
//   { id, year, name, shirley_ratio, johnson_ratio, notes, categories: [{id, name}] }

import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'

// ── GET ─────────────────────────────────────────────────────────────────────

export async function GET() {
  try {
    const result = await query(`
      SELECT
        sc.id,
        sc.year,
        sc.name,
        sc.shirley_ratio::float,
        sc.johnson_ratio::float,
        sc.notes,
        COALESCE(
          json_agg(
            json_build_object('id', c.id, 'name', c.name)
            ORDER BY c.name
          ) FILTER (WHERE c.id IS NOT NULL),
          '[]'
        ) AS categories
      FROM split_config sc
      LEFT JOIN split_config_categories scc ON scc.split_config_id = sc.id
      LEFT JOIN categories c ON c.id = scc.category_id
      GROUP BY sc.id
      ORDER BY sc.year DESC, sc.id ASC
    `)

    return NextResponse.json({ ratios: result.rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

// ── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const { year, name, shirley_pct, notes, category_ids } = await request.json()

    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return NextResponse.json({ error: 'year must be an integer 2000–2100' }, { status: 400 })
    }
    if (typeof shirley_pct !== 'number' || shirley_pct < 0 || shirley_pct > 100) {
      return NextResponse.json({ error: 'shirley_pct must be 0–100' }, { status: 400 })
    }

    const shirleyRatio = +(shirley_pct / 100).toFixed(4)
    const johnsonRatio = +(1 - shirleyRatio).toFixed(4)
    const categoryList: number[] = Array.isArray(category_ids) ? category_ids : []

    // Insert the split config row
    const insertResult = await query(
      `INSERT INTO split_config (year, name, shirley_ratio, johnson_ratio, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [year, name ?? null, shirleyRatio, johnsonRatio, notes ?? null]
    )
    const newId: number = insertResult.rows[0].id

    // Insert category assignments
    if (categoryList.length > 0) {
      const placeholders = categoryList.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')
      const values = categoryList.flatMap(catId => [newId, catId])
      await query(
        `INSERT INTO split_config_categories (split_config_id, category_id) VALUES ${placeholders}`,
        values
      )
    }

    // Return the full row with categories
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
    `, [newId])

    return NextResponse.json({ ratio: full.rows[0] }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[settings/split POST]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
