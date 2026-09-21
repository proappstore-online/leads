import { SOCIALS, profileUrl } from '../lib/socials'
import type { Lead, LeadList } from '../types'

const linkClass = 'text-[var(--sky-deep)] underline-offset-4 hover:underline'

export function LeadTable({ leads, lists, onOpen }: { leads: Lead[]; lists: LeadList[]; onOpen: (lead: Lead) => void }) {
  const listNames = new Map(lists.map((l) => [l.id, l.name]))

  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)]">
      <table className="w-full select-text text-left text-sm">
        <thead className="text-xs uppercase tracking-wider text-[var(--muted)]">
          <tr className="border-b border-[var(--line)]">
            <th className="px-4 py-3 font-semibold">Name</th>
            <th className="px-4 py-3 font-semibold">Contact</th>
            <th className="hidden px-4 py-3 font-semibold md:table-cell">Profiles</th>
            <th className="hidden px-4 py-3 font-semibold lg:table-cell">Lists</th>
            <th className="hidden px-4 py-3 font-semibold sm:table-cell">Last contact</th>
            <th className="px-4 py-3 font-semibold">Status</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((lead) => (
            <tr key={lead.id} onClick={() => onOpen(lead)} className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--glass-hover)]">
              <td className="px-4 py-3">
                <div className="font-semibold text-[var(--ink)]">{lead.name}</div>
                <div className="text-xs text-[var(--muted)]">{[lead.title, lead.company].filter(Boolean).join(' · ')}</div>
                {lead.source && <div className="text-xs text-[var(--muted)]">Found in: {lead.source}</div>}
              </td>
              <td className="px-4 py-3 text-xs" onClick={(e) => e.stopPropagation()}>
                {lead.email && <a href={`mailto:${lead.email}`} className={`block ${linkClass}`}>{lead.email}</a>}
                {lead.phone && <a href={`tel:${lead.phone}`} className={`block ${linkClass}`}>{lead.phone}</a>}
              </td>
              <td className="hidden px-4 py-3 text-xs md:table-cell" onClick={(e) => e.stopPropagation()}>
                <div className="flex flex-wrap gap-x-3 gap-y-1">
                  {lead.website && <a href={profileUrl('https://', lead.website)} target="_blank" rel="noreferrer" className={linkClass}>Web</a>}
                  {SOCIALS.map(({ key, label, base }) => {
                    const value = lead[key]
                    return value && <a key={key} href={profileUrl(base, value)} target="_blank" rel="noreferrer" className={linkClass}>{label}</a>
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
              <td className="hidden px-4 py-3 text-xs text-[var(--muted)] sm:table-cell">
                {lead.last_message_at ? new Date(lead.last_message_at).toLocaleDateString() : '—'}
              </td>
              <td className="px-4 py-3 text-xs font-semibold capitalize text-[var(--muted)]">{lead.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
