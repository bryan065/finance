'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

export type RollupGroup = { name: string; count: number }

type Field = 'roll_up_1' | 'roll_up_2'

// ── RollupSection ──────────────────────────────────────────────────────────

function RollupSection({
  title,
  subtitle,
  field,
  groups,
  onGroupsChange,
}: {
  title:          string
  subtitle:       string
  field:          Field
  groups:         RollupGroup[]
  onGroupsChange: (next: RollupGroup[]) => void
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()

  // Which row is currently being actioned
  type RowAction =
    | { type: 'rename'; name: string; draft: string }
    | { type: 'delete'; name: string; remapTo: string }

  const [action,  setAction]  = useState<RowAction | null>(null)
  const [busy,    setBusy]    = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  function otherGroups(name: string) {
    return groups.filter(g => g.name !== name)
  }

  function startRename(name: string) {
    setAction({ type: 'rename', name, draft: name })
    setError(null)
  }

  function startDelete(name: string) {
    const others = otherGroups(name)
    setAction({ type: 'delete', name, remapTo: others[0]?.name ?? '' })
    setError(null)
  }

  function cancel() {
    setAction(null)
    setError(null)
  }

  async function callRemap(from: string, to: string) {
    setBusy(true)
    setError(null)
    const res  = await fetch('/api/categories/remap', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ field, from, to }),
    })
    const data = await res.json()
    setBusy(false)
    if (!res.ok) { setError(data.error ?? 'Failed'); return false }
    return true
  }

  async function confirmRename() {
    if (action?.type !== 'rename') return
    const to = action.draft.trim()
    if (!to || to === action.name) { cancel(); return }
    if (groups.some(g => g.name === to)) {
      setError(`"${to}" already exists — saving will merge the two groups.`)
      // allow proceeding — merging is intentional
    }
    const ok = await callRemap(action.name, to)
    if (!ok) return
    onGroupsChange(
      groups
        .map(g => g.name === action.name ? { ...g, name: to } : g)
        .reduce<RollupGroup[]>((acc, g) => {
          // If renaming merges into an existing group, sum the counts
          const existing = acc.find(x => x.name === g.name)
          if (existing) { existing.count += g.count; return acc }
          return [...acc, g]
        }, [])
        .sort((a, b) => a.name.localeCompare(b.name))
    )
    setAction(null)
    startTransition(() => router.refresh())
  }

  async function confirmDelete() {
    if (action?.type !== 'delete') return
    const { name, remapTo } = action
    if (!remapTo) { setError('Select a group to remap to'); return }
    const ok = await callRemap(name, remapTo)
    if (!ok) return
    // Absorb the deleted group's count into the target group
    onGroupsChange(
      groups
        .filter(g => g.name !== name)
        .map(g => g.name === remapTo ? { ...g, count: g.count + (groups.find(x => x.name === name)?.count ?? 0) } : g)
    )
    setAction(null)
    startTransition(() => router.refresh())
  }

  return (
    <div>
      <div className="mb-3">
        <h2 className="text-base font-semibold text-gray-200">{title}</h2>
        <p className="text-xs text-gray-600">{subtitle}</p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="divide-y divide-gray-800/60">
          {groups.map(group => {
            const isActive = action?.name === group.name

            return (
              <div key={group.name}>
                {/* Main row */}
                <div className="px-4 py-3 flex items-center gap-3">
                  <span className="flex-1 text-sm text-gray-200 font-medium">{group.name}</span>
                  <span className="text-xs text-gray-600">
                    {group.count} {group.count === 1 ? 'category' : 'categories'}
                  </span>
                  <div className="flex gap-3 shrink-0">
                    <button
                      onClick={() => startRename(group.name)}
                      disabled={!!action}
                      className="text-xs text-gray-600 hover:text-gray-300 transition-colors disabled:opacity-30"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => startDelete(group.name)}
                      disabled={!!action}
                      className="text-xs text-red-800 hover:text-red-500 transition-colors disabled:opacity-30"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Rename panel */}
                {isActive && action.type === 'rename' && (
                  <div className="px-4 pb-4 pt-1 bg-gray-800/40 border-t border-gray-800 space-y-3">
                    <p className="text-xs text-gray-500">Rename group — all categories will update automatically.</p>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        type="text"
                        value={action.draft}
                        onChange={e => setAction({ ...action, draft: e.target.value })}
                        onKeyDown={e => { if (e.key === 'Enter') confirmRename(); if (e.key === 'Escape') cancel() }}
                        className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={confirmRename}
                        disabled={busy || !action.draft.trim()}
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-500 disabled:opacity-40 transition-colors"
                      >
                        {busy ? '…' : 'Save'}
                      </button>
                      <button onClick={cancel} className="text-xs text-gray-600 hover:text-gray-400">
                        Cancel
                      </button>
                    </div>
                    {error && <p className="text-xs text-amber-500">{error}</p>}
                  </div>
                )}

                {/* Delete / remap panel */}
                {isActive && action.type === 'delete' && (
                  <div className="px-4 pb-4 pt-1 bg-red-950/20 border-t border-red-900/30 space-y-3">
                    {group.count === 0 ? (
                      <>
                        <p className="text-xs text-gray-400">This group has no categories. It will be removed.</p>
                        <div className="flex gap-2">
                          <button
                            onClick={confirmDelete}
                            disabled={busy}
                            className="px-3 py-1.5 bg-red-700 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
                          >
                            {busy ? '…' : 'Confirm delete'}
                          </button>
                          <button onClick={cancel} className="text-xs text-gray-600 hover:text-gray-400">Cancel</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400">
                          <span className="text-red-400 font-medium">{group.count} {group.count === 1 ? 'category' : 'categories'}</span>
                          {' '}will be moved. Choose which group to reassign them to:
                        </p>
                        <div className="flex items-center gap-2">
                          <select
                            value={action.remapTo}
                            onChange={e => setAction({ ...action, remapTo: e.target.value })}
                            className="flex-1 bg-gray-800 border border-gray-700 text-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
                          >
                            <option value="" disabled>Select group…</option>
                            {otherGroups(group.name).map(g => (
                              <option key={g.name} value={g.name}>{g.name} ({g.count})</option>
                            ))}
                          </select>
                          <button
                            onClick={confirmDelete}
                            disabled={busy || !action.remapTo}
                            className="shrink-0 px-3 py-1.5 bg-red-700 text-white text-xs font-medium rounded-lg hover:bg-red-600 disabled:opacity-40 transition-colors"
                          >
                            {busy ? '…' : 'Remap & delete'}
                          </button>
                          <button onClick={cancel} className="shrink-0 text-xs text-gray-600 hover:text-gray-400">
                            Cancel
                          </button>
                        </div>
                        {error && <p className="text-xs text-red-400">{error}</p>}
                      </>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Root client component ──────────────────────────────────────────────────

export default function RollupsClient({
  rollup1Groups: initial1,
  rollup2Groups: initial2,
}: {
  rollup1Groups: RollupGroup[]
  rollup2Groups: RollupGroup[]
}) {
  const [groups1, setGroups1] = useState(initial1)
  const [groups2, setGroups2] = useState(initial2)

  return (
    <div className="space-y-10">
      <RollupSection
        title="Roll-up 1 — Granular groups"
        subtitle="Direct category groupings (e.g. Food & Dining, Transport, Housing)"
        field="roll_up_1"
        groups={groups1}
        onGroupsChange={setGroups1}
      />
      <RollupSection
        title="Roll-up 2 — High-level groups"
        subtitle="Top-level buckets used in summary reports (e.g. Living, Lifestyle)"
        field="roll_up_2"
        groups={groups2}
        onGroupsChange={setGroups2}
      />
    </div>
  )
}
