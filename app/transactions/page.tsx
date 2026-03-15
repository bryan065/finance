import { query } from '@/lib/db'
import TransactionsDashboard from './TransactionsDashboard'
import RecategorizeButton from './RecategorizeButton'

export type Transaction = {
  id: string
  date: string
  merchant: string
  amount: number
  account: 'CIBC' | 'AMEX' | 'CTFS' | 'WS'
  category: string
  rollUp: string
  type: 'joint' | 'personal'
  paidBy: 'Shirley' | 'Johnson'
  shirleyShare: number
  johnsonShare: number
}


export default async function TransactionsPage() {

  // Load all transactions — FY / All Time views need the full history
  const result = await query(`
    SELECT
      t.id::text,
      t.date::text,
      t.merchant,
      t.amount::float,
      a.code        AS account,
      c.name        AS category,
      c.roll_up_1   AS "rollUp",
      t.type,
      t.paid_by     AS "paidBy",
      t.shirley_share::float AS "shirleyShare",
      t.johnson_share::float AS "johnsonShare"
    FROM transactions t
    JOIN accounts   a ON a.id = t.account_id
    JOIN categories c ON c.id = t.category_id
    ORDER BY t.date DESC, t.id DESC
  `)

  const transactions: Transaction[] = result.rows

  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-7xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <a href="/" className="text-sm text-gray-600 hover:text-gray-400 mb-1 block">← fin</a>
            <h1 className="text-2xl font-bold text-gray-100">Transactions</h1>
            <p className="text-sm text-gray-500">{transactions.length} transactions</p>
          </div>
          <div className="flex items-center gap-3">
            <RecategorizeButton />
            <a href="/upload" className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors">
              + Upload Statement
            </a>
          </div>
        </div>

        <TransactionsDashboard transactions={transactions} />

      </div>
    </main>
  )
}
