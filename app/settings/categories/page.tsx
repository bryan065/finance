import { query } from '@/lib/db'
import CategoriesClient, { type CategoryRow } from './CategoriesClient'

export default async function CategoriesPage() {
  const result = await query(`
    SELECT id, name, roll_up_1, roll_up_2, is_housing
    FROM categories
    ORDER BY roll_up_1, name
  `)

  const categories: CategoryRow[] = result.rows

  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-8">
          <a href="/settings" className="text-sm text-gray-600 hover:text-gray-400 mb-1 block">← settings</a>
          <h1 className="text-2xl font-bold text-gray-100">Categories</h1>
          <p className="text-sm text-gray-500">
            Manage spending categories and their roll-up groupings.
          </p>
        </div>

        <CategoriesClient categories={categories} />

        <div className="mt-10 pt-6 border-t border-gray-800">
          <h2 className="text-sm font-medium text-gray-500 mb-3">Manage groupings</h2>
          <a
            href="/settings/categories/rollups"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-800 rounded-xl text-sm text-gray-400 hover:border-gray-700 hover:text-gray-200 transition-colors"
          >
            <span>📂</span>
            <span>Roll-up groups</span>
          </a>
        </div>

      </div>
    </main>
  )
}
