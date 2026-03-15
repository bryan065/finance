'use client'

import { useState, useMemo, useTransition } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────

export type CategoryRow = {
  id:         number
  name:       string
  roll_up_1:  string
  roll_up_2:  string
  is_housing: boolean
}

type FormState = {
  name:       string
  roll_up_1:  string
  roll_up_2:  string
  is_housing: boolean
}

const emptyForm = (): FormState => ({
  name:       '',
  roll_up_1:  '',
  roll_up_2:  '',
  is_housing: false,
})

// ── Helpers ────────────────────────────────────────────────────────────────

function toTitleCase(s: string): string {
  return s.trim().replace(/\b\w/g, c => c.toUpperCase())
}

// ── RollUpSelect ───────────────────────────────────────────────────────────
// A controlled dropdown that also allows creating a new group value.

function RollUpSelect({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label:    string
  hint:     string
  value:    string
  options:  string[]
  onChange: (v: string) => void
}) {
  const [mode,         setMode]         = useState<'pick' | 'new'>('pick')
  const [newValue,     setNewValue]     = useState('')
  // Confirmed-but-not-yet-saved group names so they appear in the select immediately
  const [localOptions, setLocalOptions] = useState<string[]>(() =>
    value && !options.includes(value) ? [value] : []
  )

  // Merge saved options with any locally confirmed ones, deduped and sorted
  const allOptions = useMemo(
    () => Array.from(new Set([...options, ...localOptions])).sort(),
    [options, localOptions]
  )

  function handleSelectChange(e: React.ChangeEvent<HTMLSelectElement>) {
    if (e.target.value === '__new__') {
      setMode('new')
      setNewValue('')
    } else {
      onChange(e.target.value)
    }
  }

  function confirmNew() {
    const titled = toTitleCase(newValue)
    if (!titled) return
    // Add to local list so it appears as a valid <option> right away
    setLocalOptions(prev => Array.from(new Set([...prev, titled])).sort())
    onChange(titled)
    setMode('pick')
    setNewValue('')
  }

  function cancelNew() {
    setMode('pick')
    setNewValue('')
  }

  const inputClass = 'w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div>
      <label className="block text-xs text-gray-500 mb-1">
        {label} <span className="text-gray-700">{hint}</span>
      </label>

      {mode === 'pick' ? (
        <select
          value={value || ''}
          onChange={handleSelectChange}
          className={inputClass}
        >
          <option value="" disabled>Select…</option>
          {allOptions.map(o => (
            <option key={o} value={o}>{o}</option>
          ))}
          <option value="__new__">＋ Add new group…</option>
        </select>
      ) : (
        <div className="flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={newValue}
            onChange={e => setNewValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmNew() } }}
            placeholder="New group name…"
            className={inputClass}
          />
          <button
            type="button"
            onClick={confirmNew}
            disabled={!newValue.trim()}
            className="shrink-0 px-2.5 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
          >
            ✓
          </button>
          <button
            type="button"
            onClick={cancelNew}
            className="shrink-0 text-xs text-gray-600 hover:text-gray-300"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export default function CategoriesClient({ categories: initialCategories }: { categories: CategoryRow[] }) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  const [categories, setCategories] = useState<CategoryRow[]>(initialCategories)
  const [editingId,  setEditingId]  = useState<number | 'new' | null>(null)
  const [form,       setForm]       = useState<FormState>(emptyForm())
  const [saving,     setSaving]     = useState(false)
  const [deleting,   setDeleting]   = useState<number | null>(null)
  const [error,      setError]      = useState<string | null>(null)

  // All distinct roll_up_1 / roll_up_2 values derived from current data
  const rollUp1Options = useMemo(() =>
    Array.from(new Set(categories.map(c => c.roll_up_1))).sort(),
    [categories]
  )
  const rollUp2Options = useMemo(() =>
    Array.from(new Set(categories.map(c => c.roll_up_2))).sort(),
    [categories]
  )

  // Group categories by roll_up_1
  const grouped = useMemo(() => {
    const map = new Map<string, CategoryRow[]>()
    for (const c of categories) {
      if (!map.has(c.roll_up_1)) map.set(c.roll_up_1, [])
      map.get(c.roll_up_1)!.push(c)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [categories])

  // ── Form helpers ──────────────────────────────────────────────────────────

  function openNew() {
    setEditingId('new')
    setForm(emptyForm())
    setError(null)
  }

  function openEdit(row: CategoryRow) {
    setEditingId(row.id)
    setForm({ name: row.name, roll_up_1: row.roll_up_1, roll_up_2: row.roll_up_2, is_housing: row.is_housing })
    setError(null)
  }

  function cancelEdit() {
    setEditingId(null)
    setError(null)
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!form.name.trim())      { setError('Name is required');      return }
    if (!form.roll_up_1.trim()) { setError('Roll-up 1 is required'); return }
    if (!form.roll_up_2.trim()) { setError('Roll-up 2 is required'); return }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch(
        editingId === 'new' ? '/api/categories' : `/api/categories/${editingId}`,
        {
          method:  editingId === 'new' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(form),
        }
      )
      const data = await res.json()
      setSaving(false)

      if (!res.ok) { setError(data.error ?? 'Save failed'); return }

      const saved: CategoryRow = data.category
      setCategories(prev => {
        const next = editingId === 'new'
          ? [...prev, saved]
          : prev.map(c => c.id === saved.id ? saved : c)
        return next.sort((a, b) =>
          a.roll_up_1.localeCompare(b.roll_up_1) || a.name.localeCompare(b.name)
        )
      })
      setEditingId(null)
      startTransition(() => router.refresh())
    } catch (err) {
      setSaving(false)
      setError(err instanceof Error ? err.message : 'Save failed')
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete(id: number, name: string) {
    if (!confirm(`Delete category "${name}"?\n\nThis will fail if any transactions use this category.`)) return
    setDeleting(id)

    const res  = await fetch(`/api/categories/${id}`, { method: 'DELETE' })
    const data = await res.json()
    setDeleting(null)

    if (!res.ok) { setError(data.error ?? 'Delete failed'); return }

    setCategories(prev => prev.filter(c => c.id !== id))
    if (editingId === id) setEditingId(null)
    startTransition(() => router.refresh())
  }

  const isEditing = editingId !== null

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">
          {categories.length} categories across {grouped.length} groups
        </p>
        {!isEditing && (
          <button
            onClick={openNew}
            className="px-3 py-1.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-500 transition-colors"
          >
            + Add category
          </button>
        )}
      </div>

      {/* Add new form */}
      {editingId === 'new' && (
        <CategoryForm
          form={form}
          setForm={setForm}
          rollUp1Options={rollUp1Options}
          rollUp2Options={rollUp2Options}
          saving={saving}
          error={error}
          onSave={handleSave}
          onCancel={cancelEdit}
          title="New category"
        />
      )}

      {/* Grouped list */}
      {grouped.map(([groupName, cats]) => (
        <div key={groupName} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">

          <div className="px-4 py-2.5 bg-gray-800/60 border-b border-gray-800 flex items-center gap-3">
            <span className="text-sm font-semibold text-gray-300">{groupName}</span>
            <span className="text-xs text-gray-600">
              → {Array.from(new Set(cats.map(c => c.roll_up_2))).join(', ')}
            </span>
            <span className="ml-auto text-xs text-gray-700">{cats.length}</span>
          </div>

          <div className="divide-y divide-gray-800/50">
            {cats.map(cat => (
              editingId === cat.id ? (
                <div key={cat.id} className="p-4">
                  <CategoryForm
                    form={form}
                    setForm={setForm}
                    rollUp1Options={rollUp1Options}
                    rollUp2Options={rollUp2Options}
                    saving={saving}
                    error={error}
                    onSave={handleSave}
                    onCancel={cancelEdit}
                    title={`Edit: ${cat.name}`}
                  />
                </div>
              ) : (
                <div key={cat.id} className="px-4 py-3 flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-200">{cat.name}</span>

                  <div className="flex items-center gap-2 text-xs">
                    {cat.roll_up_2 !== cat.roll_up_1 && (
                      <span className="px-2 py-0.5 bg-gray-800 rounded-full text-gray-500">
                        {cat.roll_up_2}
                      </span>
                    )}
                    {cat.is_housing && (
                      <span className="px-2 py-0.5 bg-amber-950/60 border border-amber-900/40 text-amber-600 rounded-full">
                        housing
                      </span>
                    )}
                  </div>

                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => openEdit(cat)}
                      disabled={isEditing}
                      className="text-xs text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-30"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(cat.id, cat.name)}
                      disabled={deleting === cat.id || isEditing}
                      className="text-xs text-red-800 hover:text-red-500 transition-colors disabled:opacity-40"
                    >
                      {deleting === cat.id ? '…' : 'Delete'}
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        </div>
      ))}

      {error && !isEditing && (
        <p className="text-red-400 text-sm bg-red-950/30 border border-red-900 rounded-lg px-4 py-3">
          {error}
        </p>
      )}

    </div>
  )
}

// ── CategoryForm ───────────────────────────────────────────────────────────

function CategoryForm({
  form,
  setForm,
  rollUp1Options,
  rollUp2Options,
  saving,
  error,
  onSave,
  onCancel,
  title,
}: {
  form:            FormState
  setForm:         React.Dispatch<React.SetStateAction<FormState>>
  rollUp1Options:  string[]
  rollUp2Options:  string[]
  saving:          boolean
  error:           string | null
  onSave:          () => void
  onCancel:        () => void
  title:           string
}) {
  return (
    <div className="bg-gray-900 border border-blue-800/50 rounded-xl p-5 space-y-4">
      <p className="text-sm font-medium text-blue-400">{title}</p>

      {/* Name */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Category name</label>
        <input
          type="text"
          value={form.name}
          onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
          placeholder="e.g. Groceries"
          className="w-full bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <RollUpSelect
          label="Roll-up 1"
          hint="(granular group)"
          value={form.roll_up_1}
          options={rollUp1Options}
          onChange={v => setForm(prev => ({ ...prev, roll_up_1: v }))}
        />
        <RollUpSelect
          label="Roll-up 2"
          hint="(high-level group)"
          value={form.roll_up_2}
          options={rollUp2Options}
          onChange={v => setForm(prev => ({ ...prev, roll_up_2: v }))}
        />
      </div>

      {/* is_housing toggle */}
      <label className="flex items-center gap-3 cursor-pointer select-none">
        <div
          onClick={() => setForm(prev => ({ ...prev, is_housing: !prev.is_housing }))}
          className={`w-9 h-5 rounded-full transition-colors relative ${
            form.is_housing ? 'bg-amber-600' : 'bg-gray-700'
          }`}
        >
          <div className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
            form.is_housing ? 'translate-x-4' : ''
          }`} />
        </div>
        <span className="text-sm text-gray-400">
          Count as housing expense
          <span className="text-gray-600 text-xs ml-1">(affects housing cost reports)</span>
        </span>
      </label>

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
