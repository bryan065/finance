// Parser for Canadian Tire (Triangle) Mastercard CSV export
//
// How to export from CTFS:
//   ctfs.com → My Account → Activity & Statements → Download → CSV
//
// Expected CSV columns (based on PDF table structure):
//   Transaction Date, Description, Category, Amount
//
// If your downloaded CSV has different column names, let me know and
// we can adjust the header matching below.

import * as XLSX from 'xlsx'
import type { ParsedRow } from './types'

// "$1,708.00" → 1708.00  |  "-$1,745.72" → -1745.72  |  "1708.00" → 1708.00
function parseAmount(str: string): number {
  return parseFloat(String(str).replace(/[$, ]/g, ''))
}

// Try to parse various date formats into YYYY-MM-DD
function parseDate(str: string): string {
  const s = String(str).trim()

  // Already ISO: "2026-02-23"
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s

  // "23 Feb. 2026" or "23 Feb 2026"
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/)
  if (m) return `${m[3]}-${months[m[2]] ?? '01'}-${m[1].padStart(2, '0')}`

  // "02/23/2026" or "2026/02/23"
  const slashMatch = s.match(/(\d{1,4})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (slashMatch) {
    const [, a, b, c] = slashMatch
    if (a.length === 4) return `${a}-${b.padStart(2,'0')}-${c.padStart(2,'0')}`
    return `${c.length === 2 ? '20' + c : c}-${a.padStart(2,'0')}-${b.padStart(2,'0')}`
  }

  return s
}

export function parseCTFSCsv(buffer: Buffer): ParsedRow[] {
  // XLSX can read CSV too — convenient unified approach
  const wb = XLSX.read(buffer, { type: 'buffer', raw: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const allRows = XLSX.utils.sheet_to_json<(string | null)[]>(ws, { header: 1, defval: null })

  // Find the header row — look for a row containing "Date" and "Amount"
  const headerIdx = allRows.findIndex(row =>
    row.some(cell => String(cell ?? '').toLowerCase().includes('date')) &&
    row.some(cell => String(cell ?? '').toLowerCase().includes('amount'))
  )
  if (headerIdx === -1) throw new Error('Could not find header row in CTFS CSV')

  const headers = (allRows[headerIdx] as string[]).map(h => String(h ?? '').toLowerCase().trim())
  const dateCol   = headers.findIndex(h => h.includes('date'))
  const descCol   = headers.findIndex(h => h.includes('description') || h.includes('merchant'))
  const amountCol = headers.findIndex(h => h.includes('amount'))

  if (dateCol === -1 || amountCol === -1) {
    throw new Error(`Missing required columns. Found: ${headers.join(', ')}`)
  }

  const rows: ParsedRow[] = []

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as (string | null)[]
    if (!row[dateCol] || row[amountCol] === null) continue

    const amountStr = row[amountCol]
    if (!amountStr) continue

    const amount = parseAmount(amountStr)
    if (amount <= 0) continue   // skip payments / credits

    const date     = parseDate(row[dateCol] as string)
    const merchant = descCol >= 0
      ? String(row[descCol] ?? '').replace(/\s+/g, ' ').trim()
      : 'Unknown'

    rows.push({ date, merchant, amount, paidBy: 'Shirley' })
  }

  return rows
}
