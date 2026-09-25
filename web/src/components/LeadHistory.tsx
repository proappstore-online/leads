import { useCallback, useEffect, useState } from 'react'
import { q, x } from '../lib/actions'
import { fieldLabel, formatValue, when } from '../lib/history'
import type { HistoryEntry, Lead, Source } from '../types'
import { inputClass } from './styles'
import { EmptyState, LoadingState, RetryState } from './AsyncState'

/** A lead's timestamped notes and changes, newest first, with a box to add a note. */
export function LeadHistory({ lead, people, sources, onChanged }: {
  lead: Lead
  /** Names by user id — you as "You". */
  people: Map<string, string>
  sources: Source[]
  onChanged: () => void
}) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null)
  const [note, setNote] = useState('')
  // Keep this after a request failure: the server may have recorded the note before its response
  // was lost, so a retry must identify the same mutation.
  const [mutationId, setMutationId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      setEntries(await q<HistoryEntry>('get_lead_history', { id: lead.id }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [lead.id])

  useEffect(() => { load() }, [load])

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    const clientMutationId = mutationId ?? crypto.randomUUID()
    setMutationId(clientMutationId)
    setSaving(true)
    try {
      await x('add_note', { id: lead.id, note: note.trim(), client_mutation_id: clientMutationId })
      setNote('')
      setMutationId(null)
      onChanged()
      await load()
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const show = (field: string, value: unknown) => formatValue(field, value, { people, sources })

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={addNote} className="flex gap-2">
        <input type="text" aria-label="Add a note" value={note} onChange={(e) => { setNote(e.target.value); setMutationId(null) }} placeholder="Add a note — what happened, what was agreed" className={`${inputClass} mt-0`} />
        <button type="submit" disabled={saving || !note.trim()} className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-50">Add</button>
      </form>
      {error ? <RetryState error={error} onRetry={load} /> : entries === null ? (
        <LoadingState label="Loading history…" />
      ) : entries.length === 0 ? (
        <EmptyState>No history yet. Add a note to record what happens next.</EmptyState>
      ) : (
        <ol className="space-y-3 border-l-2 border-[var(--line)] pl-4">
          {entries.map((h) => {
            const changes = h.changes ? Object.entries(JSON.parse(h.changes) as Record<string, [unknown, unknown]>) : []
            return (
              <li key={h.seq} className="text-sm">
                <div className="text-xs text-[var(--muted)]">{when(h.at)} · {people.get(h.by_user_id) ?? 'Owner'}</div>
                {h.note && <p className="mt-1 whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-[var(--ink)] [overflow-wrap:anywhere]">{h.note}</p>}
                {h.via === 'create_lead' && <p className="mt-0.5 text-[var(--ink)]">Lead added</p>}
                {changes.map(([field, [from, to]]) => field === 'notes' ? (
                  <details key={field} className="mt-0.5 text-[var(--ink)]">
                    <summary className="cursor-pointer"><span className="font-semibold">Notes</span> edited</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[var(--muted)] [overflow-wrap:anywhere]">Before: {from ? String(from) : '—'}</p>
                    <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">After: {to ? String(to) : '—'}</p>
                  </details>
                ) : (
                  <p key={field} className="mt-0.5 text-[var(--ink)] [overflow-wrap:anywhere]">
                    <span className="font-semibold">{fieldLabel(field)}</span>: <span className="text-[var(--muted)]">{show(field, from)}</span> → {show(field, to)}
                  </p>
                ))}
              </li>
            )
          })}
          <li className="text-xs text-[var(--muted)]">
            Added {when(lead.created_at)}. Changes before history was switched on are not listed.
          </li>
        </ol>
      )}
    </div>
  )
}
