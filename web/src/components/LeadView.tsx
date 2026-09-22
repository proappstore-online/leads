import type { ReactNode } from 'react'
import { countryName } from '../lib/countries'
import { SOCIALS, isProfileLink, websiteUrl } from '../lib/socials'
import type { Lead, LeadList } from '../types'

const linkClass = 'break-all text-[var(--sky-deep)] underline-offset-4 hover:underline'
const date = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className="min-w-0 text-[var(--ink)]">{children}</dd>
    </div>
  )
}

function External({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className={linkClass}>{children}</a>
}

/** Read-only lead: every filled field, with contact details and links clickable. Empty fields are left out. */
export function LeadView({ lead, lists, onEdit }: { lead: Lead; lists: LeadList[]; onEdit: () => void }) {
  const listNames = (lead.list_ids?.split(',') ?? []).map((id) => lists.find((l) => l.id === id)?.name).filter(Boolean)
  const profiles = SOCIALS.filter(({ key }) => lead[key])

  return (
    <div className="mt-4 select-text">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {(lead.title || lead.company) && <p className="text-sm font-semibold text-[var(--ink)]">{[lead.title, lead.company].filter(Boolean).join(' · ')}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-full bg-[var(--line)] px-2 py-0.5 font-semibold capitalize text-[var(--ink)]">{lead.status}</span>
            {lead.fit && <span className="rounded-full bg-[var(--line)] px-2 py-0.5 font-semibold capitalize text-[var(--ink)]">{lead.fit} fit</span>}
            {listNames.map((n) => <span key={n} className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[var(--muted)]">{n}</span>)}
          </p>
        </div>
        <button type="button" onClick={onEdit} className="shrink-0 rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--line)]">Edit</button>
      </div>

      <dl className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        <Row label="Where">
          {[lead.location, lead.country ? countryName(lead.country) : null].filter(Boolean).join(', ') || '—'}
          {!lead.country && <span className="ml-2 text-xs font-semibold text-[var(--warning)]">country not confirmed</span>}
        </Row>
        {lead.email && <Row label="Email"><a href={`mailto:${lead.email}`} className={linkClass}>{lead.email}</a></Row>}
        {lead.phone && <Row label="Phone"><a href={`tel:${lead.phone}`} className={linkClass}>{lead.phone}</a></Row>}
        {lead.website && <Row label="Website"><External href={websiteUrl(lead.website)}>{lead.website}</External></Row>}
        {profiles.map(({ key, label, domains }) => {
          const value = lead[key]!
          return (
            <Row key={key} label={label}>
              {isProfileLink(domains, value) ? <External href={value}>{value.replace(/^https:\/\/(www\.)?/, '')}</External> : <span className="text-[var(--warning)]">{value} (not a link)</span>}
            </Row>
          )
        })}
        {(lead.source_name || lead.source || lead.source_url) && (
          <Row label="Found in">
            {lead.source_name
              ? (lead.source_link ? <External href={lead.source_link}>{lead.source_name}</External> : lead.source_name)
              : lead.source}
            {lead.source_kind && <span className="text-[var(--muted)]"> ({lead.source_kind})</span>}
            {lead.source_url && <> · <External href={lead.source_url}>the post</External></>}
          </Row>
        )}
        {lead.found_at && <Row label="Found">{date(lead.found_at)}</Row>}
        {lead.last_message_at && <Row label="Last contact">{date(lead.last_message_at)}{lead.last_reply_at ? ` · last reply ${date(lead.last_reply_at)}` : ' · no reply yet'}</Row>}
        <Row label="Added">{date(lead.created_at)}{lead.updated_at > lead.created_at + 5000 ? ` · changed ${date(lead.updated_at)}` : ''}</Row>
      </dl>

      {lead.notes && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Notes</h3>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--ink)]">{lead.notes}</p>
        </div>
      )}
    </div>
  )
}
