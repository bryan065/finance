'use client'

import { useState, useTransition, useMemo } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────

export type CategoryRow = {
  id:   number
  name: string
}

export type SplitRow = {
  id:            number
  year:          number
  name:          string | null
  shirley_ratio: number
  johnson_ratio: number
  notes:         string | null
  categories:    CategoryRow[]
}

export type AccountRow = {
  id:   number
  code: string
  name: string
}

type Props = {
  ratios:     SplitRow[]
  accounts:   AccountRow[]
  categories: CategoryRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

function pct(ratio: number) {
  return (ratio * 100).toFixed(1)
}

// All available years from ratios + current year
function yearsFromRatios(ratios: SplitRow[]): number[] {
  const set = new Set(ratios.map(r => r.year))
  set.add(new Date().getFullYear())
  return Array.from(set).sort((a, b) => b - a)
}

// Category groups for the multi-select
const CATEGORY_GROUPS: Record<string, string[]> = {
  Food:         ['Groceries', 'Restaurants', 'Coffee', 'Food Delivery', 'Alcohol'],
  Transport:    ['Gas', 'Transit', 'Parking', 'Travel'],
  Home:         ['Mortgage / HELOC', 'Hydro / Utilities', 'Home Maintenance', 'Internet'],
  Lifestyle:    ['Clothing', 'Entertainment', 'Streaming', 'Gym'],
  Health:       ['Health', 'Pharmacy'],
  Finance:      ['Phone', 'Personal', 'Other'],
}

// ── Form state ─────────────────────────────────────────────────────────────

type FormState = {
  name:        string
  shirleyPct:  string
  notes:       string
  categoryIds: Set<number>
}

const emptyForm = (): FormState => ({
  name:        '',
  shirleyPct:  '',
  notes:       '',
  categoryIds: new Set(),
})

// ── Component ──────────────────────────────────────────────────────────────

export default function SettingsClient({ ratios: initialRatios, accounts, categories }: Props) {
  const router  = useRouter()
  const [, startTransition] = useTransition()

  const [ratios,       setRatios]       = useState<SplitRow[]>(initialRatios)
  const [activeYear,   setActiveYear]   = useState<number>(() =>
    initialRatios[0]?.year ?? new Date().getFullYear()
  )
  // editingId: number = editing existing; 'new' = adding; null = none
  const [editingId,    setEditingId]    = useState<number | 'new' | null>(null)
  const [form,         setForm]         = useState<FormState>(emptyForm())
  const [saving,       setSaving]       = useState(false)
  const [deleting,     setDeleting]     = useState<number | null>(null)
  const [error,        setError]        = useState<string | null>(null)
  const [recalcState,  setRecalcState]  = useState<'idle' | 'running' | { updated: number; skipped: number }>('idle')

  const years = useMemo(() => yearsFromRatios(ratios), [ratios])
  const yearRatios = useMemo(() => ratios.filter(r => r.year === activeYear), [ratios, activeYear])

  // Category id → name map
  const catById = useMemo(() => {
    const m: Record<number, string> = {}
    for (const c of categories) m[c.id] = c.name
    return m
  }, [categories])

  // All category ids assigned to any ratio in the active year
  const coveredCatIds = useMemo(() => {
    const s = new Set<number>()
    for (const r of yearRatios) {
      for (const c of r.categories) s.add(c.id)
    }
    return s
  }, [yearRatios])

  // Has at least one catch-all (no categories) in this year?
  const hasCatchAll = useMemo(() => yearRatios.some(r => r.categories.length === 0), [yearRatios])

  // Uncovered categories (not in any ratio AND not caught by a catch-all)
  const uncoveredCategories = useMemo(() => {
    if (hasCatchAll) return []   // catch-all covers everything
    return categories.filter(c => !coveredCatIds.has(c.id))
  }, [categories, coveredCatIds, hasCatchAll])

  const johnsonPct = form.shirleyPct === '' ? '' : (100 - parseFloat(form.shirleyPct)).toFixed(1)

  // ── Open/close form ───────────────────────────────────────────────────────

  function openNew() {
    setEditingId('new')
    setForm(emptyForm())
    setError(null)
  }

  function openEdit(row: SplitRow) {
    setEditingId(row.id)
    setForm({
      name:        row.name ?? '',
      shirleyPct:  pct(row.shirley_ratio),
      notes:       row.notes ?? '',
      categoryIds: new Set(row.categories.map(c => c.id)),
    })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  function toggleCategory(id: number) {
    setForm(prev => {
      const next = new Set(prev.categoryIds)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { ...prev, categoryIds: next }
    })
  }

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    const shirleyNum = parseFloat(form.shirleyPct)
    if (isNaN(shirleyNum) || shirleyNum < 0 || shirleyNum > 100) {
      setError("Shirley's share must be 0–100")
      return
    }

    setSaving(true)
    setError(null)

    const body = {
      year:         activeYear,
      name:         form.name.trim() || null,
      shirley_pct:  shirleyNum,
      notes:        form.notes.trim() || null,
      category_ids: Array.from(form.categoryIds),
    }

    try {
      let res: Response
      if (editingId === 'new') {
        res = await fetch('/api/settings/split', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
      } else {
        res = await fetch(`/api/settings/split/${editingId}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        })
      }

      const data = await res.json()
      setSaving(false)

      if (!res.ok) {
        setError(data.error ?? 'Save failed')
        return
      }

      const saved: SplitRow = data.ratio
      setRatios(prev => {
        if (editingId === 'new') {
          return [...prev, saved].sort((a, b) => b.year - a.year || a.id - b.id)
        }
        return prev.map(r => r.id === saved.id ? saved : r)
      })
      setEditingId(null)
      startTransition(() => router.refresh())
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: number, label: string) {
    if (!confirm(`Remove ratio "${label}"? This won't change existing transactions.`)) return
    setDeleting(id)

    const res  = await fetch(`/api/settings/split/${id}`, { method: 'DELETE' })
    const data = await res.json()
    setDeleting(null)

    if (!res.ok) {
      setError(data.error ?? 'Delete failed')
      return
    }

    setRatios(prev => prev.filter(r => r.id !== id))
    if (editingId === id) setEditingId(null)
    startTransition(() => router.refresh())
  }

  // ── Recalculate all shares ────────────────────────────────────────────────

  async function handleRecalc() {
    if (!confirm(
      'Recalculate Shirley/Johnson shares for all joint transactions using current ratios?\n\nThis updates the split amounts but does not change categories or transaction types.'
    )) return

    setRecalcState('running')
    setError(null)
    try {
      const res  = await fetch('/api/settings/recalc', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Recalculation failed')
        setRecalcState('idle')
        return
      }
      setRecalcState({ updated: data.updated, skipped: data.skipped })
      startTransition(() => router.refresh())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recalculation failed')
      setRecalcState('idle')
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const isEditing = editingId !== null

  return (
    <div className="space-y-10">

      {/* ── Split Ratios ── */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Split Ratios</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Income-based proration applied to joint expenses. Each ratio can cover specific
              categories; a catch-all (no categories selected) covers everything else.
            </p>
          </div>
          {!isEditing && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleRecalc}
                disabled={recalcState === 'running'}
                className="px-3 py-1.5 bg-gray-700 text-gray-300 text-sm font-medium rounded-lg hover:bg-gray-600 transition-colors disabled:opacity-40"
                title="Recalculate Shirley/Johnson shares for all joint transactions"
              >
                {recalcState === 'running' ? 'Recalculating…' : '↺ Recalc shares'}
              </button>
              <button
                onClick={openNew}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
              >
                + Add ratio
              </button>
            </div>
          )}
        </div>

        {/* Year tabs */}
        <div className="flex gap-1 mb-4 flex-wrap">
          {years.map(y => (
            <button
              key={y}
              onClick={() => { setActiveYear(y); setEditingId(null); setError(null) }}
              className={`px-3 py-1 text-sm rounded-lg transition-colors ${
                activeYear === y
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
              }`}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Uncovered categories warning */}
        {uncoveredCategories.length > 0 && !isEditing && (
          <div className="mb-4 px-4 py-3 bg-amber-950/40 border border-amber-800/60 rounded-lg text-sm text-amber-400">
            <span className="font-medium">⚠ No ratio covers:</span>{' '}
            {uncoveredCategories.map(c => c.name).join(', ')}
          </div>
        )}

        {/* "Add new" form */}
        {editingId === 'new' && (
          <RatioForm
            form={form}
            setForm={setForm}
            categories={categories}
            johnsonPct={johnsonPct}
            saving={saving}
            error={error}
            onSave={handleSave}
            onCancel={cancelEdit}
            onToggleCategory={toggleCategory}
            title={`New ratio for ${activeYear}`}
          />
        )}

        {/* Ratio cards */}
        {yearRatios.length === 0 && editingId !== 'new' ? (
          <div className="py-10 text-center text-gray-700 text-sm border border-gray-800 rounded-xl">
            No ratios for {activeYear} yet. Click "Add ratio" to get started.
          </div>
        ) : (
          <div className="space-y-3">
            {yearRatios.map(row => (
              editingId === row.id ? (
                <RatioForm
                  key={row.id}
                  form={form}
                  setForm={setForm}
                  categories={categories}
                  johnsonPct={johnsonPct}
                  saving={saving}
                  error={error}
                  onSave={handleSave}
                  onCancel={cancelEdit}
                  onToggleCategory={toggleCategory}
                  title={`Edit: ${row.name ?? 'Catch-all'}`}
                />
              ) : (
                <RatioCard
                  key={row.id}
                  row={row}
                  catById={catById}
                  deleting={deleting === row.id}
                  editDisabled={isEditing}
                  onEdit={() => openEdit(row)}
                  onDelete={() => handleDelete(row.id, row.name ?? 'Catch-all')}
                />
              )
            ))}
          </div>
        )}

        {error && !isEditing && (
          <p className="mt-3 text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg px-4 py-3">
            {error}
          </p>
        )}

        {typeof recalcState === 'object' && (
          <div className="mt-3 flex items-center justify-between px-4 py-3 bg-green-950/30 border border-green-900 rounded-lg text-sm text-green-400">
            <span>
              ✓ Recalculated <span className="font-medium">{recalcState.updated}</span> transaction{recalcState.updated !== 1 ? 's' : ''}
              {recalcState.skipped > 0 && (
                <span className="text-green-600"> · {recalcState.skipped} skipped (no ratio found)</span>
              )}
            </span>
            <button
              onClick={() => setRecalcState('idle')}
              className="text-green-700 hover:text-green-500 ml-4"
            >
              ✕
            </button>
          </div>
        )}
      </section>

      {/* ── Accounts ── */}
      <section>
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-100">Accounts</h2>
          <p className="text-sm text-gray-500 mt-0.5">
            The credit cards and accounts tracked in fin.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {accounts.map(a => (
            <div key={a.id} className="bg-gray-900 rounded-xl border border-gray-800 p-4 flex items-center gap-3">
              <span className="px-2 py-1 rounded text-xs font-bold bg-gray-800 text-gray-300">
                {a.code}
              </span>
              <span className="text-gray-400 text-sm">{a.name}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

// ── RatioCard ──────────────────────────────────────────────────────────────

function RatioCard({
  row,
  catById,
  deleting,
  editDisabled,
  onEdit,
  onDelete,
}: {
  row:          SplitRow
  catById:      Record<number, string>
  deleting:     boolean
  editDisabled: boolean
  onEdit:       () => void
  onDelete:     () => void
}) {
  const isCatchAll = row.categories.length === 0

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">

          {/* Name + catch-all badge */}
          <div className="flex items-center gap-2 mb-2">
            {row.name ? (
              <span className="font-medium text-gray-200 text-sm">{row.name}</span>
            ) : isCatchAll ? (
              <span className="font-medium text-gray-400 text-sm italic">Catch-all</span>
            ) : (
              <span className="font-medium text-gray-500 text-sm italic">Unnamed</span>
            )}
            {isCatchAll && (
              <span className="px-1.5 py-0.5 text-xs bg-gray-700 text-gray-400 rounded">
                default
              </span>
            )}
          </div>

          {/* Split bar */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-purple-400 text-xs font-medium w-14 text-right">
              {pct(row.shirley_ratio)}%
            </span>
            <div className="flex flex-1 h-2 rounded-full overflow-hidden gap-px">
              <div
                className="bg-purple-600 transition-all"
                style={{ width: `${row.shirley_ratio * 100}%` }}
              />
              <div
                className="bg-blue-600 transition-all"
                style={{ width: `${row.johnson_ratio * 100}%` }}
              />
            </div>
            <span className="text-blue-400 text-xs font-medium w-14">
              {pct(row.johnson_ratio)}%
            </span>
          </div>

          {/* Category chips */}
          {isCatchAll ? (
            <p className="text-xs text-gray-600 italic">covers all categories without a specific ratio</p>
          ) : (
            <div className="flex flex-wrap gap-1 mt-1">
              {row.categories.map(c => (
                <span
                  key={c.id}
                  className="px-2 py-0.5 text-xs bg-gray-800 text-gray-400 rounded-full border border-gray-700"
                >
                  {c.name}
                </span>
              ))}
            </div>
          )}

          {row.notes && (
            <p className="text-xs text-gray-600 mt-2">{row.notes}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 shrink-0 pt-0.5">
          <button
            onClick={onEdit}
            disabled={editDisabled}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors disabled:opacity-30"
          >
            Edit
          </button>
          <button
            onClick={onDelete}
            disabled={deleting || editDisabled}
            className="text-xs text-red-700 hover:text-red-500 transition-colors disabled:opacity-40"
          >
            {deleting ? '…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── RatioForm ──────────────────────────────────────────────────────────────

function RatioForm({
  form,
  setForm,
  categories,
  johnsonPct,
  saving,
  error,
  onSave,
  onCancel,
  onToggleCategory,
  title,
}: {
  form:             FormState
  setForm:          React.Dispatch<React.SetStateAction<FormState>>
  categories:       CategoryRow[]
  johnsonPct:       string
  saving:           boolean
  error:            string | null
  onSave:           () => void
  onCancel:         () => void
  onToggleCategory: (id: number) => void
  title:            string
}) {
  // Build a map of name→id for grouping
  const catByName: Record<string, number> = {}
  for (const c of categories) catByName[c.name] = c.id

  // All category names from the defined groups, then remainder
  const grouped: { label: string; items: { id: number; name: string }[] }[] = []
  const seenIds = new Set<number>()

  for (const [groupLabel, names] of Object.entries(CATEGORY_GROUPS)) {
    const items = names
      .filter(n => catByName[n] !== undefined)
      .map(n => ({ id: catByName[n], name: n }))
    if (items.length > 0) {
      grouped.push({ label: groupLabel, items })
      items.forEach(it => seenIds.add(it.id))
    }
  }

  // Any categories not in the predefined groups
  const other = categories.filter(c => !seenIds.has(c.id))
  if (other.length > 0) {
    grouped.push({ label: 'Other', items: other })
  }

  const selectedCount = form.categoryIds.size

  return (
    <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-5 space-y-4">
      <p className="text-sm font-medium text-blue-400">{title}</p>

      <div className="grid grid-cols-2 gap-4">
        {/* Name */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Name <span className="text-gray-700">(optional)</span></label>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
            placeholder="e.g. Housing, Food"
            className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Shirley % */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Shirley&apos;s share</label>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 flex-1">
              <input
                type="number"
                value={form.shirleyPct}
                onChange={e => setForm(prev => ({ ...prev, shirleyPct: e.target.value }))}
                placeholder="45.0"
                min="0" max="100" step="0.1"
                className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <span className="text-gray-500 text-xs">%</span>
            </div>
            {johnsonPct !== '' && (
              <span className="text-xs text-gray-500 whitespace-nowrap">Johnson: {johnsonPct}%</span>
            )}
          </div>
        </div>
      </div>

      {/* Category multi-select */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs text-gray-500">
            Categories{' '}
            <span className="text-gray-700">
              {selectedCount === 0 ? '— leave empty for catch-all' : `(${selectedCount} selected)`}
            </span>
          </label>
          {selectedCount > 0 && (
            <button
              onClick={() => setForm(prev => ({ ...prev, categoryIds: new Set() }))}
              className="text-xs text-gray-600 hover:text-gray-400"
            >
              Clear all
            </button>
          )}
        </div>

        <div className="bg-gray-800/60 border border-gray-700 rounded-lg p-3 space-y-3 max-h-64 overflow-y-auto">
          {grouped.map(group => (
            <div key={group.label}>
              <p className="text-xs text-gray-600 font-medium uppercase tracking-wide mb-1.5">{group.label}</p>
              <div className="flex flex-wrap gap-2">
                {group.items.map(cat => {
                  const checked = form.categoryIds.has(cat.id)
                  return (
                    <button
                      key={cat.id}
                      onClick={() => onToggleCategory(cat.id)}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        checked
                          ? 'bg-blue-600/30 border-blue-500 text-blue-300'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'
                      }`}
                    >
                      {checked ? '✓ ' : ''}{cat.name}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Notes <span className="text-gray-700">(optional)</span></label>
        <input
          type="text"
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
          placeholder="Optional note"
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {error && (
        <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-4 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-gray-500 hover:text-gray-300 text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
