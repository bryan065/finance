// lib/split.ts
// ─────────────────────────────────────────────
// Looks up the split ratio for a (year, categoryName) pair.
//
// Resolution order:
//  1. Ratio that explicitly has this category assigned for this year
//  2. Ratio for this year with NO categories assigned (catch-all / default)
//  3. First ratio for this year (last-resort backward compat)
//  4. Throws if none found
// ─────────────────────────────────────────────

import { query } from '@/lib/db'

export type SplitRatio = { shirley: number; johnson: number }

export async function getSplitRatio(
  year: number,
  categoryName: string
): Promise<SplitRatio> {

  // 1. Category-specific match
  const specific = await query(`
    SELECT sc.shirley_ratio::float, sc.johnson_ratio::float
    FROM split_config sc
    JOIN split_config_categories scc ON scc.split_config_id = sc.id
    JOIN categories c ON c.id = scc.category_id
    WHERE sc.year = $1 AND c.name = $2
    LIMIT 1
  `, [year, categoryName])

  if (specific.rows.length > 0) {
    return { shirley: specific.rows[0].shirley_ratio, johnson: specific.rows[0].johnson_ratio }
  }

  // 2. Catch-all: ratio for this year that has zero categories assigned
  const catchAll = await query(`
    SELECT sc.shirley_ratio::float, sc.johnson_ratio::float
    FROM split_config sc
    WHERE sc.year = $1
      AND NOT EXISTS (
        SELECT 1 FROM split_config_categories scc
        WHERE scc.split_config_id = sc.id
      )
    LIMIT 1
  `, [year])

  if (catchAll.rows.length > 0) {
    return { shirley: catchAll.rows[0].shirley_ratio, johnson: catchAll.rows[0].johnson_ratio }
  }

  // 3. Any ratio for this year (backward compat with old single-ratio setup)
  const any = await query(
    'SELECT shirley_ratio::float, johnson_ratio::float FROM split_config WHERE year = $1 LIMIT 1',
    [year]
  )

  if (any.rows.length > 0) {
    return { shirley: any.rows[0].shirley_ratio, johnson: any.rows[0].johnson_ratio }
  }

  throw new Error(`No split config found for year ${year}`)
}
