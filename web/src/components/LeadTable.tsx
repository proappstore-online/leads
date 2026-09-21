import { SOCIALS, isProfileLink, websiteUrl } from '../lib/socials'
import type { Lead, LeadList, Sort, SortKey } from '../types'

const linkClass = 'text-[var(--sky-deep)] underline-offset-4 hover:underline'

export function LeadTable({ leads, lists, sort, onSort, onOpen }: {
  leads: Lead[]
  lists: LeadList[]
  sort: Sort
  onSort: (key: SortKey) => void
  onOpen: (lead: Lead) => void
}) {
  const listNames = new Map(lists.map((l) => [l.id, l.name]))

  const sortable = (key: SortKey, label: string, className = '') => (
    <th aria-sort={sort.key === key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} className={`px-4 py-3 font-semibold ${className}`}>
      <button type="button" aria-label={`Sort by ${label}`} onClick={() => onSort(key)} className="inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--ink)]">
        {label}
        <span aria-hidden="true" className={sort.key === key ? 'text-[var(--accent)]' : 'opacity-30'}>{sort.key === key && sort.dir === 'desc' ? '↓' : '↑'}</span>
      </button>
    </th>
  )

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)]">
      <table className="w-full select-text text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-[var(--muted)]">
          <tr className="border-b border-[var(--line)]">
            {sortable('name', 'Name')}
            {sortable('email', 'Contact')}
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Profiles</th>
            <th className="hidden px-4 py-3 font-semibold lg:table-cell">Lists</th>
            {sortable('fit', 'Fit')}
            {sortable('last_contact', 'Last contact', 'hidden sm:table-cell')}
            {sortable('last_reply', 'Last reply', 'hidden sm:table-cell')}
            {sortable('status', 'Status')}
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} onClick={() => onOpen(lead)} className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--glass-hover)]">
              <td className="px-4 py-3">
                <div className="font-semibold text-[var(--ink)]">{lead.name}</div>
                <div className="text-xs text-[var(--muted)]">{[lead.title, lead.company].filter(Boolean).join(' · ')}</div>
                {(lead.source || lead.source_url) && (
                  <div className="text-xs text-[var(--muted)]" onClick={(e) => e.stopPropagation()}>
                    Found in: {lead.source_url
                      ? <a href={lead.source_url} target="_blank" rel="noreferrer" className={linkClass}>{lead.source || 'open post'}</a>
                      : lead.source}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                {lead.email && <a href={`mailto:${lead.email}`} className={`block ${linkClass}`}>{lead.email}</a>}
                {lead.phone && <a href={`tel:${lead.phone}`} className={`block ${linkClass}`}>{lead.phone}</a>}
              </td>
              <td className="hidden px-4 py-3 text-xs md:table-cell" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {lead.website && <a href={websiteUrl(lead.website)} target="_blank" rel="noreferrer" className={linkClass}>Web</a>}
                  {SOCIALS.map(({ key, label, domains }) => {
                    const value = lead[key]
                    if (!value) return null
                    // Values saved before links were enforced (a name, a handle) are flagged, not linked.
                    return isProfileLink(domains, value)
                      ? <a key={key} href={value} target="_blank" rel="noreferrer" className={linkClass}>{label}</a>
                      : <span key={key} title={`Not a link: "${value}". Open the lead and paste the profile URL.`} className="text-[var(--warning)]">{label}: no link</span>
                  })}
                </div>
              </td>
              <td className="hidden px-4 py-3 lg:table-cell">
                <div className="flex flex-wrap gap-1">
                  {lead.list_ids?.split(',').map((id) => (
                    <span key={id} className="rounded-full bg-[var(--line)] px-2 py-0.5 text-xs text-[var(--muted)]">{listNames.get(id)}</span>
                  ))}
                </div>
              </td>
              <td className={`px-4 py-3 text-xs font-semibold capitalize ${lead.fit === 'high' ? 'text-[var(--success)]' : lead.fit === 'low' ? 'text-[var(--muted)]' : 'text-[var(--ink)]'}`}>{lead.fit ?? '—'}</td>
              <td className="hidden px-4 py-3 text-xs text-[var(--muted)] sm:table-cell">
                {lead.last_message_at ? new Date(lead.last_message_at).toLocaleDateString() : '—'}
              </td>
              <td className="hidden px-4 py-3 text-xs text-[var(--muted)] sm:table-cell">
                {lead.last_reply_at ? new Date(lead.last_reply_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-xs font-semibold capitalize text-[var(--muted)]">{lead.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
