import { query } from '@/lib/db'
import SettingsClient, { type SplitRow, type AccountRow, type CategoryRow } from './SettingsClient'

export default async function SettingsPage() {

  const [ratiosResult, accountsResult, categoriesResult] = await Promise.all([
    query(`
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
    `),
    query(`
      SELECT id, code, name
      FROM accounts
      ORDER BY code
    `),
    query(`
      SELECT id, name
      FROM categories
      ORDER BY name
    `),
  ])

  const ratios:     SplitRow[]     = ratiosResult.rows
  const accounts:   AccountRow[]   = accountsResult.rows
  const categories: CategoryRow[]  = categoriesResult.rows

  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8">
          <a href="/" className="text-sm text-gray-600 hover:text-gray-400 mb-1 block">← fin</a>
          <h1 className="text-2xl font-bold text-gray-100">Settings</h1>
          <p className="text-sm text-gray-500">Split ratios and account configuration</p>
        </div>

        <SettingsClient ratios={ratios} accounts={accounts} categories={categories} />

        {/* Quick links to sub-pages */}
        <div className="mt-10 pt-6 border-t border-gray-800">
          <h2 className="text-sm font-medium text-gray-500 mb-3">More settings</h2>
          <a
            href="/settings/categories"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-400 hover:border-gray-700 hover:text-gray-200 transition-colors"
          >
            <span>🏷</span>
            <span>Categories & roll-ups</span>
          </a>
        </div>

      </div>
    </main>
  )
}
