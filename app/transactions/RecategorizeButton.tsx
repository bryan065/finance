'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function RecategorizeButton() {
  const router = useRouter()
  const [state,   setState]   = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [result,  setResult]  = useState<{ updated: number; skipped: number } | null>(null)
  const [errMsg,  setErrMsg]  = useState('')

  async function handleClick() {
    setState('loading')
    setErrMsg('')
    try {
      const res  = await fetch('/api/transactions/recategorize', { method: 'POST' })
      const text = await res.text()

      // Guard: server might return empty body on unexpected crash
      if (!text) {
        setErrMsg('Server returned an empty response')
        setState('error')
        return
      }

      const data = JSON.parse(text)

      if (!res.ok) {
        setErrMsg(data?.error ?? `Error ${res.status}`)
        setState('error')
        return
      }

      setResult(data)
      setState('done')
      router.refresh()
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : 'Unknown error')
      setState('error')
    }
  }

  if (state === 'done' && result) {
    return (
      <span className="text-xs text-gray-500">
        ✓ {result.updated} recategorized
      </span>
    )
  }

  if (state === 'error') {
    return (
      <span className="text-xs text-red-500 max-w-xs truncate" title={errMsg}>
        ✗ {errMsg}
      </span>
    )
  }

  return (
    <button
      onClick={handleClick}
      disabled={state === 'loading'}
      className="px-3 py-1.5 text-xs text-gray-500 border border-gray-800 rounded-lg hover:border-gray-600 hover:text-gray-400 transition-colors disabled:opacity-40"
    >
      {state === 'loading' ? 'Categorizing…' : 'Re-categorize'}
    </button>
  )
}
