// lib/db.ts
// ─────────────────────────────────────────────
// Database connection.
// This is the ONLY file in the app that knows
// how to connect to PostgreSQL.
//
// Every API route imports { query } from here
// instead of managing its own connection.
// That way if we ever change databases, we
// only change this one file.
// ─────────────────────────────────────────────

import { Pool } from 'pg'
// Pool = a group of reusable database connections.
// Instead of opening a new connection for every
// request (slow), a pool keeps several open and
// reuses them (fast).

// Create one pool for the entire app.
// process.env reads from your .env.local file.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// The query function — this is what we use everywhere.
// Usage: const result = await query('SELECT * FROM transactions')
// Usage: const result = await query('SELECT * FROM transactions WHERE id=$1', [id])
//
// $1, $2, $3... are placeholders for values.
// NEVER put values directly in the SQL string — that's a SQL injection vulnerability.
// Always use placeholders: query('...WHERE id=$1', [id])
export async function query(sql: string, params?: unknown[]) {
  const result = await pool.query(sql, params)
  return result
}
