-- schema.sql
-- ─────────────────────────────────────────────
-- Creates all the tables for the fin app.
-- This runs automatically when the PostgreSQL
-- container starts for the first time.
--
-- SQL uses "-- " for comments (like // in JS)
-- ─────────────────────────────────────────────


-- ── Categories ────────────────────────────────
-- Three-level hierarchy matching your Google Sheet:
--   category → roll_up_1 → roll_up_2
-- e.g. "Loblaws" → "Groceries" → "Food & Dining" → "Living"
CREATE TABLE IF NOT EXISTS categories (
  id         SERIAL PRIMARY KEY,    -- Auto-incrementing number (1, 2, 3...)
  name       TEXT NOT NULL UNIQUE,  -- e.g. "Groceries"
  roll_up_1  TEXT NOT NULL,         -- e.g. "Food & Dining"
  roll_up_2  TEXT NOT NULL,         -- e.g. "Living"
  is_housing BOOLEAN DEFAULT false  -- true = always 50/50 split
);


-- ── Accounts ──────────────────────────────────
-- Your four credit cards / accounts
CREATE TABLE IF NOT EXISTS accounts (
  id   SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,  -- 'CIBC', 'AMEX', 'CTFS', 'WS'
  name TEXT NOT NULL          -- 'CIBC Visa', 'American Express', etc.
);


-- ── Transactions ──────────────────────────────
-- The main table — every line item from every statement
CREATE TABLE IF NOT EXISTS transactions (
  id              SERIAL PRIMARY KEY,
  date            DATE        NOT NULL,
  merchant        TEXT        NOT NULL,
  amount          NUMERIC(10,2) NOT NULL,  -- e.g. 187.43
  account_id      INTEGER     REFERENCES accounts(id),
  category_id     INTEGER     REFERENCES categories(id),

  -- 'joint' or 'personal'
  type            TEXT        NOT NULL DEFAULT 'joint'
                              CHECK (type IN ('joint', 'personal')),

  -- Who physically paid (whose card)
  paid_by         TEXT        NOT NULL
                              CHECK (paid_by IN ('Shirley', 'Johnson')),

  -- Calculated split amounts
  shirley_share   NUMERIC(10,2) NOT NULL DEFAULT 0,
  johnson_share   NUMERIC(10,2) NOT NULL DEFAULT 0,

  -- For receipt-submitted transactions (from WhatsApp)
  receipt_image_url TEXT,
  notes             TEXT,

  -- Audit trail
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── Split Config ──────────────────────────────
-- Annual proration ratios set each January.
-- e.g. year=2026, shirley_ratio=0.45, johnson_ratio=0.55
CREATE TABLE IF NOT EXISTS split_config (
  id              SERIAL PRIMARY KEY,
  year            INTEGER     NOT NULL UNIQUE,
  shirley_ratio   NUMERIC(5,4) NOT NULL,   -- e.g. 0.4500
  johnson_ratio   NUMERIC(5,4) NOT NULL,   -- e.g. 0.5500
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Ratios must add up to 1.00
  CONSTRAINT ratios_sum_to_one CHECK (shirley_ratio + johnson_ratio = 1.0)
);


-- ── Auto-update updated_at ─────────────────────
-- This is a "trigger" — it automatically sets updated_at
-- to the current time whenever a transaction row changes.
-- You never have to remember to set it manually.
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER transactions_updated_at
  BEFORE UPDATE ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
