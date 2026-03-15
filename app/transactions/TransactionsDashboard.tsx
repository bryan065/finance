'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  PieChart, Pie, Cell, Tooltip as PieTooltip,
  BarChart, Bar, XAxis, YAxis, Tooltip as BarTooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'
import type { Transaction } from './page'

// ── Constants ─────────────────────────────────

const CHART_COLORS = [
  '#60a5fa', // blue
  '#34d399', // emerald
  '#f472b6', // pink
  '#fb923c', // orange
  '#a78bfa', // violet
  '#fbbf24', // amber
  '#22d3ee', // cyan
  '#f87171', // red
]

// Time horizon — only used when period mode is 'month'
const TIME_HORIZONS = [
  { label: '3M',  months: 3  },
  { label: '6M',  months: 6  },
  { label: '12M', months: 12 },
  { label: 'All', months: 999 },
]

const CATEGORIES = [
  'Groceries', 'Restaurants', 'Coffee', 'Alcohol', 'Food Delivery',
  'Mortgage', 'HELOC', 'Property Tax', 'Home Insurance', 'Home Maintenance',
  'Gas', 'Parking', 'Transit', 'Car Insurance', 'Car Maintenance',
  'Streaming', 'Entertainment', 'Travel',
  'Clothing', 'Health', 'Pharmacy', 'Gym',
  'Internet', 'Phone', 'Hydro', 'Other',
]

const ROLL_UPS = [
  'Housing', 'Food & Dining', 'Transport', 'Entertainment',
  'Health', 'Utilities', 'Lifestyle', 'Other',
]

// ── Period types ───────────────────────────────

type Period =
  | { mode: 'month';   month: string }
  | { mode: 'quarter'; year: number; q: 1 | 2 | 3 | 4 }
  | { mode: 'fy';      year: number }
  | { mode: 'all' }

function periodLabel(p: Period): string {
  switch (p.mode) {
    case 'month':   return formatMonth(p.month)
    case 'quarter': return `Q${p.q} ${p.year}`
    case 'fy':      return `FY ${p.year}`
    case 'all':     return 'All Time'
  }
}

function inPeriod(t: Transaction, p: Period): boolean {
  const m = t.date.slice(0, 7)
  switch (p.mode) {
    case 'month':
      return m === p.month
    case 'quarter': {
      const sm = (p.q - 1) * 3 + 1
      const start = `${p.year}-${String(sm).padStart(2, '0')}`
      const end   = `${p.year}-${String(sm + 2).padStart(2, '0')}`
      return m >= start && m <= end
    }
    case 'fy':
      return m >= `${p.year}-01` && m <= `${p.year}-12`
    case 'all':
      return true
  }
}

// ── Helpers ───────────────────────────────────

function formatCAD(amount: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
  }).format(amount)
}

// "2026-03" → "Mar 2026"
function formatMonth(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1)
    .toLocaleString('en-CA', { month: 'short', year: 'numeric' })
}

// "2026-03" → "Mar"
function formatMonthShort(ym: string) {
  const [y, m] = ym.split('-')
  return new Date(parseInt(y), parseInt(m) - 1)
    .toLocaleString('en-CA', { month: 'short' })
}

function accountBadge(account: string) {
  const styles: Record<string, string> = {
    CIBC: 'bg-red-950 text-red-400',
    AMEX: 'bg-blue-950 text-blue-400',
    CTFS: 'bg-green-950 text-green-400',
    WS:   'bg-purple-950 text-purple-400',
  }
  return styles[account] ?? 'bg-gray-800 text-gray-400'
}

// ── Component ─────────────────────────────────

type Props = { transactions: Transaction[] }

export default function TransactionsDashboard({ transactions }: Props) {
  const router = useRouter()

  // ── Derived month / year lists ─────────────────────────────

  const availableMonths = useMemo(() => {
    const months = new Set(transactions.map(t => t.date.slice(0, 7)))
    return Array.from(months).sort().reverse()
  }, [transactions])

  const availableYears = useMemo(() => {
    const years = new Set(availableMonths.map(m => parseInt(m.slice(0, 4))))
    return Array.from(years).sort().reverse()
  }, [availableMonths])

  // ── Period state ──────────────────────────────

  const defaultPeriod: Period = useMemo(() => ({
    mode: 'month',
    month: availableMonths[0] ?? '',
  }), []) // intentionally no deps — only compute once on mount

  const [period, setPeriod] = useState<Period>(defaultPeriod)

  function switchMode(mode: Period['mode']) {
    const latestMonth = availableMonths[0] ?? ''
    const latestYear  = availableYears[0]  ?? new Date().getFullYear()
    const now         = new Date()
    const currentQ    = Math.ceil((now.getMonth() + 1) / 3) as 1 | 2 | 3 | 4

    switch (mode) {
      case 'month':
        setPeriod({ mode: 'month', month: latestMonth })
        break
      case 'quarter':
        setPeriod({ mode: 'quarter', year: latestYear, q: currentQ })
        break
      case 'fy':
        setPeriod({ mode: 'fy', year: latestYear })
        break
      case 'all':
        setPeriod({ mode: 'all' })
        break
    }
  }

  // ── Other filter state ────────────────────────

  const [selectedAccount,  setSelectedAccount]  = useState('')   // '' = all
  const [selectedCategory, setSelectedCategory] = useState('')   // '' = all
  const [timeHorizon,      setTimeHorizon]      = useState(6)   // only for month mode

  const availableAccounts = useMemo(() => {
    const seen = new Set(transactions.map(t => t.account))
    return (['CIBC', 'AMEX', 'CTFS', 'WS'] as const).filter(a => seen.has(a))
  }, [transactions])

  // ── Edit state ────────────────────────────────

  const [selectedId,   setSelectedId]   = useState<string | null>(null)
  const [editCategory, setEditCategory] = useState('')
  const [editType,     setEditType]     = useState<'joint' | 'personal'>('joint')
  const [editPaidBy,   setEditPaidBy]   = useState<'Shirley' | 'Johnson'>('Shirley')

  // ── Derived data ──────────────────────────────

  // Transactions in the selected period + account filter
  const periodTransactions = useMemo(() =>
    transactions.filter(t =>
      inPeriod(t, period) &&
      (selectedAccount === '' || t.account === selectedAccount)
    ),
    [transactions, period, selectedAccount]
  )

  // Filtered by category too (what the table shows)
  const tableTransactions = useMemo(() =>
    selectedCategory
      ? periodTransactions.filter(t =>
          t.category === selectedCategory || t.rollUp === selectedCategory)
      : periodTransactions,
    [periodTransactions, selectedCategory]
  )

  // Pie chart: joint spend by roll-up for the selected period
  const pieData = useMemo(() => {
    const byRollUp: Record<string, number> = {}
    periodTransactions
      .filter(t => t.type === 'joint')
      .forEach(t => { byRollUp[t.rollUp] = (byRollUp[t.rollUp] ?? 0) + t.amount })
    return Object.entries(byRollUp)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
  }, [periodTransactions])

  // Bar chart: monthly spend — range depends on period mode
  const timelineData = useMemo(() => {
    // Decide which months to bucket
    let monthsToShow: string[]

    if (period.mode === 'month') {
      // Use the time horizon lookback
      monthsToShow = availableMonths.slice(0, timeHorizon)
    } else if (period.mode === 'quarter') {
      // The 3 months of the selected quarter
      const sm = (period.q - 1) * 3 + 1
      monthsToShow = [0, 1, 2]
        .map(i => `${period.year}-${String(sm + i).padStart(2, '0')}`)
    } else if (period.mode === 'fy') {
      // All 12 months of the selected year
      monthsToShow = Array.from({ length: 12 }, (_, i) =>
        `${period.year}-${String(i + 1).padStart(2, '0')}`
      )
    } else {
      // All available months, oldest first
      monthsToShow = [...availableMonths].reverse()
    }

    // Initialise every month to 0 so bars show even with no spend
    const byMonth: Record<string, number> = {}
    monthsToShow.forEach(m => { byMonth[m] = 0 })

    transactions
      .filter(t => {
        const m = t.date.slice(0, 7)
        if (!Object.prototype.hasOwnProperty.call(byMonth, m)) return false
        if (selectedAccount  && t.account  !== selectedAccount)  return false
        if (selectedCategory &&
            t.category !== selectedCategory &&
            t.rollUp   !== selectedCategory) return false
        return true
      })
      .forEach(t => {
        const m = t.date.slice(0, 7)
        byMonth[m] = (byMonth[m] ?? 0) + t.amount
      })

    return monthsToShow
      .map(m => ({
        month:  period.mode === 'fy' || period.mode === 'all'
                  ? formatMonthShort(m)
                  : formatMonth(m),
        amount: Math.round(byMonth[m] ?? 0),
      }))
  }, [transactions, period, selectedAccount, selectedCategory, timeHorizon, availableMonths])

  // Summary numbers for the currently visible table rows
  const totalSpend   = tableTransactions.reduce((s, t) => s + t.amount, 0)
  const shirleyTotal = tableTransactions.reduce((s, t) => s + t.shirleyShare, 0)
  const johnsonTotal = tableTransactions.reduce((s, t) => s + t.johnsonShare, 0)
  const jointCount   = tableTransactions.filter(t => t.type === 'joint').length

  const selected = transactions.find(t => t.id === selectedId)

  // ── Handlers ──────────────────────────────────

  function handleRowClick(t: Transaction) {
    setSelectedId(t.id)
    setEditCategory(t.category)
    setEditType(t.type)
    setEditPaidBy(t.paidBy)
  }

  async function handleSave() {
    if (!selectedId) return
    await fetch(`/api/transactions/${selectedId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        category: editCategory,
        type:     editType,
        ...(editType === 'personal' ? { paidBy: editPaidBy } : {}),
      }),
    })
    setSelectedId(null)
    router.refresh()
  }

  // ── Render ────────────────────────────────────

  return (
    <div className="space-y-4">

      {/* ── Filters ── */}
      <div className="flex flex-wrap items-center gap-3">

        {/* Period mode tabs */}
        <div className="flex items-center gap-0.5 bg-gray-900 border border-gray-800 rounded-lg p-0.5">
          {(['month', 'quarter', 'fy', 'all'] as const).map(mode => (
            <button
              key={mode}
              onClick={() => switchMode(mode)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                period.mode === mode
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {mode === 'month' ? 'Month' : mode === 'quarter' ? 'Quarter' : mode === 'fy' ? 'FY' : 'All Time'}
            </button>
          ))}
        </div>

        {/* Period value selector */}
        {period.mode === 'month' && (
          <select
            value={period.month}
            onChange={e => setPeriod({ mode: 'month', month: e.target.value })}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableMonths.map(m => (
              <option key={m} value={m}>{formatMonth(m)}</option>
            ))}
          </select>
        )}

        {period.mode === 'quarter' && (
          <div className="flex items-center gap-2">
            <select
              value={period.year}
              onChange={e => setPeriod({ mode: 'quarter', year: parseInt(e.target.value), q: period.q })}
              className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <div className="flex items-center gap-0.5">
              {([1, 2, 3, 4] as const).map(q => (
                <button
                  key={q}
                  onClick={() => setPeriod({ mode: 'quarter', year: period.year, q })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    period.q === q
                      ? 'bg-gray-700 text-gray-200'
                      : 'text-gray-600 hover:text-gray-400 border border-transparent hover:border-gray-700'
                  }`}
                >
                  Q{q}
                </button>
              ))}
            </div>
          </div>
        )}

        {period.mode === 'fy' && (
          <select
            value={period.year}
            onChange={e => setPeriod({ mode: 'fy', year: parseInt(e.target.value) })}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {availableYears.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        )}

        {/* Account pills */}
        <div className="flex items-center gap-1 ml-1">
          {(['', ...availableAccounts] as string[]).map(code => (
            <button
              key={code || 'all'}
              onClick={() => setSelectedAccount(code)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                selectedAccount === code
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-600 hover:text-gray-400'
              }`}
            >
              {code || 'All'}
            </button>
          ))}
        </div>

        {/* Category filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Category</span>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="bg-gray-900 border border-gray-700 text-gray-200 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All</option>
            <optgroup label="Roll-ups">
              {ROLL_UPS.map(r => <option key={r} value={r}>{r}</option>)}
            </optgroup>
            <optgroup label="Categories">
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </optgroup>
          </select>
        </div>

        {selectedCategory && (
          <button
            onClick={() => setSelectedCategory('')}
            className="text-xs text-gray-600 hover:text-gray-400 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Summary cards ── */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total Spend', value: formatCAD(totalSpend),   color: 'text-gray-100'   },
          { label: 'Joint',       value: `${jointCount} / ${tableTransactions.length}`, color: 'text-gray-100' },
          { label: 'Shirley',     value: formatCAD(shirleyTotal), color: 'text-purple-400' },
          { label: 'Johnson',     value: formatCAD(johnsonTotal), color: 'text-blue-400'   },
        ].map(card => (
          <div key={card.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* ── Charts row ── */}
      <div className="flex gap-4">

        {/* Pie: spend by roll-up for the selected period */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex-1">
          <h3 className="text-xs font-medium text-gray-500 mb-3">
            {periodLabel(period)} · spend by category
          </h3>
          {pieData.length === 0 ? (
            <p className="text-center text-gray-700 text-xs py-10">No data</p>
          ) : (
            <div className="flex items-center gap-6">
              <ResponsiveContainer width={180} height={180}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%" cy="50%"
                    innerRadius={50} outerRadius={82}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <PieTooltip
                    formatter={(v) => formatCAD(v as number)}
                    contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', fontSize: '12px' }}
                    itemStyle={{ color: '#9ca3af' }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 flex-1">
                {pieData.map((d, i) => (
                  <div key={d.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-xs text-gray-400">{d.name}</span>
                    </div>
                    <span className="text-xs text-gray-500 ml-4">{formatCAD(d.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Bar: spend over time */}
        <div className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex-1">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-medium text-gray-500">
              {selectedCategory || 'Total spend'} over time
            </h3>
            {/* Time horizon picker — only relevant in Month mode */}
            {period.mode === 'month' && (
              <div className="flex gap-0.5">
                {TIME_HORIZONS.map(h => (
                  <button
                    key={h.label}
                    onClick={() => setTimeHorizon(h.months)}
                    className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
                      timeHorizon === h.months
                        ? 'bg-blue-600 text-white'
                        : 'text-gray-600 hover:text-gray-400'
                    }`}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={timelineData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#4b5563', fontSize: 10 }} axisLine={false} tickLine={false} />
              <BarTooltip
                formatter={(v) => formatCAD(v as number)}
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #1f2937', borderRadius: '8px', fontSize: '12px' }}
                labelStyle={{ color: '#d1d5db' }}
                cursor={{ fill: 'rgba(255,255,255,0.03)' }}
              />
              <Bar dataKey="amount" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

      </div>

      {/* ── Table + edit panel ── */}
      <div className="flex gap-4 items-start">

        <div className="flex-1 min-w-0 bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 bg-gray-800/60">
                {['Date', 'Merchant', 'Acct', 'Category', 'Type', 'Amount', 'Shirley', 'Johnson'].map((h, i) => (
                  <th key={h} className={`p-3 font-medium text-gray-500 text-xs ${i >= 5 ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableTransactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-gray-700 text-sm">
                    No transactions for this period
                  </td>
                </tr>
              ) : tableTransactions.map(t => (
                <tr
                  key={t.id}
                  onClick={() => handleRowClick(t)}
                  className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                    selectedId === t.id ? 'bg-blue-950/40' : 'hover:bg-gray-800/50'
                  }`}
                >
                  <td className="p-3 text-gray-500 text-xs">{t.date}</td>
                  <td className="p-3 font-medium text-gray-200">{t.merchant}</td>
                  <td className="p-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${accountBadge(t.account)}`}>
                      {t.account}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400 text-xs">{t.category}</td>
                  <td className="p-3">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      t.type === 'joint'
                        ? 'bg-orange-950 text-orange-400'
                        : t.paidBy === 'Shirley'
                          ? 'bg-purple-950 text-purple-400'
                          : 'bg-blue-950 text-blue-400'
                    }`}>
                      {t.type === 'joint' ? 'joint' : t.paidBy}
                    </span>
                  </td>
                  <td className="p-3 text-right font-medium text-gray-200 text-xs">{formatCAD(t.amount)}</td>
                  <td className="p-3 text-right text-purple-400 text-xs">{formatCAD(t.shirleyShare)}</td>
                  <td className="p-3 text-right text-blue-400 text-xs">{formatCAD(t.johnsonShare)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Edit panel */}
        {selected && (
          <div className="w-64 shrink-0 bg-gray-900 rounded-xl border border-gray-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-200 text-sm">Edit</h3>
              <button onClick={() => setSelectedId(null)} className="text-gray-600 hover:text-gray-400 text-xl leading-none">×</button>
            </div>
            <div className="mb-3 p-2.5 bg-gray-800 rounded-lg">
              <p className="font-medium text-gray-200 text-sm">{selected.merchant}</p>
              <p className="text-gray-500 text-xs mt-0.5">{selected.date} · {formatCAD(selected.amount)}</p>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1">Category</label>
              <select
                value={editCategory}
                onChange={e => setEditCategory(e.target.value)}
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
              <div className="flex gap-2">
                {(['joint', 'personal'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setEditType(type)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                      editType === type
                        ? type === 'joint'
                          ? 'bg-orange-950 text-orange-400 border border-orange-900'
                          : 'bg-gray-700 text-gray-300 border border-gray-600'
                        : 'bg-gray-800 text-gray-600 border border-transparent'
                    }`}
                  >
                    {type}
                  </button>
                ))}
              </div>
            </div>
            {editType === 'personal' && (
              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Personal to</label>
                <div className="flex gap-2">
                  {(['Shirley', 'Johnson'] as const).map(person => (
                    <button
                      key={person}
                      onClick={() => setEditPaidBy(person)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        editPaidBy === person
                          ? person === 'Shirley'
                            ? 'bg-purple-950 text-purple-400 border border-purple-900'
                            : 'bg-blue-950 text-blue-400 border border-blue-900'
                          : 'bg-gray-800 text-gray-600 border border-transparent'
                      }`}
                    >
                      {person}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button
              onClick={handleSave}
              className="w-full py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
            >
              Save changes
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
