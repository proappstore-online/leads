import { useCallback, useEffect, useState } from 'react'
import { q, x } from '../lib/actions'
import type { HistoryEntry, Lead, Source } from '../types'
import { inputClass } from './styles'

const LABELS: Record<string, string> = {
  status: 'Status', fit: 'Fit', notes: 'Notes', next_action_at: 'Follow-up', next_action: 'Next action', assigned_to_user_id: 'Assigned to',
  needs_attention: 'Needs attention', attention_reason: 'Attention reason', tags: 'Tags', custom_fields: 'Custom fields', source_id: 'Found in',
  source_url: 'Found-in post', found_at: 'Found', email: 'Email', phone: 'Phone', website: 'Website', location: 'Location', country: 'Country',
  name: 'Name', title: 'Title', company: 'Company', linkedin: 'LinkedIn', twitter: 'X', instagram: 'Instagram', facebook: 'Facebook',
  tiktok: 'TikTok', youtube: 'YouTube', github: 'GitHub',
}

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

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
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      setEntries(await q<HistoryEntry>('get_lead_history', { id: lead.id }))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [lead.id])

  useEffect(() => { load() }, [load])

  async function addNote(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      await x('add_note', { id: lead.id, note: note.trim() })
      setNote('')
      onChanged()
      await load()
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function show(field: string, value: unknown): string {
    if (value === null || value === undefined || value === '') return '—'
    if (field === 'next_action_at' || field === 'found_at') return when(Number(value))
    if (field === 'assigned_to_user_id') return people.get(String(value)) ?? 'someone'
    if (field === 'needs_attention') return value ? 'flagged' : 'cleared'
    if (field === 'source_id') return sources.find((s) => s.id === value)?.name ?? 'a source'
    if (Array.isArray(value)) return value.join(', ')
    if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ')
    const text = String(value)
    return text.length > 200 ? `${text.slice(0, 200)}…` : text
  }

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={addNote} className="flex gap-2">
        <input type="text" aria-label="Add a note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note — what happened, what was agreed" className={`${inputClass} mt-0`} />
        <button type="submit" disabled={saving || !note.trim()} className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-50">Add</button>
      </form>
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      {entries === null ? (
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      ) : (
        <ol className="space-y-3 border-l-2 border-[var(--line)] pl-4">
          {entries.map((h) => {
            const changes = h.changes ? Object.entries(JSON.parse(h.changes) as Record<string, [unknown, unknown]>) : []
            return (
              <li key={h.seq} className="text-sm">
                <div className="text-xs text-[var(--muted)]">{when(h.at)} · {people.get(h.by_user_id) ?? 'Owner'}</div>
                {h.note && <p className="mt-1 whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2 text-[var(--ink)] [overflow-wrap:anywhere]">{h.note}</p>}
                {h.via === 'create_lead' && <p className="mt-0.5 text-[var(--ink)]">Lead added</p>}
                {changes.map(([field, [from, to]]) => field === 'notes' ? (
                  <details key={field} className="mt-0.5 text-[var(--ink)]">
                    <summary className="cursor-pointer"><span className="font-semibold">Notes</span> edited</summary>
                    <p className="mt-1 whitespace-pre-wrap text-[var(--muted)] [overflow-wrap:anywhere]">Before: {from ? String(from) : '—'}</p>
                    <p className="mt-1 whitespace-pre-wrap [overflow-wrap:anywhere]">After: {to ? String(to) : '—'}</p>
                  </details>
                ) : (
                  <p key={field} className="mt-0.5 text-[var(--ink)] [overflow-wrap:anywhere]">
                    <span className="font-semibold">{LABELS[field] ?? field}</span>: <span className="text-[var(--muted)]">{show(field, from)}</span> → {show(field, to)}
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
