// POST /api/sheets/fetch
// Fetches a publicly shared Google Sheet as CSV and runs it through
// the existing statement parsers.
//
// Requirements:
//   - The sheet must be shared as "Anyone with the link → Viewer"
//   - No Google API key needed — uses the public export endpoint
//
// Body:  { url: string, account: string }
// Returns: { rows: ParsedRow[] }  (same shape as /api/upload)

import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/parsers'

// Extract spreadsheet ID and optional sheet (gid) from any Google Sheets URL.
// Handles all common URL forms:
//   .../spreadsheets/d/{ID}/edit#gid={GID}
//   .../spreadsheets/d/{ID}/view?usp=sharing
//   .../spreadsheets/d/{ID}
function extractSheetParams(url: string): { id: string; gid?: string } | null {
  const idMatch = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!idMatch) return null

  const gidMatch = url.match(/[#&?]gid=([0-9]+)/)
  return {
    id:  idMatch[1],
    gid: gidMatch?.[1],
  }
}

export async function POST(request: NextRequest) {
  let url: string
  let account: string

  try {
    ;({ url, account } = await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!url?.trim() || !account?.trim()) {
    return NextResponse.json({ error: 'Missing url or account' }, { status: 400 })
  }

  // ── Validate and build the export URL ─────────────────────────────

  const params = extractSheetParams(url.trim())
  if (!params) {
    return NextResponse.json(
      { error: 'Not a valid Google Sheets URL. It should contain /spreadsheets/d/{id}.' },
      { status: 400 }
    )
  }

  const exportUrl = new URL(
    `https://docs.google.com/spreadsheets/d/${params.id}/export`
  )
  exportUrl.searchParams.set('format', 'csv')
  if (params.gid) exportUrl.searchParams.set('gid', params.gid)

  // ── Fetch the CSV ─────────────────────────────────────────────────

  let csvBuffer: Buffer
  try {
    const res = await fetch(exportUrl.toString(), {
      redirect: 'follow',
      headers:  { 'User-Agent': 'fin-app/1.0' },
    })

    // Google redirects private sheets to an HTML sign-in page rather than
    // returning 403 — catch both cases.
    const contentType = res.headers.get('content-type') ?? ''
    if (!res.ok || contentType.includes('text/html')) {
      return NextResponse.json(
        {
          error:
            'Could not read the sheet. Make sure it is shared as ' +
            '"Anyone with the link → Viewer" and try again.',
        },
        { status: 403 }
      )
    }

    csvBuffer = Buffer.from(await res.arrayBuffer())
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch sheet' },
      { status: 502 }
    )
  }

  // ── Parse ─────────────────────────────────────────────────────────

  try {
    const rows = await parseStatement(csvBuffer, account, 'sheet.csv')
    return NextResponse.json({ rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
