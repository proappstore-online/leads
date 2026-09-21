import { useState } from 'react'
import { x } from '../lib/actions'
import { SOCIALS, isProfileLink } from '../lib/socials'
import { STATUSES, type Lead, type LeadFields, type LeadList } from '../types'
import { Conversation } from './Conversation'
import { Modal } from './Modal'
import { inputClass } from './styles'


const CONTACT: { key: keyof LeadFields; label: string; type?: string; placeholder?: string }[] = [
  { key: 'title', label: 'Title / role', placeholder: 'Head of Partnerships' },
  { key: 'company', label: 'Company' },
  { key: 'source', label: 'Found in', placeholder: 'Facebook group: Jobs in Melbourne' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'website', label: 'Website', placeholder: 'example.com' },
  { key: 'location', label: 'Location', placeholder: 'Sydney, Australia' },
]

const EMPTY: LeadFields = {
  name: '', title: '', company: '', source: '', email: '', phone: '', website: '', location: '',
  linkedin: '', twitter: '', instagram: '', facebook: '', tiktok: '', youtube: '', github: '',
  status: 'new', notes: '',
}

function toFields(lead: Lead): LeadFields {
  const fields = { ...EMPTY }
  for (const key of Object.keys(EMPTY) as (keyof LeadFields)[]) fields[key] = lead[key] ?? ''
  return fields
}

export function LeadForm({ lead, lists, defaultListId, onClose, onSaved }: {
  lead: Lead | null
  lists: LeadList[]
  /** List being browsed when "Add lead" was pressed — preselected for new leads. */
  defaultListId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const memberOf = lead ? (lead.list_ids?.split(',') ?? []) : defaultListId ? [defaultListId] : []
  const [fields, setFields] = useState<LeadFields>(lead ? toFields(lead) : EMPTY)
  const [selected, setSelected] = useState<Set<string>>(new Set(memberOf))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'details' | 'conversation'>('details')
  // Messages save immediately, so closing after a change must still refresh the table.
  const [messagesChanged, setMessagesChanged] = useState(false)
  const close = messagesChanged ? onSaved : onClose

  const set = (key: keyof LeadFields, value: string) => setFields((f) => ({ ...f, [key]: value }))

  function toggleList(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (!next.delete(id)) next.add(id)
      return next
    })
  }

  async function run(task: () => Promise<void>) {
    setSaving(true)
    try {
      await task()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const notLinks = SOCIALS.filter(({ key, domains }) => fields[key].trim() && !isProfileLink(domains, fields[key].trim()))
    if (notLinks.length > 0) {
      setError(notLinks.map(({ label, example }) => `${label} must be the full profile link, like ${example} — not a name or handle. Clear it if you don't have the link.`).join(' '))
      return
    }
    const id = lead?.id ?? crypto.randomUUID()
    const params: Record<string, unknown> = { id }
    for (const [key, value] of Object.entries(fields)) params[key] = value.trim() || null
    const before = new Set(lead ? memberOf : [])
    run(async () => {
      const { changes } = await x(lead ? 'update_lead' : 'create_lead', params)
      // The actions refuse the whole write when a social field is not a profile link.
      if (changes === 0) throw new Error('Not saved: every social profile must be a full https:// profile link.')
      await Promise.all([
        ...[...selected].filter((l) => !before.has(l)).map((list_id) => x('add_lead_to_list', { lead_id: id, list_id })),
        ...[...before].filter((l) => !selected.has(l)).map((list_id) => x('remove_lead_from_list', { lead_id: id, list_id })),
      ])
    })
  }

  function remove() {
    if (!lead || !confirm(`Delete ${lead.name}? This removes them from every list.`)) return
    run(() => x('delete_lead', { id: lead.id }).then(() => undefined))
  }

  return (
    <Modal title={lead ? lead.name : 'Add lead'} onClose={close}>
      {lead && (
        <div role="tablist" className="mt-3 flex gap-1 border-b border-[var(--line)]">
          {(['details', 'conversation'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold capitalize ${tab === t ? 'border-[var(--accent)] text-[var(--ink)]' : 'border-transparent text-[var(--muted)]'}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}
      {lead && tab === 'conversation' && <Conversation lead={lead} onChanged={() => setMessagesChanged(true)} />}
      <form onSubmit={save} hidden={tab !== 'details'} className="mt-4 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--ink)]">Name</span>
            <input type="text" value={fields.name} onChange={(e) => set('name', e.target.value)} required autoFocus className={inputClass} />
          </label>
          {CONTACT.map(({ key, label, type, placeholder }) => (
            <label key={key} className="block">
              <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
              <input type={type ?? 'text'} value={fields[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder} className={inputClass} />
            </label>
          ))}
        </div>

        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Social profiles — links only</legend>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {SOCIALS.map(({ key, label, domains, example }) => (
              <label key={key} className="block">
                <span className="text-sm font-medium text-[var(--ink)]">{label}</span>
                <input
                  type="text"
                  inputMode="url"
                  value={fields[key]}
                  onChange={(e) => set(key, e.target.value)}
                  placeholder={example}
                  aria-invalid={Boolean(fields[key].trim()) && !isProfileLink(domains, fields[key].trim())}
                  className={`${inputClass} aria-[invalid=true]:border-[var(--error)]`}
                />
              </label>
            ))}
          </div>
        </fieldset>

        {lists.length > 0 && (
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Lists</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  aria-pressed={selected.has(list.id)}
                  onClick={() => toggleList(list.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${selected.has(list.id) ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'border-[var(--line-strong)] text-[var(--muted)]'}`}
                >
                  {list.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Status</span>
            <select value={fields.status} onChange={(e) => set('status', e.target.value)} className={`${inputClass} capitalize`}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--ink)]">Notes</span>
            <textarea value={fields.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${inputClass} resize-none`} />
          </label>
        </div>

        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex items-center justify-between">
          {lead ? (
            <button type="button" onClick={remove} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--line)]">Delete lead</button>
          ) : <span />}
          <button type="submit" disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Save</button>
        </div>
      </form>
    </Modal>
  )
}
