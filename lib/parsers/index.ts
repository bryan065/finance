// Entry point: given a file buffer + account code, return parsed rows.

import type { ParsedRow } from './types'
export type { ParsedRow }

export async function parseStatement(
  buffer: Buffer,
  account: string,
  filename: string,
): Promise<ParsedRow[]> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? ''

  switch (account) {
    case 'AMEX': {
      if (!['xls', 'xlsx', 'csv'].includes(ext)) {
        throw new Error('AMEX: upload the XLS/XLSX/CSV file downloaded from amex.com')
      }
      const { parseAmexXls } = await import('./amex-xls')
      return parseAmexXls(buffer)
    }

    case 'CTFS': {
      if (!['csv', 'xls', 'xlsx'].includes(ext)) {
        throw new Error('CTFS: upload the CSV file downloaded from ctfs.com')
      }
      const { parseCTFSCsv } = await import('./ctfs-csv')
      return parseCTFSCsv(buffer)
    }

    case 'WS': {
      if (!['csv'].includes(ext)) {
        throw new Error('WS: upload the CSV file exported from the Wealthsimple app')
      }
      const { parseWSCsv } = await import('./ws-csv')
      return parseWSCsv(buffer)
    }

    case 'CIBC':
      throw new Error(`${account} imports are not yet supported`)

    default:
      throw new Error(`Unknown account: ${account}`)
  }
}
