-- seed.sql
-- ─────────────────────────────────────────────
-- Inserts starter data into the tables.
-- "Seeding" = filling a fresh database with
-- the initial data it needs to be useful.
-- ─────────────────────────────────────────────


-- ── Accounts ──────────────────────────────────
INSERT INTO accounts (code, name) VALUES
  ('CIBC',  'CIBC Visa'),
  ('AMEX',  'American Express'),
  ('CTFS',  'Canadian Tire Financial Services'),
  ('WS',    'Wealthsimple Cash')
ON CONFLICT (code) DO NOTHING;  -- Don't error if already exists


-- ── Categories ────────────────────────────────
INSERT INTO categories (name, roll_up_1, roll_up_2, is_housing) VALUES
  -- Housing (always 50/50)
  ('Mortgage',         'Housing',       'Living',       true),
  ('HELOC',            'Housing',       'Living',       true),
  ('Property Tax',     'Housing',       'Living',       true),
  ('Home Insurance',   'Housing',       'Living',       true),
  ('Home Maintenance', 'Housing',       'Living',       true),

  -- Food
  ('Groceries',        'Food & Dining', 'Living',       false),
  ('Restaurants',      'Food & Dining', 'Living',       false),
  ('Coffee',           'Food & Dining', 'Living',       false),
  ('Alcohol',          'Food & Dining', 'Living',       false),
  ('Food Delivery',    'Food & Dining', 'Living',       false),

  -- Transport
  ('Gas',              'Transport',     'Living',       false),
  ('Parking',          'Transport',     'Living',       false),
  ('Transit',          'Transport',     'Living',       false),
  ('Car Insurance',    'Transport',     'Living',       false),
  ('Car Maintenance',  'Transport',     'Living',       false),

  -- Entertainment
  ('Streaming',        'Entertainment', 'Lifestyle',    false),
  ('Entertainment',    'Entertainment', 'Lifestyle',    false),
  ('Travel',           'Travel',        'Lifestyle',    false),

  -- Personal
  ('Clothing',         'Personal',      'Lifestyle',    false),
  ('Health',           'Health',        'Living',       false),
  ('Pharmacy',         'Health',        'Living',       false),
  ('Gym',              'Health',        'Living',       false),

  -- Utilities
  ('Internet',         'Utilities',     'Living',       false),
  ('Phone',            'Utilities',     'Living',       false),
  ('Hydro',            'Utilities',     'Living',       false),

  ('Other',            'Other',         'Other',        false)
ON CONFLICT (name) DO NOTHING;


-- ── Split Config ──────────────────────────────
-- 2026 proration: update these ratios each January
INSERT INTO split_config (year, shirley_ratio, johnson_ratio, notes) VALUES
  (2026, 0.45, 0.55, 'Based on income ratio set Jan 2026')
ON CONFLICT (year) DO NOTHING;
