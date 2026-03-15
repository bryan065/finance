// Parser for American Express XLS export (Transaction Details download)
// Columns: Date | Date Processed | Description | Cardmember | Amount | ...
//
// How to export from AMEX:
//   amex.com → My Account → Statements → Download (select Excel)

import * as XLSX from 'xlsx'
import type { ParsedRow } from './types'

// "23 Feb. 2026" → "2026-02-23"
function parseAmexDate(str: string): string {
  const months: Record<string, string> = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04',
    May: '05', Jun: '06', Jul: '07', Aug: '08',
    Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  }
  const m = str.match(/(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})/)
  if (!m) return str
  return `${m[3]}-${months[m[2]] ?? '01'}-${m[1].padStart(2, '0')}`
}

// "$2,163.00" → 2163.00   |   "-$1,665.34" → -1665.34
function parseAmount(str: string): number {
  return parseFloat((str as string).replace(/[$,]/g, ''))
}

export function parseAmexXls(buffer: Buffer): ParsedRow[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const allRows = XLSX.utils.sheet_to_json<(string | null)[]>(ws, { header: 1 })

  // Find the header row — it has "Date" in col 0 and "Cardmember" in col 3
  const headerIdx = allRows.findIndex(
    row => row[0] === 'Date' && row[3] === 'Cardmember'
  )
  if (headerIdx === -1) throw new Error('Could not find transaction header row in AMEX XLS')

  const rows: ParsedRow[] = []

  for (let i = headerIdx + 1; i < allRows.length; i++) {
    const row = allRows[i] as (string | null)[]
    if (!row[0]) continue                          // empty row

    const cardmember = row[3]
    if (!cardmember) continue                      // payment / credit row (no cardmember)

    const amountStr = row[4]
    if (!amountStr) continue

    const amount = parseAmount(amountStr)
    if (amount <= 0) continue                      // skip credits/payments

    const date     = parseAmexDate(row[0] as string)
    // Collapse internal whitespace in description (AMEX pads with spaces)
    const merchant = ((row[2] as string) ?? '').replace(/\s+/g, ' ').trim()

    // "SHIRLEY NG" → 'Shirley'  |  "JOHNSON LUU" → 'Johnson'
    const paidBy: 'Shirley' | 'Johnson' =
      cardmember.toUpperCase().includes('JOHNSON') ||
      cardmember.toUpperCase().includes('LUU')
        ? 'Johnson'
        : 'Shirley'

    rows.push({ date, merchant, amount, paidBy })
  }

  return rows
}
