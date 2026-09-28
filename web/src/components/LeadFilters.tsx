import { useId, useState } from 'react'
import { COUNTRY_OPTIONS, countryName } from '../lib/countries'
import { activeFilterCount, type LeadFilter } from '../lib/lead'
import { FITS, STATUSES, type ProjectMember, type Source } from '../types'

const select = 'min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none'

/**
 * The search box and filter dropdowns over a list of leads - the leads page and the stats popup (#37)
 * both use this one, so a filter looks and behaves the same everywhere. On phones the dropdowns sit
 * behind a Filters toggle.
 */
export function LeadFilters({ value, onChange, sources, assignees, tags, statusOnly = false, hideFollowUp = false }: {
  value: LeadFilter
  onChange: (next: LeadFilter) => void
  sources: Source[]
  /** Members of your projects, for the assignee dropdown. */
  assignees: ProjectMember[]
  tags: { tag: string; leads: number }[]
  /** Only the search and status (the Assigned to me view). */
  statusOnly?: boolean
  /** The view already fixes the follow-up (Follow-ups due). */
  hideFollowUp?: boolean
}) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const set = (patch: Partial<LeadFilter>) => onChange({ ...value, ...patch })
  const active = activeFilterCount(value)

  return (
    <div className="flex flex-wrap gap-2">
      <input
        type="search"
        aria-label="Search leads"
        value={value.search}
        onChange={(e) => set({ search: e.target.value })}
        placeholder="Search name, company, title, email, phone, source"
        className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
      />
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={`shrink-0 rounded-xl border px-3 py-2 text-sm font-semibold sm:hidden ${active ? 'border-[var(--accent)] text-[var(--accent-deep)]' : 'border-[var(--line)] text-[var(--ink)]'}`}
      >
        Filters{active ? ` (${active})` : ''}
      </button>
      {/* Phones: behind the Filters toggle. Wider screens: always shown, inline with the search. */}
      <div id={id} className={`${open ? 'flex' : 'hidden'} w-full flex-wrap gap-2 sm:contents`}>
        <select aria-label="Filter by status" value={value.status} onChange={(e) => set({ status: e.target.value })} className={`${select} capitalize`}>
          <option value="">Any status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {!statusOnly && <>
          <select aria-label="Filter by assignee" value={value.assignedTo} onChange={(e) => set({ assignedTo: e.target.value })} className={`${select} sm:max-w-44`}>
            <option value="">Anyone</option>
            <option value="none">Not assigned</option>
            <option value="me">Assigned to me</option>
            {assignees.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name ?? 'Unnamed member'}</option>)}
          </select>
          <select aria-label="Filter by fit" value={value.fit} onChange={(e) => set({ fit: e.target.value })} className={`${select} capitalize`}>
            <option value="">Any fit</option>
            {FITS.map((f) => <option key={f} value={f}>{f}</option>)}
            <option value="none">Not rated</option>
          </select>
          <select aria-label="Filter by country" value={value.country} onChange={(e) => set({ country: e.target.value })} className={`${select} sm:max-w-44`}>
            <option value="">Any country</option>
            <option value="none">Country not confirmed</option>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
          <select aria-label="Filter by source" value={value.sourceId} onChange={(e) => set({ sourceId: e.target.value })} className={`${select} sm:max-w-48`}>
            <option value="">Any source</option>
            <option value="none">No source</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!hideFollowUp && (
            <select aria-label="Filter by follow-up" value={value.followUp} onChange={(e) => set({ followUp: e.target.value })} className={`${select} sm:max-w-44`}>
              <option value="">Any follow-up</option>
              <option value="due">Follow-up due</option>
              <option value="scheduled">Follow-up scheduled</option>
              <option value="none">No follow-up set</option>
            </select>
          )}
          {tags.length > 0 && (
            <select aria-label="Filter by tag" value={value.tag} onChange={(e) => set({ tag: e.target.value })} className={`${select} sm:max-w-44`}>
              <option value="">Any tag</option>
              {tags.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.leads})</option>)}
            </select>
          )}
        </>}
      </div>
    </div>
  )
}
