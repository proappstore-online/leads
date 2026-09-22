import { useState } from 'react'
import { q, x } from '../lib/actions'
import { COUNTRY_OPTIONS, countryName } from '../lib/countries'
import { SOCIALS, isProfileLink } from '../lib/socials'
import { FITS, STATUSES, type Lead, type LeadFields, type LeadList, type Project, type ProjectMember, type Source } from '../types'
import { Conversation } from './Conversation'
import { LeadView } from './LeadView'
import { Modal } from './Modal'
import { inputClass } from './styles'


const CONTACT: { key: keyof LeadFields; label: string; type?: string; placeholder?: string }[] = [
  { key: 'title', label: 'Title / role', placeholder: 'Head of Partnerships' },
  { key: 'company', label: 'Company' },
  { key: 'email', label: 'Email', type: 'email' },
  { key: 'phone', label: 'Phone', type: 'tel' },
  { key: 'website', label: 'Website', placeholder: 'example.com' },
  { key: 'location', label: 'Location', placeholder: 'Sydney, Australia' },
]

const EMPTY: LeadFields = {
  name: '', title: '', company: '', source_id: '', source_url: '', email: '', phone: '', website: '', location: '', country: '',
  linkedin: '', twitter: '', instagram: '', facebook: '', tiktok: '', youtube: '', github: '',
  fit: '', status: 'new', notes: '',
}

function toFields(lead: Lead): LeadFields {
  const fields = { ...EMPTY }
  for (const key of Object.keys(EMPTY) as (keyof LeadFields)[]) fields[key] = lead[key] ?? ''
  return fields
}

export function LeadForm({ lead, lists, sources, projects, members, userId, defaultListId, onClose, onSaved }: {
  lead: Lead | null
  lists: LeadList[]
  sources: Source[]
  projects: Project[]
  /** Members of your projects — the people a lead can be assigned to. */
  members: ProjectMember[]
  /** The signed-in user's id. */
  userId: string
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
  // An existing lead opens read-only; the form is one click away.
  const [editing, setEditing] = useState(!lead)
  // Messages and flags save immediately, so closing after one must still refresh the table.
  const [savedInPlace, setSavedInPlace] = useState(false)
  const close = savedInPlace ? onSaved : onClose
  const [attentionReason, setAttentionReason] = useState('')
  const [attention, setAttention] = useState({ on: Boolean(lead?.needs_attention), reason: lead?.attention_reason ?? null, at: lead?.attention_at ?? null })
  /** updated_at as last read - saving is refused if the lead changed since (e.g. an agent edited it). */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(lead?.updated_at ?? null)
  const [assignee, setAssignee] = useState(lead?.assigned_to_user_id ?? null)
  const [status, setStatus] = useState(lead?.status ?? 'new')
  // Someone else's lead assigned to you: status, flag and new messages only.
  const shared = Boolean(lead?.shared)
  const sharedIn = shared ? projects.find((p) => p.id === lead?.project_id) : undefined
  // A lead can be assigned to members of the projects its lists belong to.
  const leadProjects = new Set(memberOf.map((id) => lists.find((l) => l.id === id)?.project_id).filter(Boolean))
  const assignable = [...new Map(members.filter((m) => leadProjects.has(m.project_id)).map((m) => [m.user_id, m])).values()]

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

  /** Save one change without closing the form, so unsaved edits stay, then re-read the lead. */
  async function saveInPlace(action: string, params: Record<string, unknown>, refused: string): Promise<boolean> {
    if (!lead) return false
    setSaving(true)
    try {
      const { changes } = await x(action, { id: lead.id, ...params })
      if (changes === 0) throw new Error(refused)
      const [fresh] = await q<Lead>('get_lead', { id: lead.id })
      if (fresh) {
        setAttention({ on: Boolean(fresh.needs_attention), reason: fresh.attention_reason, at: fresh.attention_at })
        setBaseUpdatedAt(fresh.updated_at)
        setAssignee(fresh.assigned_to_user_id)
        setStatus(fresh.status)
      }
      setSavedInPlace(true)
      setError('')
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      return false
    } finally {
      setSaving(false)
    }
  }

  const setFlag = (action: 'flag_needs_attention' | 'clear_needs_attention') =>
    saveInPlace(action, action === 'flag_needs_attention' ? { reason: attentionReason.trim() } : {}, 'Not saved - this lead may have been deleted.')
      .then((saved) => { if (saved) setAttentionReason('') })

  function save(e: React.FormEvent) {
    e.preventDefault()
    const notLinks = SOCIALS.filter(({ key, domains }) => fields[key].trim() && !isProfileLink(domains, fields[key].trim()))
    if (notLinks.length > 0) {
      setError(notLinks.map(({ label, example }) => `${label} must be the full profile link, like ${example} — not a name or handle. Clear it if you don't have the link.`).join(' '))
      return
    }
    if (fields.source_url.trim() && !/^https:\/\/\S+$/i.test(fields.source_url.trim())) {
      setError('Found-in link must be a full https:// link to the post or page. Clear it if you don\'t have one.')
      return
    }
    const id = lead?.id ?? crypto.randomUUID()
    const params: Record<string, unknown> = { id }
    for (const [key, value] of Object.entries(fields)) params[key] = value.trim() || null
    if (lead) params.if_unchanged_since = baseUpdatedAt
    const before = new Set(lead ? memberOf : [])
    run(async () => {
      const { changes } = await x(lead ? 'update_lead' : 'create_lead', params)
      // The actions refuse the whole write on a non-link social field or a duplicate email / profile link.
      if (changes === 0) throw new Error(lead
        ? 'Not saved. Either this lead was changed by someone else (for example an agent) since you opened it - close and reopen it to see the latest - or a link is not a full https:// link, another lead already has this email or profile link, or the source no longer exists.'
        : 'Not saved. Either a link is not a full https:// link, another lead already has this email or profile link, or the source no longer exists.')
      await Promise.all([
        ...[...selected].filter((l) => !before.has(l)).map((list_id) => x('add_lead_to_list', { lead_id: id, list_id })),
        ...[...before].filter((l) => !selected.has(l)).map((list_id) => x('remove_lead_from_list', { lead_id: id, list_id })),
      ])
    })
  }

  function cancelEdit() {
    if (!lead) return
    setFields(toFields(lead))
    setSelected(new Set(memberOf))
    setError('')
    setEditing(false)
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
      {lead && (attention.on ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-4 py-3">
          <div className="min-w-0 select-text">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--warning)]">
              Needs attention{attention.at ? ` · ${new Date(attention.at).toLocaleString()}` : ''}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink)]">{attention.reason}</p>
          </div>
          {!shared && <button type="button" disabled={saving} onClick={() => setFlag('clear_needs_attention')} className="shrink-0 rounded-xl bg-[var(--warning)] px-3 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Mark handled</button>}
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <input type="text" aria-label="Why this lead needs attention" value={attentionReason} onChange={(e) => setAttentionReason(e.target.value)} placeholder="Flag as needs attention — say why" className={`${inputClass} mt-0`} />
          <button type="button" disabled={saving || !attentionReason.trim()} onClick={() => setFlag('flag_needs_attention')} className="shrink-0 rounded-xl border border-[var(--warning)] px-3 py-2 text-sm font-semibold text-[var(--warning)] disabled:opacity-40">Flag</button>
        </div>
      ))}
      {lead && (shared ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-[var(--muted)]">Assigned to you{sharedIn ? ` in ${sharedIn.name}, shared by ${sharedIn.owner_name ?? 'its owner'}` : ' in a shared project'}</span>
          <select aria-label="Status" value={status} disabled={saving} onChange={(e) => saveInPlace('set_lead_status', { status: e.target.value }, 'Not saved - this lead is no longer assigned to you.')} className={`${inputClass} mt-0 w-auto capitalize`}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ) : (
        <label className="mt-3 flex items-center gap-3 text-sm">
          <span className="shrink-0 font-medium text-[var(--ink)]">Assigned to</span>
          <select
            value={assignee === userId ? 'me' : assignee ?? ''}
            disabled={saving}
            onChange={(e) => saveInPlace('assign_lead', { user_id: e.target.value || null }, 'Not saved - that person is not a member of a project this lead\'s lists belong to.')}
            className={`${inputClass} mt-0`}
          >
            <option value="">Nobody</option>
            <option value="me">Me</option>
            {assignable.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name ?? 'Unnamed member'}</option>)}
            {assignee && assignee !== userId && !assignable.some((m) => m.user_id === assignee) && (
              <option value={assignee}>{members.find((m) => m.user_id === assignee)?.display_name ?? 'Former member'} (not in this lead's projects)</option>
            )}
          </select>
        </label>
      ))}
      {lead && !shared && leadProjects.size === 0 && <p className="mt-1 text-xs text-[var(--muted)]">To assign this lead to someone else, put it in a list of a project they joined.</p>}
      {lead && tab === 'conversation' && <Conversation lead={lead} readOnlyHistory={shared} onChanged={() => setSavedInPlace(true)} />}
      {lead && tab === 'details' && !editing && (
        <>
          {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
          <LeadView lead={{ ...lead, status }} lists={lists} onEdit={shared ? undefined : () => setEditing(true)} />
        </>
      )}
      <form onSubmit={save} hidden={tab !== 'details' || !editing} className="mt-4 space-y-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--ink)]">Name</span>
            <input type="text" value={fields.name} onChange={(e) => set('name', e.target.value)} required autoFocus className={inputClass} />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Country <span className="font-normal text-[var(--muted)]">— confirmed, not guessed</span></span>
            <select value={fields.country} onChange={(e) => set('country', e.target.value)} required={!lead} className={inputClass}>
              {/* A set country can be changed but not cleared, so only offer an empty choice when there is none. */}
              {!lead?.country && <option value="">{lead ? 'Not confirmed yet' : 'Choose the country'}</option>}
              {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
            </select>
            {lead && !lead.country && <span className="mt-1 block text-xs text-[var(--warning)]">Added before country was required - set it once you have confirmed it.</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Found in</span>
            <select value={fields.source_id} onChange={(e) => set('source_id', e.target.value)} className={inputClass}>
              <option value="">No source</option>
              {sources.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.kind})</option>)}
            </select>
            {!fields.source_id && lead?.source && <span className="mt-1 block text-xs text-[var(--muted)]">Previously noted: {lead.source}</span>}
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Found-in post link</span>
            <input type="text" inputMode="url" value={fields.source_url} onChange={(e) => set('source_url', e.target.value)} placeholder="https://www.facebook.com/groups/…/posts/…" className={inputClass} />
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
          <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Fit</span>
            <select value={fields.fit} onChange={(e) => set('fit', e.target.value)} className={`${inputClass} capitalize`}>
              <option value="">Not rated</option>
              {FITS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Status</span>
            <select value={fields.status} onChange={(e) => set('status', e.target.value)} className={`${inputClass} capitalize`}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </label>
          </div>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-[var(--ink)]">Notes</span>
            <textarea value={fields.notes} onChange={(e) => set('notes', e.target.value)} rows={6} className={`${inputClass} resize-none`} />
          </label>
        </div>

        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex items-center justify-between">
          {lead ? (
            <button type="button" onClick={remove} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--line)]">Delete lead</button>
          ) : <span />}
          <div className="flex gap-2">
            {lead && <button type="button" onClick={cancelEdit} disabled={saving} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--line)]">Cancel</button>}
            <button type="submit" disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Save</button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
