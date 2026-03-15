'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { ParsedRow } from '@/lib/parsers'

type Account = 'AMEX' | 'CTFS' | 'CIBC' | 'WS'
type Source  = 'file' | 'sheet'

const ACCOUNT_INFO: Record<Account, { label: string; accepts: string; hint: string; supported: boolean }> = {
  AMEX: {
    label:     'American Express',
    accepts:   '.xls,.xlsx,.csv',
    hint:      'amex.com → Statements → Download (Excel or CSV)',
    supported: true,
  },
  CTFS: {
    label:     'Canadian Tire (Triangle)',
    accepts:   '.csv,.xls,.xlsx',
    hint:      'ctfs.com → My Account → Activity & Statements → Download (CSV)',
    supported: true,
  },
  CIBC: {
    label:     'CIBC',
    accepts:   '.csv',
    hint:      'Coming soon',
    supported: false,
  },
  WS: {
    label:     'Wealthsimple',
    accepts:   '.csv',
    hint:      'Wealthsimple app → Credit Card → Transactions → Export CSV',
    supported: true,
  },
}

function formatCAD(amount: number) {
  return new Intl.NumberFormat('en-CA', {
    style: 'currency', currency: 'CAD', maximumFractionDigits: 2,
  }).format(amount)
}

export default function UploadPage() {
  const router = useRouter()

  const [source,   setSource]   = useState<Source>('file')
  const [account,  setAccount]  = useState<Account>('AMEX')
  const [file,     setFile]     = useState<File | null>(null)
  const [sheetUrl, setSheetUrl] = useState('')
  const [rows,     setRows]     = useState<ParsedRow[] | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [step,     setStep]     = useState<'pick' | 'preview' | 'done'>('pick')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const info = ACCOUNT_INFO[account]

  function switchSource(s: Source) {
    setSource(s)
    setFile(null)
    setSheetUrl('')
    setError(null)
  }

  // ── Step 1a: parse an uploaded file ───────────────────────────

  async function handleParseFile() {
    if (!file) return
    setLoading(true)
    setError(null)

    const form = new FormData()
    form.append('file',    file)
    form.append('account', account)

    const res  = await fetch('/api/upload', { method: 'POST', body: form })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Parse failed'); return }

    finishParse(data.rows)
  }

  // ── Step 1b: fetch a Google Sheet ─────────────────────────────

  async function handleFetchSheet() {
    if (!sheetUrl.trim()) return
    setLoading(true)
    setError(null)

    const res  = await fetch('/api/sheets/fetch', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ url: sheetUrl.trim(), account }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Fetch failed'); return }

    finishParse(data.rows)
  }

  function finishParse(parsed: ParsedRow[]) {
    setRows(parsed)
    setSelected(new Set(parsed.map((_, i) => i)))
    setStep('preview')
  }

  // ── Step 2: import selected rows ──────────────────────────────

  async function handleImport() {
    if (!rows) return
    const toImport = rows.filter((_, i) => selected.has(i))
    if (toImport.length === 0) return

    setLoading(true)
    setError(null)

    const res  = await fetch('/api/transactions/bulk', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ rows: toImport, account }),
    })
    const data = await res.json()
    setLoading(false)

    if (!res.ok) { setError(data.error ?? 'Import failed'); return }

    setStep('done')
    setTimeout(() => router.push('/transactions'), 1500)
  }

  function toggleRow(i: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleAll() {
    if (!rows) return
    if (selected.size === rows.length) setSelected(new Set())
    else setSelected(new Set(rows.map((_, i) => i)))
  }

  // ── Render ─────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-4xl mx-auto">

        <div className="mb-6">
          <a href="/" className="text-sm text-gray-600 hover:text-gray-400 mb-1 block">← fin</a>
          <h1 className="text-2xl font-bold text-gray-100">Import Transactions</h1>
          <p className="text-sm text-gray-500">Upload a file or link a Google Sheet</p>
        </div>

        {/* ── Step: Pick ── */}
        {step === 'pick' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-6 space-y-6">

            {/* Source toggle */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Source</label>
              <div className="flex items-center gap-0.5 bg-gray-800/60 rounded-lg p-0.5 w-fit">
                {([
                  { value: 'file',  label: '📄  File upload'  },
                  { value: 'sheet', label: '📊  Google Sheet' },
                ] as { value: Source; label: string }[]).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => switchSource(opt.value)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      source === opt.value
                        ? 'bg-gray-700 text-gray-200'
                        : 'text-gray-500 hover:text-gray-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Account selector */}
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-2">Account</label>
              <div className="grid grid-cols-4 gap-2">
                {(Object.keys(ACCOUNT_INFO) as Account[]).map(code => {
                  const a = ACCOUNT_INFO[code]
                  return (
                    <button
                      key={code}
                      onClick={() => { if (a.supported) { setAccount(code); setFile(null); setError(null) } }}
                      disabled={!a.supported}
                      className={`p-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                        !a.supported
                          ? 'border-gray-800 text-gray-700 cursor-not-allowed'
                          : account === code
                            ? 'border-blue-500 bg-blue-950/40 text-blue-300'
                            : 'border-gray-700 text-gray-400 hover:border-gray-600'
                      }`}
                    >
                      <div className="font-semibold">{code}</div>
                      <div className="text-xs font-normal opacity-70 mt-0.5">
                        {a.supported ? a.label : 'Coming soon'}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* How-to hint */}
            <div className="bg-gray-800/50 rounded-lg px-4 py-3 text-xs text-gray-500">
              {source === 'sheet' ? (
                <>
                  <span className="text-gray-400 font-medium">How to share: </span>
                  Open your sheet → Share → Change to{' '}
                  <span className="text-gray-400">Anyone with the link → Viewer</span>
                  {' '}→ copy the link and paste below
                </>
              ) : (
                <>
                  <span className="text-gray-400 font-medium">How to export: </span>
                  {info.hint}
                </>
              )}
            </div>

            {/* File picker */}
            {source === 'file' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">File</label>
                <div
                  onClick={() => fileRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
                    file
                      ? 'border-green-700 bg-green-950/20'
                      : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  {file ? (
                    <>
                      <p className="text-green-400 font-medium">{file.name}</p>
                      <p className="text-gray-600 text-xs mt-1">
                        {(file.size / 1024).toFixed(1)} KB · click to change
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-500">Drop file here or click to browse</p>
                      <p className="text-gray-700 text-xs mt-1">Accepts {info.accepts}</p>
                    </>
                  )}
                  <input
                    ref={fileRef}
                    type="file"
                    accept={info.accepts}
                    className="hidden"
                    onChange={e => {
                      setFile(e.target.files?.[0] ?? null)
                      setError(null)
                    }}
                  />
                </div>
              </div>
            )}

            {/* Google Sheet URL input */}
            {source === 'sheet' && (
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-2">
                  Google Sheet URL
                </label>
                <input
                  type="url"
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  value={sheetUrl}
                  onChange={e => { setSheetUrl(e.target.value); setError(null) }}
                  className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-4 py-2.5 text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-gray-600 text-xs mt-1.5">
                  If the sheet has multiple tabs, make sure the right tab is open before copying the URL
                  — the tab ID appears after <code className="text-gray-500">#gid=</code> in the address bar.
                </p>
              </div>
            )}

            {error && (
              <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <button
              onClick={source === 'file' ? handleParseFile : handleFetchSheet}
              disabled={
                loading ||
                (source === 'file'  && !file) ||
                (source === 'sheet' && !sheetUrl.trim())
              }
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? (source === 'file' ? 'Parsing…' : 'Fetching sheet…')
                : (source === 'file' ? 'Parse file'  : 'Fetch sheet')}
            </button>
          </div>
        )}

        {/* ── Step: Preview ── */}
        {step === 'preview' && rows && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-gray-300 font-medium">
                {rows.length} transactions found
                <span className="text-gray-600 font-normal ml-2">
                  · {selected.size} selected · {formatCAD(
                    rows.filter((_, i) => selected.has(i)).reduce((s, r) => s + r.amount, 0)
                  )}
                </span>
              </p>
              <button
                onClick={() => { setStep('pick'); setRows(null); setFile(null) }}
                className="text-sm text-gray-600 hover:text-gray-400"
              >
                ← Back
              </button>
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg px-4 py-3">
                {error}
              </p>
            )}

            <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 bg-gray-800/60">
                    <th className="p-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected.size === rows.length}
                        onChange={toggleAll}
                        className="accent-blue-500"
                      />
                    </th>
                    {['Date', 'Merchant', 'Paid by', 'Amount'].map((h, i) => (
                      <th key={h} className={`p-3 text-xs font-medium text-gray-500 ${i >= 3 ? 'text-right' : 'text-left'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr
                      key={i}
                      onClick={() => toggleRow(i)}
                      className={`border-b border-gray-800/50 cursor-pointer transition-colors ${
                        selected.has(i) ? 'hover:bg-gray-800/50' : 'opacity-40 hover:opacity-60'
                      }`}
                    >
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.has(i)}
                          onChange={() => toggleRow(i)}
                          onClick={e => e.stopPropagation()}
                          className="accent-blue-500"
                        />
                      </td>
                      <td className="p-3 text-gray-500 text-xs">{row.date}</td>
                      <td className="p-3 text-gray-200">{row.merchant}</td>
                      <td className="p-3">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          row.paidBy === 'Shirley'
                            ? 'bg-purple-950 text-purple-400'
                            : 'bg-blue-950 text-blue-400'
                        }`}>
                          {row.paidBy}
                        </span>
                      </td>
                      <td className="p-3 text-right text-gray-200 text-xs font-medium">
                        {formatCAD(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <button
              onClick={handleImport}
              disabled={selected.size === 0 || loading}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading
                ? 'Importing…'
                : `Import ${selected.size} transaction${selected.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        )}

        {/* ── Step: Done ── */}
        {step === 'done' && (
          <div className="bg-gray-900 rounded-xl border border-gray-800 p-12 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="text-gray-300 font-medium">Import complete</p>
            <p className="text-gray-600 text-sm mt-1">Redirecting to transactions…</p>
          </div>
        )}

      </div>
    </main>
  )
}
