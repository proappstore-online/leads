import { countryName } from '../lib/countries'
import { ExternalLink, linkClass } from './ExternalLink'
import { wrapAnywhere } from './styles'
import { isDue, leadTags } from '../lib/lead'
import { SOCIALS, isProfileLink, websiteUrl } from '../lib/socials'
import type { Lead, LeadList, Project, Sort, SortKey } from '../types'

const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString() : '—')

const SORTS: [SortKey, string][] = [['name', 'Name'], ['email', 'Contact'], ['fit', 'Fit'], ['next_action', 'Follow-up'], ['last_contact', 'Last contact'], ['last_reply', 'Last reply'], ['status', 'Status']]

/** Leads as a table from the sm breakpoint up, and as stacked cards on phones. */
export function LeadTable({ leads, lists, projects, people, sort, onSort, onOpen }: {
  leads: Lead[]
  lists: LeadList[]
  projects: Project[]
  /** Name to show for each user id a lead can be assigned to (you as "Me"). */
  people: Map<string, string>
  sort: Sort
  onSort: (key: SortKey) => void
  onOpen: (lead: Lead) => void
}) {
  const listNames = new Map(lists.map((l) => [l.id, l.name]))
  const projectsById = new Map(projects.map((p) => [p.id, p]))
  const sharedVia = (lead: Lead) => {
    const p = lead.project_id ? projectsById.get(lead.project_id) : undefined
    return p ? `Shared · ${p.name} · ${p.owner_name ?? 'owner'}` : 'Shared'
  }
  const assignee = (lead: Lead) => (lead.assigned_to_user_id ? people.get(lead.assigned_to_user_id) ?? 'Former member' : null)
  const fitClass = (lead: Lead) => (lead.fit === 'high' ? 'text-[var(--success)]' : lead.fit === 'low' ? 'text-[var(--muted)]' : 'text-[var(--ink)]')
  const attentionRow = 'bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] shadow-[inset_3px_0_0_var(--warning)]'
  const followUp = (lead: Lead) => lead.next_action_at && (
    <span title={lead.next_action ?? undefined} className={isDue(lead) ? 'font-semibold text-[var(--warning)]' : undefined}>
      {isDue(lead) ? 'Due ' : ''}{date(lead.next_action_at)}
    </span>
  )

  /** Name, badges, role, country and where the lead was found — the same in both layouts. */
  const summary = (lead: Lead) => (
    <>
      <div className="font-semibold text-[var(--ink)]">
        {lead.name}
        {lead.needs_attention ? <span className="ml-2 rounded-full bg-[var(--warning)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--paper)]">Needs attention</span> : null}
      </div>
      {lead.shared ? <div className="text-xs font-medium text-[var(--accent-deep)]">{sharedVia(lead)}</div> : null}
      {lead.needs_attention && lead.attention_reason ? <div className={`text-xs font-medium text-[var(--warning)] ${wrapAnywhere}`}>{lead.attention_reason}</div> : null}
      <div className="text-xs text-[var(--muted)]">
        {[lead.title, lead.company, lead.location].filter(Boolean).join(' · ')}
        {lead.country
          ? <span title={countryName(lead.country)} className="ml-1.5 rounded bg-[var(--line)] px-1 font-semibold text-[var(--ink)]">{lead.country}</span>
          : <span title="Country not confirmed" className="ml-1.5 font-semibold text-[var(--warning)]">country?</span>}
      </div>
      {(lead.source_name || lead.source || lead.source_url) && (
        <div className={`text-xs text-[var(--muted)] ${wrapAnywhere}`} onClick={(e) => e.stopPropagation()}>
          Found in:{' '}
          {lead.source_name
            ? (lead.source_link ? <ExternalLink href={lead.source_link}>{lead.source_name}</ExternalLink> : lead.source_name)
            : lead.source ?? 'unknown'}
          {lead.source_url && <> · <ExternalLink href={lead.source_url}>post</ExternalLink></>}
        </div>
      )}
      {lead.tags && (
        <div className="mt-1 flex flex-wrap gap-1">
          {leadTags(lead).map((t) => <span key={t} className="min-w-0 max-w-full truncate rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-deep)]">#{t}</span>)}
        </div>
      )}
    </>
  )

  const profiles = (lead: Lead) => (
    <>
      {lead.website && <ExternalLink href={websiteUrl(lead.website)}>Web</ExternalLink>}
      {SOCIALS.map(({ key, label, domains }) => {
        const value = lead[key]
        if (!value) return null
        // Values saved before links were enforced (a name, a handle) are flagged, not linked.
        return isProfileLink(domains, value)
          ? <ExternalLink key={key} href={value}>{label}</ExternalLink>
          : <span key={key} title={`Not a link: "${value}". Open the lead and paste the profile URL.`} className="text-[var(--warning)]">{label}: no link</span>
      })}
    </>
  )

  const sortable = (key: SortKey, label: string, className = '') => (
    <th aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`px-4 py-3 font-semibold ${className}`}>
      <button type="button" aria-label={`Sort by ${label}`} onClick={() => onSort(key)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--ink)]">
        {label}
        <span aria-hidden="true" className={sort.key === key ? 'text-[var(--accent)]' : 'opacity-30'}>{sort.key === key && sort.dir === 'desc' ? '↓' : '↑'}</span>
      </button>
    </th>
  )

  return (
    <>
      {/* Phones: one card per lead, contact details as tappable links. */}
      <div className="sm:hidden">
        <div className="mb-2 flex items-center justify-end gap-2 text-sm">
          <select aria-label="Sort leads" value={sort.key} onChange={(e) => onSort(e.target.value as SortKey)} className="rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2 text-[var(--ink)] outline-none">
            {SORTS.map(([key, label]) => <option key={key} value={key}>Sort: {label}</option>)}
          </select>
          <button type="button" onClick={() => onSort(sort.key)} aria-label={sort.dir === 'asc' ? 'Ascending - switch to descending' : 'Descending - switch to ascending'} className="rounded-xl border border-[var(--line)] px-3 py-2 font-semibold text-[var(--ink)]">
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
        <ul className="space-y-2">
          {leads.map((lead) => (
            <li key={lead.id} onClick={() => onOpen(lead)} className={`cursor-pointer rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm ${lead.needs_attention ? attentionRow : ''}`}>
              {summary(lead)}
              {(lead.email || lead.phone) && (
                <div className="mt-2 flex flex-col gap-1 text-sm" onClick={(e) => e.stopPropagation()}>
                  {lead.email && <a href={`mailto:${lead.email}`} className={`break-all py-0.5 ${linkClass}`}>{lead.email}</a>}
                  {lead.phone && <a href={`tel:${lead.phone}`} className={`py-0.5 ${linkClass}`}>{lead.phone}</a>}
                </div>
              )}
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs" onClick={(e) => e.stopPropagation()}>{profiles(lead)}</div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                <span className="rounded-full bg-[var(--line)] px-2 py-0.5 font-semibold capitalize text-[var(--ink)]">{lead.status}</span>
                {lead.fit && <span className={`font-semibold capitalize ${fitClass(lead)}`}>{lead.fit} fit</span>}
                {lead.next_action_at && <span className={wrapAnywhere}>follow up {followUp(lead)}{lead.next_action ? ` · ${lead.next_action}` : ''}</span>}
                <span>last contact {date(lead.last_message_at)}</span>
                {lead.last_reply_at && <span>reply {date(lead.last_reply_at)}</span>}
                {assignee(lead) && <span>→ {assignee(lead)}</span>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr className="border-b border-[var(--line)]">
              {sortable('name', 'Name')}
              {sortable('email', 'Contact')}
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Profiles</th>
              <th className="hidden px-4 py-3 font-semibold lg:table-cell">Lists</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Assigned</th>
              {sortable('fit', 'Fit')}
              {sortable('next_action', 'Follow-up')}
              {sortable('last_contact', 'Last contact', 'hidden md:table-cell')}
              {sortable('last_reply', 'Last reply', 'hidden lg:table-cell')}
              {sortable('status', 'Status')}
            </tr>
          </thead>
          <tbody>
            {leads.map((lead) => (
              <tr key={lead.id} onClick={() => onOpen(lead)} className={`cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--glass-hover)] ${lead.needs_attention ? attentionRow : ''}`}>
                <td className="px-4 py-3">{summary(lead)}</td>
                <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                  {lead.email && <a href={`mailto:${lead.email}`} className={`block ${linkClass}`}>{lead.email}</a>}
                  {lead.phone && <a href={`tel:${lead.phone}`} className={`block ${linkClass}`}>{lead.phone}</a>}
                </td>
                <td className="hidden px-4 py-3 text-xs md:table-cell" onClick={(e) => e.stopPropagation()}>
                  <div className="flex flex-wrap gap-x-3 gap-y-1">{profiles(lead)}</div>
                </td>
                <td className="hidden px-4 py-3 lg:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {lead.list_ids?.split(',').map((id) => (
                      <span key={id} className="rounded-full bg-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">{listNames.get(id)}</span>
                    ))}
                  </div>
                </td>
                <td className="hidden px-4 py-3 text-xs text-[var(--ink)] md:table-cell">
                  {assignee(lead) ?? <span className="text-[var(--muted)]">—</span>}
                </td>
                <td className={`px-4 py-3 text-xs font-semibold capitalize ${fitClass(lead)}`}>{lead.fit ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-[var(--muted)]">{followUp(lead) || '—'}</td>
                <td className="hidden px-4 py-3 text-xs text-[var(--muted)] md:table-cell">{date(lead.last_message_at)}</td>
                <td className="hidden px-4 py-3 text-xs text-[var(--muted)] lg:table-cell">{date(lead.last_reply_at)}</td>
                <td className="px-4 py-3 text-xs font-semibold capitalize text-[var(--muted)]">{lead.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
