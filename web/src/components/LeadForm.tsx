import { useRef, useState } from 'react'
import { q, x } from '../lib/actions'
import { COUNTRY_OPTIONS, countryName } from '../lib/countries'
import { leadCustomFields, leadTags, projectOf } from '../lib/lead'
import { SOCIALS, isProfileLink } from '../lib/socials'
import { FITS, STATUSES, type Lead, type LeadFields, type LeadList, type Project, type ProjectMember, type Source } from '../types'
import { Conversation } from './Conversation'
import { LeadHistory } from './LeadHistory'
import { LeadPanel, type SaveInPlace } from './LeadPanel'
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

export function LeadForm({ lead, lists, sources, projects, members, people, userId, defaultListId, onClose, onSaved }: {
  lead: Lead | null
  lists: LeadList[]
  sources: Source[]
  projects: Project[]
  /** Members of your projects — the people a lead can be assigned to. */
  members: ProjectMember[]
  /** Names by user id, you included — for assignments and history. */
  people: Map<string, string>
  /** The signed-in user's id. */
  userId: string
  /** List being browsed when "Add lead" was pressed — preselected for new leads. */
  defaultListId: string | null
  onClose: () => void
  onSaved: () => void
}) {
  const [snapshot, setSnapshot] = useState(lead)
  const memberOf = snapshot ? (snapshot.list_ids?.split(',') ?? []) : defaultListId ? [defaultListId] : []
  const [fields, setFields] = useState<LeadFields>(lead ? toFields(lead) : EMPTY)
  const [selected, setSelected] = useState<Set<string>>(new Set(memberOf))
  // One identity for the lifetime of this form, including transport retries.
  const [saveId] = useState(() => lead?.id ?? crypto.randomUUID())
  const retainedDraft = useRef(false)
  const pendingSave = useRef<{ request_id: string; payload: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<'details' | 'conversation' | 'history'>('details')
  // An existing lead opens read-only; the form is one click away.
  const [editing, setEditing] = useState(!lead)
  // Messages and flags save immediately, so closing after one must still refresh the table.
  const [savedInPlace, setSavedInPlace] = useState(false)
  const close = savedInPlace ? onSaved : onClose
  /** updated_at as last read - saving is refused if the lead changed since (e.g. an agent edited it). */
  const [baseUpdatedAt, setBaseUpdatedAt] = useState(lead?.updated_at ?? null)
  const [tagsText, setTagsText] = useState(lead ? leadTags(lead).join(', ') : '')
  const [customRows, setCustomRows] = useState<[string, string][]>(lead ? leadCustomFields(lead) : [])
  // Read the latest draft after the request, including edits made while it was pending.
  const draft = useRef({ fields, selected, tagsText, customRows })
  draft.current = { fields, selected, tagsText, customRows }
  // Someone else's lead assigned to you: status, flag and new messages only.
  const shared = Boolean(lead?.shared)
  const sharedIn = shared ? projects.find((p) => p.id === lead?.project_id) : undefined

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

  /**
   * Save one change without closing the form (LeadPanel's flag, assignment, status and follow-up),
   * then reconcile its server snapshot with unsaved edits.
   */
  const saveInPlace: SaveInPlace = async (action, params, refused) => {
    if (!lead) return false
    setSaving(true)
    try {
      const { changes } = await x(action, { id: lead.id, ...params })
      if (changes === 0) throw new Error(refused)
      const [fresh] = await q<Lead>('get_lead', { id: lead.id })
      if (!fresh) throw new Error('Could not refresh this lead. Close and reopen it before editing.')
      if (snapshot) {
        const current = draft.current
        const original = toFields(snapshot)
        const next = toFields(fresh)
        let dirty = false
        for (const key of Object.keys(original) as (keyof LeadFields)[]) {
          if (current.fields[key] !== original[key]) {
            next[key] = current.fields[key]
            dirty = true
          }
        }
        const listsDirty = JSON.stringify([...current.selected].sort()) !== JSON.stringify([...memberOf].sort())
        const tagsDirty = current.tagsText !== leadTags(snapshot).join(', ')
        const customDirty = JSON.stringify(current.customRows) !== JSON.stringify(leadCustomFields(snapshot))
        setFields(next)
        if (!listsDirty) setSelected(new Set(fresh.list_ids?.split(',') ?? []))
        if (!tagsDirty) setTagsText(leadTags(fresh).join(', '))
        if (!customDirty) setCustomRows(leadCustomFields(fresh))
        // A retained draft still belongs to the old version; never bless it with a new token.
        retainedDraft.current ||= dirty || listsDirty || tagsDirty || customDirty
        if (!retainedDraft.current) setBaseUpdatedAt(fresh.updated_at)
        setSnapshot(fresh)
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
    const tags = [...new Map(tagsText.split(',').map((t) => t.trim()).filter(Boolean).map((t) => [t.toLowerCase(), t])).values()]
    const custom = customRows.filter(([k]) => k.trim()).map(([k, v]) => [k.trim(), v.trim()] as const)
    if (tags.some((t) => t.length > 40) || custom.some(([k]) => k.length > 40)) {
      setError('Tags and field names can be up to 40 characters.')
      return
    }
    if (saving) return
    const params: Record<string, unknown> = { id: saveId, mode: lead ? 'update' : 'create' }
    for (const [key, value] of Object.entries(fields)) params[key] = value.trim() || null
    if (lead) params.if_unchanged_since = baseUpdatedAt
    const listParam = (id: string) => ({ id, project_id: projectOf(lists.find((l) => l.id === id) ?? { project_id: null }) })
    params.lists = [...selected].map(listParam)
    params.removed_lists = memberOf.filter((id) => !selected.has(id)).map(listParam)
    params.tags = JSON.stringify(tags)
    params.fields = JSON.stringify(Object.fromEntries(custom))
    const payload = JSON.stringify(params)
    if (!pendingSave.current || pendingSave.current.payload !== payload) {
      pendingSave.current = { request_id: crypto.randomUUID(), payload }
    }
    const request = pendingSave.current
    run(async () => {
      try {
        const { changes } = await x('save_lead_form', request)
        if (changes !== 1) throw new Error('Save was not confirmed.')
      } catch {
        throw new Error('Save could not be confirmed. Retry with the same values to safely finish. If it is still refused, close and reopen the lead to check for changes, duplicate email or profile links, and unavailable sources or lists.')
      }
    })
  }

  function cancelEdit() {
    if (!snapshot) return
    setFields(toFields(snapshot))
    retainedDraft.current = false
    setBaseUpdatedAt(snapshot.updated_at)
    setSelected(new Set(memberOf))
    setTagsText(leadTags(snapshot).join(', '))
    setCustomRows(leadCustomFields(snapshot))
    setError('')
    setEditing(false)
  }

  function remove() {
    if (!lead || !confirm(`Delete ${lead.name}? This removes them from every list.`)) return
    run(() => x('delete_lead', { id: lead.id }).then(() => undefined))
  }

  return (
    <Modal title={snapshot ? snapshot.name : 'Add lead'} onClose={close}>
      {lead && (
        <div role="tablist" className="mt-3 flex gap-1 border-b border-[var(--line)]">
          {(['details', 'conversation', 'history'] as const).map((t) => (
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
      {snapshot && <LeadPanel lead={snapshot} lists={lists} members={members} userId={userId} shared={shared} sharedIn={sharedIn} saving={saving} onSave={saveInPlace} />}
      {lead && tab === 'conversation' && <Conversation lead={lead} readOnlyHistory={shared} onChanged={() => setSavedInPlace(true)} />}
      {lead && tab === 'history' && <LeadHistory lead={lead} people={people} sources={sources} onChanged={() => setSavedInPlace(true)} />}
      {lead && tab === 'details' && !editing && (
        <>
          {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
          <LeadView lead={snapshot!} lists={lists} onEdit={shared ? undefined : () => setEditing(true)} />
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

        <fieldset className="min-w-0">
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
          <fieldset className="min-w-0">
            <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Lists</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {lists.map((list) => (
                <button
                  key={list.id}
                  type="button"
                  aria-pressed={selected.has(list.id)}
                  onClick={() => toggleList(list.id)}
                  className={`min-w-0 max-w-full truncate rounded-full border px-3 py-1.5 text-xs font-semibold ${selected.has(list.id) ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'border-[var(--line-strong)] text-[var(--muted)]'}`}
                >
                  {list.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Tags <span className="font-normal text-[var(--muted)]">— separated by commas</span></span>
          <input type="text" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="investor, warm intro" className={inputClass} />
        </label>

        <fieldset className="min-w-0">
          <legend className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Your fields</legend>
          <div className="mt-2 space-y-2">
            {customRows.map(([key, value], i) => (
              <div key={i} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)_auto] gap-2">
                <input type="text" aria-label="Field name" value={key} onChange={(e) => setCustomRows((rows) => rows.map((r, j) => (j === i ? [e.target.value, r[1]] : r)))} placeholder="Field, e.g. Budget" className={`${inputClass} mt-0 min-w-0`} />
                <input type="text" aria-label="Field value" value={value} onChange={(e) => setCustomRows((rows) => rows.map((r, j) => (j === i ? [r[0], e.target.value] : r)))} placeholder="Value" className={`${inputClass} mt-0 min-w-0`} />
                <button type="button" aria-label="Remove field" onClick={() => setCustomRows((rows) => rows.filter((_, j) => j !== i))} className="shrink-0 rounded-lg px-3 text-lg text-[var(--muted)] hover:bg-[var(--line)]">×</button>
              </div>
            ))}
            <button type="button" onClick={() => setCustomRows((rows) => [...rows, ['', '']])} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--line)]">+ Add a field</button>
          </div>
        </fieldset>

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
