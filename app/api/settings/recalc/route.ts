// POST /api/settings/recalc
// Recalculates shirley_share and johnson_share for all joint transactions
// using the current split_config ratios (same three-tier fallback as getSplitRatio).
//
// Tier 1: category-specific ratio for the transaction's year
// Tier 2: catch-all ratio for the year (no categories assigned)
// Tier 3: any ratio for the year (backward compat)
//
// Transactions with no matching ratio in any tier are left unchanged.
// Personal transactions are always left unchanged.
// Returns { updated: number, skipped: number }

import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

export async function POST() {
  try {
    const result = await query(`
      WITH resolved AS (
        SELECT
          t.id,
          t.amount,
          COALESCE(
            -- Tier 1: category-specific ratio
            (
              SELECT sc.shirley_ratio::float
              FROM split_config sc
              JOIN split_config_categories scc ON scc.split_config_id = sc.id
              WHERE sc.year = EXTRACT(YEAR FROM t.date)::int
                AND scc.category_id = t.category_id
              LIMIT 1
            ),
            -- Tier 2: catch-all for the year (no categories assigned)
            (
              SELECT sc.shirley_ratio::float
              FROM split_config sc
              WHERE sc.year = EXTRACT(YEAR FROM t.date)::int
                AND NOT EXISTS (
                  SELECT 1 FROM split_config_categories scc
                  WHERE scc.split_config_id = sc.id
                )
              LIMIT 1
            ),
            -- Tier 3: any ratio for the year
            (
              SELECT sc.shirley_ratio::float
              FROM split_config sc
              WHERE sc.year = EXTRACT(YEAR FROM t.date)::int
              LIMIT 1
            )
          ) AS shirley_ratio,
          COALESCE(
            (
              SELECT sc.johnson_ratio::float
              FROM split_config sc
              JOIN split_config_categories scc ON scc.split_config_id = sc.id
              WHERE sc.year = EXTRACT(YEAR FROM t.date)::int
                AND scc.category_id = t.category_id
              LIMIT 1
            ),
            (
              SELECT sc.johnson_ratio::float
              FROM split_config sc
              WHERE sc.year = EXTRACT(YEAR FROM t.date)::int
                AND NOT EXISTS (
                  SELECT 1 FROM split_config_categories scc
                  WHERE scc.split_config_id = sc.id
                )
              LIMIT 1
            ),
            (
              SELECT sc.johnson_ratio::float
              FROM split_config sc
              WHERE sc.year = EXTRACT(YEAR FROM t.date)::int
              LIMIT 1
            )
          ) AS johnson_ratio
        FROM transactions t
        WHERE t.type = 'joint'
      )
      UPDATE transactions t
      SET
        shirley_share = ROUND((r.amount * r.shirley_ratio)::numeric, 2),
        johnson_share = ROUND((r.amount * r.johnson_ratio)::numeric, 2)
      FROM resolved r
      WHERE t.id = r.id
        AND r.shirley_ratio IS NOT NULL
      RETURNING t.id
    `)

    // Count joint transactions that had no matching ratio (skipped)
    const totalJoint = await query(
      `SELECT COUNT(*) AS n FROM transactions WHERE type = 'joint'`
    )
    const total   = parseInt(totalJoint.rows[0].n, 10)
    const updated = result.rows.length
    const skipped = total - updated

    return NextResponse.json({ updated, skipped })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[settings/recalc]', err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
