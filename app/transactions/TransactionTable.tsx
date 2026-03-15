'use client'
// ↑ This line makes this a Client Component.
//   It runs in the browser, so it can respond to clicks,
//   manage state (what's selected, what's open), etc.

import { useState } from 'react'
import { useRouter } from 'next/navigation'
// useRouter gives us access to the Next.js router.
// router.refresh() re-runs the server component and
// pulls fresh data from the database — without a full page reload.
// useState is React's way of remembering things between renders.
// Example: "which transaction row is currently selected?"
// Without useState, every click would be forgotten immediately.

// Re-using the same Transaction type from the page.
// In a real app we'd put shared types in a separate file (types.ts)
// and import from there. We'll do that later.
type Transaction = {
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

const CATEGORIES = [
  'Groceries', 'Restaurants', 'Alcohol',
  'Mortgage', 'Property Tax', 'Home Insurance', 'HELOC',
  'Gas', 'Parking', 'Transit',
  'Streaming', 'Entertainment',
  'Clothing', 'Health', 'Pharmacy',
  'Other',
]

function formatCAD(amount: number) {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount)
}

function accountColour(account: string) {
  const colours: Record<string, string> = {
    CIBC: 'bg-red-100 text-red-700',
    AMEX: 'bg-blue-100 text-blue-700',
    CTFS: 'bg-green-100 text-green-700',
    WS:   'bg-purple-100 text-purple-700',
  }
  return colours[account] ?? 'bg-gray-100 text-gray-700'
}

// ── PROPS ──────────────────────────────────────
// "Props" are the inputs a component receives from its parent.
// This component receives the list of transactions from page.tsx.
// Think of it like a function parameter.
type Props = {
  transactions: Transaction[]
}

export default function TransactionTable({ transactions }: Props) {

  const router = useRouter()

  // useState stores which transaction ID is currently being edited.
  // selectedId = the current value (null means nothing selected)
  // setSelectedId = the function to change it
  // null = initial value (nothing selected at start)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // Find the full transaction object for the selected row
  const selected = transactions.find(t => t.id === selectedId)

  // Local edits — what the user has changed in the edit panel
  // We start with the selected transaction's current values
  const [editCategory, setEditCategory] = useState('')
  const [editType, setEditType]         = useState<'joint' | 'personal'>('joint')

  // Called when user clicks a row
  function handleRowClick(t: Transaction) {
    setSelectedId(t.id)
    setEditCategory(t.category)
    setEditType(t.type)
  }

  // Called when user clicks Save in the edit panel
  async function handleSave() {
    if (!selectedId) return

    // Send a PATCH request to our API route
    // fetch() is the browser's built-in way to call APIs
    const response = await fetch(`/api/transactions/${selectedId}`, {
      method: 'PATCH',
      // Always set this header when sending JSON
      headers: { 'Content-Type': 'application/json' },
      // JSON.stringify converts the JS object → a JSON string
      body: JSON.stringify({ category: editCategory, type: editType }),
    })

    // Parse the JSON response from the server
    const result = await response.json()
    console.log('Server response:', result)

    // Close the edit panel
    setSelectedId(null)

    // Tell Next.js to re-run the server component.
    // This re-queries the database and updates the table
    // with the latest data — no manual refresh needed.
    router.refresh()
  }

  return (
    <div className="flex gap-6">

      {/* ── Transaction table ── */}
      <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left p-4 font-medium text-gray-500">Date</th>
              <th className="text-left p-4 font-medium text-gray-500">Merchant</th>
              <th className="text-left p-4 font-medium text-gray-500">Account</th>
              <th className="text-left p-4 font-medium text-gray-500">Category</th>
              <th className="text-left p-4 font-medium text-gray-500">Type</th>
              <th className="text-right p-4 font-medium text-gray-500">Amount</th>
              <th className="text-right p-4 font-medium text-gray-500">Shirley</th>
              <th className="text-right p-4 font-medium text-gray-500">Johnson</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => (
              <tr
                key={t.id}
                // Clicking a row calls handleRowClick with that transaction
                onClick={() => handleRowClick(t)}
                className={`border-b border-gray-50 cursor-pointer transition-colors ${
                  // Highlight the selected row in blue
                  selectedId === t.id
                    ? 'bg-blue-50 border-blue-100'
                    : 'hover:bg-gray-50'
                }`}
              >
                <td className="p-4 text-gray-500">{t.date}</td>
                <td className="p-4 font-medium text-gray-900">{t.merchant}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${accountColour(t.account)}`}>
                    {t.account}
                  </span>
                </td>
                <td className="p-4 text-gray-600">{t.category}</td>
                <td className="p-4">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    t.type === 'joint'
                      ? 'bg-orange-100 text-orange-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}>
                    {t.type}
                  </span>
                </td>
                <td className="p-4 text-right font-medium text-gray-900">{formatCAD(t.amount)}</td>
                <td className="p-4 text-right text-blue-600">{formatCAD(t.shirleyShare)}</td>
                <td className="p-4 text-right text-green-600">{formatCAD(t.johnsonShare)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Edit panel — only shows when a row is selected ── */}
      {selected && (
        <div className="w-72 bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Edit Transaction</h3>
            {/* × button closes the panel */}
            <button
              onClick={() => setSelectedId(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >
              ×
            </button>
          </div>

          {/* Show the transaction details (read-only) */}
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="font-medium text-gray-900 text-sm">{selected.merchant}</p>
            <p className="text-gray-500 text-xs mt-0.5">{selected.date} · {formatCAD(selected.amount)}</p>
          </div>

          {/* Category dropdown */}
          <div className="mb-4">
            <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
            <select
              value={editCategory}
              // onChange fires every time the dropdown value changes
              // e.target.value is the newly selected option
              onChange={(e) => setEditCategory(e.target.value)}
              className="w-full border border-gray-200 rounded-lg p-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>

          {/* Joint / Personal toggle */}
          <div className="mb-6">
            <label className="block text-xs font-medium text-gray-500 mb-2">Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setEditType('joint')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editType === 'joint'
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-gray-100 text-gray-500 border border-transparent'
                }`}
              >
                Joint
              </button>
              <button
                onClick={() => setEditType('personal')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                  editType === 'personal'
                    ? 'bg-gray-200 text-gray-700 border border-gray-300'
                    : 'bg-gray-100 text-gray-500 border border-transparent'
                }`}
              >
                Personal
              </button>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700"
          >
            Save changes
          </button>
        </div>
      )}

    </div>
  )
}
