# fin — build log

## Infrastructure

### Docker
- **`Dockerfile`** — multi-stage build: `deps` (prod deps only) → `builder` (full build) → `runner` (Alpine, non-root `nextjs` user, `next/standalone` server)
- **`docker-compose.yml`** — `app` service + `db` (postgres:16) with healthcheck; `app` waits for `db` to be healthy before starting
- **`.env.example`** — template for `POSTGRES_PASSWORD` and `ANTHROPIC_API_KEY`
- **`next.config.ts`** — added `output: 'standalone'`

---

## Transactions

### Time period picker
Replaced the single month selector with a full period picker:
- **Month** — existing behaviour; includes a time-horizon lookback for the bar chart
- **Quarter** — Q1/Q2/Q3/Q4 for any year; bar chart shows the 3 constituent months
- **FY** — full fiscal/calendar year; bar chart shows all 12 months
- **All Time** — every transaction in the DB; bar chart groups by month across all years

Removed the 13-month `WHERE` clause from `page.tsx` so FY and All Time views load complete data.

### AI re-categorization
- **`RecategorizeButton.tsx`** — fixed "Unexpected end of JSON input" crash; uses `res.text()` + safe `JSON.parse()`; shows inline error state
- **`app/api/transactions/recategorize/route.ts`** — wrapped in `try/catch` so all error paths return JSON; special-cases missing `category_manual` column with a migration hint
- **`category_manual` column** — boolean flag on transactions; prevents re-categorization from overwriting a manually set category

---

## Import

### Google Sheets
- **`app/api/sheets/fetch/route.ts`** — accepts any Sheets URL format, extracts the sheet ID and optional `gid`, fetches public CSV via the export endpoint, detects private sheets by checking `content-type: text/html`
- **`app/upload/page.tsx`** — source toggle between "File upload" and "Google Sheet"; sheet mode shows a URL input; both paths share the same preview/import flow

---

## Settings (`/settings`)

### Split ratios — multiple ratios per year
Each ratio covers a named subset of categories:
- Create a ratio → pick year → set a name → multi-select categories → set Shirley % (Johnson auto-fills as 100 − Shirley) → save
- A ratio with **no categories assigned** acts as a catch-all for that year
- ⚠ Warning banner lists any categories with no ratio and no catch-all for the current year
- Year tabs to switch between years; ratios per year shown as cards with category chips

**DB migration required:**
```sql
ALTER TABLE split_config DROP CONSTRAINT IF EXISTS split_config_year_key;
ALTER TABLE split_config ADD COLUMN IF NOT EXISTS name TEXT;
CREATE TABLE IF NOT EXISTS split_config_categories (
  split_config_id INTEGER REFERENCES split_config(id) ON DELETE CASCADE,
  category_id     INTEGER REFERENCES categories(id),
  PRIMARY KEY (split_config_id, category_id)
);
```

**`lib/split.ts`** — `getSplitRatio(year, categoryName)` shared helper with three-tier fallback:
1. Category-specific ratio for that year
2. Catch-all ratio for that year (no categories assigned)
3. Any ratio for that year (backward compat with old single-ratio rows)

### Accounts
Read-only list of tracked accounts — `code`, `name`.

---

## Categories (`/settings/categories`)

### Category management
- View all categories grouped by **Roll-up 1**
- Each row shows: name, Roll-up 2 badge, `housing` badge
- **Add** new categories — name, Roll-up 1 (dropdown), Roll-up 2 (dropdown), `is_housing` toggle
- **Edit** any category inline
- **Delete** — blocked with a descriptive error if the category is used by any transactions
- Roll-up dropdowns are strict selects (no free-text); "＋ Add new group…" option opens an inline input that title-cases the value before saving

### Roll-up management (`/settings/categories/rollups`)
Manage both levels of groupings without touching individual categories:

| Action | Behaviour |
|--------|-----------|
| **Rename** | Bulk-updates `roll_up_1` / `roll_up_2` across all matching categories in one SQL `UPDATE`; typing an existing group name merges the two groups |
| **Delete** | If the group has categories, an inline remap panel appears — choose a target group, then "Remap & delete" moves all categories and removes the old group |

**API routes added:**
- `GET/POST /api/categories` — list all / create
- `PATCH/DELETE /api/categories/[id]` — update / delete (delete blocked if in use)
- `POST /api/categories/remap` — bulk rename one roll-up value to another (`roll_up_1` or `roll_up_2`); field name validated against an allowlist

---

## DB schema (cumulative)

| Table | Change |
|-------|--------|
| `transactions` | Added `category_manual BOOLEAN DEFAULT FALSE` |
| `split_config` | Dropped `UNIQUE(year)`; added `name TEXT` |
| `split_config_categories` | New join table: `(split_config_id, category_id)` |
| `categories` | Existing: `id`, `name`, `roll_up_1`, `roll_up_2`, `is_housing` |

---

## Pending / in-progress

- **Recalc button** — trigger recalculation of `shirley_share` / `johnson_share` for all existing transactions based on current split ratios
- **Reports page** (`/reports`)
- **CIBC statement parser**
- **WhatsApp webhook receiver**
- **SSH + Cloudflare tunnel** for home server deployment
