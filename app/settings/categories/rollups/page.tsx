import { query } from '@/lib/db'
import RollupsClient, { type RollupGroup } from './RollupsClient'

export default async function RollupsPage() {
  // Load both roll-up levels with their category counts in one query
  const result = await query(`
    SELECT
      roll_up_1,
      roll_up_2,
      COUNT(*) AS count
    FROM categories
    GROUP BY roll_up_1, roll_up_2
    ORDER BY roll_up_1
  `)

  // Distinct roll_up_1 groups
  const byRu1 = new Map<string, number>()
  for (const row of result.rows) {
    byRu1.set(row.roll_up_1, (byRu1.get(row.roll_up_1) ?? 0) + parseInt(row.count, 10))
  }

  // Distinct roll_up_2 groups
  const byRu2 = new Map<string, number>()
  for (const row of result.rows) {
    byRu2.set(row.roll_up_2, (byRu2.get(row.roll_up_2) ?? 0) + parseInt(row.count, 10))
  }

  const rollup1Groups: RollupGroup[] = Array.from(byRu1.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  const rollup2Groups: RollupGroup[] = Array.from(byRu2.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-3xl mx-auto">

        <div className="mb-8">
          <a href="/settings/categories" className="text-sm text-gray-600 hover:text-gray-400 mb-1 block">
            ← categories
          </a>
          <h1 className="text-2xl font-bold text-gray-100">Roll-up Groups</h1>
          <p className="text-sm text-gray-500">
            Rename or remove groupings. Deleting a group requires remapping its categories first.
          </p>
        </div>

        <RollupsClient rollup1Groups={rollup1Groups} rollup2Groups={rollup2Groups} />

      </div>
    </main>
  )
}
