import { useCallback, useEffect, useState } from 'react'
import { q, x } from '../lib/actions'
import { PLATFORMS, type Lead, type Message } from '../types'
import { inputClass } from './styles'

const PAGE = 500

/** Epoch ms → the local `YYYY-MM-DDTHH:mm` string a datetime-local input expects. */
function toInputValue(ms: number): string {
  const d = new Date(ms)
  return new Date(ms - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function Conversation({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const [messages, setMessages] = useState<Message[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Message | null>(null)
  const [platform, setPlatform] = useState<string>(PLATFORMS[0])
  const [direction, setDirection] = useState<Message['direction']>('out')
  const [occurredAt, setOccurredAt] = useState(() => toInputValue(Date.now()))
  const [body, setBody] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async (offset: number) => {
    setLoading(true)
    try {
      const rows = await q<Message>('list_messages', { lead_id: lead.id, limit: PAGE, offset })
      setMessages((prev) => (offset ? [...prev, ...rows] : rows))
      setHasMore(rows.length === PAGE)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [lead.id])

  useEffect(() => { load(0) }, [load])

  async function run(task: () => Promise<unknown>) {
    setSaving(true)
    try {
      await task()
      onChanged()
      await load(0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function startEdit(message: Message) {
    setEditing(message)
    setPlatform(message.platform)
    setDirection(message.direction)
    setOccurredAt(toInputValue(message.occurred_at))
    setBody(message.body)
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const fields = { platform, direction, body: body.trim(), occurred_at: new Date(occurredAt).getTime() }
    run(async () => {
      if (editing) await x('update_message', { id: editing.id, ...fields })
      else await x('add_message', { id: crypto.randomUUID(), lead_id: lead.id, ...fields })
      // Platform, direction and time stay put — handy when logging a thread message by message.
      setEditing(null)
      setBody('')
    })
  }

  function remove(message: Message) {
    if (!confirm('Delete this message?')) return
    run(() => x('delete_message', { id: message.id }))
  }

  // A message edited from an agent-supplied platform keeps it selectable.
  const platforms = PLATFORMS.includes(platform as (typeof PLATFORMS)[number]) ? PLATFORMS : [...PLATFORMS, platform]

  return (
    <div className="mt-4 space-y-4">
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}

      {messages.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-8 text-center text-sm text-[var(--muted)]">
          {loading ? 'Loading…' : 'No messages recorded yet.'}
        </p>
      ) : (
        <ol className="select-text space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={`flex flex-col ${m.direction === 'out' ? 'items-end' : 'items-start'}`}>
              <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm text-[var(--ink)] ${m.direction === 'out' ? 'bg-[var(--accent-soft)]' : 'border border-[var(--line)] bg-[var(--glass)]'}`}>
                {m.body}
              </div>
              <div className="mt-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                <span>{m.direction === 'out' ? 'You' : lead.name} · {m.platform} · <time dateTime={new Date(m.occurred_at).toISOString()}>{new Date(m.occurred_at).toLocaleString()}</time></span>
                <button type="button" onClick={() => startEdit(m)} className="font-semibold hover:text-[var(--ink)]">Edit</button>
                <button type="button" onClick={() => remove(m)} className="font-semibold hover:text-[var(--error)]">Delete</button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {hasMore && (
        <button type="button" onClick={() => load(messages.length)} disabled={loading} className="w-full rounded-xl border border-[var(--line-strong)] py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-60">Load later messages</button>
      )}

      <form onSubmit={save} className="space-y-3 border-t border-[var(--line)] pt-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Platform</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)} className={inputClass}>
              {platforms.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Who sent it</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as Message['direction'])} className={inputClass}>
              <option value="out">Me</option>
              <option value="in">{lead.name}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Date and time</span>
            <input type="datetime-local" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required className={inputClass} />
          </label>
        </div>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Message</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} required className={`${inputClass} resize-none`} />
        </label>
        <div className="flex items-center justify-end gap-2">
          {editing && (
            <button type="button" onClick={() => { setEditing(null); setBody('') }} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--line)]">Cancel edit</button>
          )}
          <button type="submit" disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Save message</button>
        </div>
      </form>
    </div>
  )
}
