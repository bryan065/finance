// Parser for Wealthsimple Cash (credit card) CSV export
//
// How to export from Wealthsimple:
//   App or web → Credit Card → Transactions → Export (CSV)
//
// CSV columns:
//   transaction_date, post_date, type, details, amount, currency
//
// - transaction_date is already ISO (YYYY-MM-DD) — use it directly
// - details is the merchant name
// - type "Payment" rows are skipped (negative amounts, internal transfers)
// - paidBy defaults to 'Shirley'; override on the Transactions page if needed

import * as XLSX from 'xlsx'
import type { ParsedRow } from './types'

export function parseWSCsv(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const allRows = XLSX.utils.sheet_to_json<Record<string, string>>(ws, { defval: '' })

  if (allRows.length === 0) throw new Error('WS CSV appears to be empty')

  // Normalise header names to lowercase for flexible matching
  const rows: ParsedRow[] = []

  for (const row of allRows) {
    // Build a lowercase-keyed version so we're robust to minor header variations
    const r: Record<string, string> = {}
    for (const [k, v] of Object.entries(row)) r[k.toLowerCase().trim()] = String(v).trim()

    const type = r['type'] ?? ''
    // Skip payments and any other non-purchase rows
    if (type.toLowerCase() === 'payment') continue

    const dateStr = r['transaction_date'] ?? ''
    if (!dateStr) continue

    // Date is already YYYY-MM-DD from Wealthsimple
    const date = dateStr.slice(0, 10)

    const merchant = (r['details'] ?? '').replace(/\s+/g, ' ').trim()
    if (!merchant) continue

    const amount = parseFloat(r['amount'] ?? '0')
    if (isNaN(amount) || amount <= 0) continue   // skip payments / credits

    rows.push({ date, merchant, amount, paidBy: 'Shirley' })
  }

  if (rows.length === 0) {
    throw new Error('No purchase transactions found in WS CSV')
  }

  return rows
}
