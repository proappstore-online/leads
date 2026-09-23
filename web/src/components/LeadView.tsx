import type { ReactNode } from 'react'
import { countryName } from '../lib/countries'
import { ExternalLink, linkClass } from './ExternalLink'
import { wrapAnywhere } from './styles'
import { isDue, leadCustomFields, leadTags } from '../lib/lead'
import { SOCIALS, isProfileLink, websiteUrl } from '../lib/socials'
import type { Lead, LeadList } from '../types'

const date = (ms: number | null) => (ms ? new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null)

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[7.5rem_1fr] gap-3 py-1.5 text-sm">
      <dt className="text-[var(--muted)]">{label}</dt>
      <dd className={`text-[var(--ink)] ${wrapAnywhere}`}>{children}</dd>
    </div>
  )
}

/** Read-only lead: every filled field, with contact details and links clickable. Empty fields are left out. */
export function LeadView({ lead, lists, onEdit }: { lead: Lead; lists: LeadList[]; onEdit?: () => void }) {
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
            {listNames.map((n) => <span key={n} className="min-w-0 max-w-full truncate rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[var(--muted)]">{n}</span>)}
            {leadTags(lead).map((t) => <span key={t} className="min-w-0 max-w-full truncate rounded-full bg-[var(--accent-soft)] px-2 py-0.5 font-medium text-[var(--accent-deep)]">#{t}</span>)}
          </p>
        </div>
        {onEdit && <button type="button" onClick={onEdit} className="shrink-0 rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--line)]">Edit</button>}
      </div>

      <dl className="mt-4 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {lead.next_action_at && (
          <Row label="Follow up">
            <span className={isDue(lead) ? 'font-semibold text-[var(--warning)]' : undefined}>{date(lead.next_action_at)}{isDue(lead) ? ' (due)' : ''}</span>
            {lead.next_action && <> · {lead.next_action}</>}
          </Row>
        )}
        <Row label="Where">
          {[lead.location, lead.country ? countryName(lead.country) : null].filter(Boolean).join(', ') || '—'}
          {!lead.country && <span className="ml-2 text-xs font-semibold text-[var(--warning)]">country not confirmed</span>}
        </Row>
        {lead.email && <Row label="Email"><a href={`mailto:${lead.email}`} className={linkClass}>{lead.email}</a></Row>}
        {lead.phone && <Row label="Phone"><a href={`tel:${lead.phone}`} className={linkClass}>{lead.phone}</a></Row>}
        {lead.website && <Row label="Website"><ExternalLink href={websiteUrl(lead.website)}>{lead.website}</ExternalLink></Row>}
        {profiles.map(({ key, label, domains }) => {
          const value = lead[key]!
          return (
            <Row key={key} label={label}>
              {isProfileLink(domains, value) ? <ExternalLink href={value}>{value.replace(/^https:\/\/(www\.)?/, '')}</ExternalLink> : <span className="text-[var(--warning)]">{value} (not a link)</span>}
            </Row>
          )
        })}
        {(lead.source_name || lead.source || lead.source_url) && (
          <Row label="Found in">
            {lead.source_name
              ? (lead.source_link ? <ExternalLink href={lead.source_link}>{lead.source_name}</ExternalLink> : lead.source_name)
              : lead.source}
            {lead.source_kind && <span className="text-[var(--muted)]"> ({lead.source_kind})</span>}
            {lead.source_url && <> · <ExternalLink href={lead.source_url}>the post</ExternalLink></>}
          </Row>
        )}
        {lead.found_at && <Row label="Found">{date(lead.found_at)}</Row>}
        {lead.last_message_at && <Row label="Last contact">{date(lead.last_message_at)}{lead.last_reply_at ? ` · last reply ${date(lead.last_reply_at)}` : ' · no reply yet'}</Row>}
        {leadCustomFields(lead).map(([k, v]) => <Row key={`custom-${k}`} label={k}>{v}</Row>)}
        <Row label="Added">{date(lead.created_at)}{lead.updated_at > lead.created_at + 5000 ? ` · changed ${date(lead.updated_at)}` : ''}</Row>
      </dl>

      {lead.notes && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Notes</h3>
          <p className={`mt-1 whitespace-pre-wrap text-sm text-[var(--ink)] ${wrapAnywhere}`}>{lead.notes}</p>
        </div>
      )}
    </div>
  )
}
