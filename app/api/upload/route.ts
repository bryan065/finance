// POST /api/upload
// Receives a multipart form upload (file + account), runs the appropriate
// parser, and returns the parsed rows for the client to preview.
// Nothing is written to the DB here — that happens in /api/transactions/bulk.

import { NextRequest, NextResponse } from 'next/server'
import { parseStatement } from '@/lib/parsers'

export async function POST(request: NextRequest) {
  const formData = await request.formData()
  const file    = formData.get('file')    as File   | null
  const account = formData.get('account') as string | null

  if (!file || !account) {
    return NextResponse.json({ error: 'Missing file or account' }, { status: 400 })
  }

  const buffer = Buffer.from(await file.arrayBuffer())

  try {
    const rows = await parseStatement(buffer, account, file.name)
    return NextResponse.json({ rows })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Parse failed'
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
