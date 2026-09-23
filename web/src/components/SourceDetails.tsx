import { useEffect, useState } from 'react'
import { q } from '../lib/actions'
import { STATUSES, type Lead, type SourceDetail } from '../types'
import { Modal } from './Modal'

const date = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString() : '—')

/** Everything about one source: its details, performance, pipeline and leads. */
export function SourceDetails({ sourceId, projectId, version, onClose, onEdit, onOpenLead, onShowLeads }: {
  sourceId: string
  /** The current project, or null for every project — the stats and leads here follow it. */
  projectId: string | null
  /** Bumped by the parent after any save, so the panel reloads. */
  version: number
  onClose: () => void
  onEdit: (source: SourceDetail) => void
  onOpenLead: (lead: Lead) => void
  onShowLeads: () => void
}) {
  const [source, setSource] = useState<SourceDetail | null>(null)
  const [leads, setLeads] = useState<Lead[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    let live = true
    Promise.all([
      q<SourceDetail>('get_source', { id: sourceId, project_id: projectId }),
      q<Lead>('list_leads', { source_id: sourceId, project_id: projectId, sort: 'last_contact', dir: 'desc', limit: 500 }),
    ]).then(([rows, leadRows]) => {
      if (!live) return
      setSource(rows[0] ?? null)
      setLeads(leadRows)
      if (!rows[0]) setError('This source no longer exists.')
    }).catch((e) => live && setError(e instanceof Error ? e.message : String(e)))
    return () => { live = false }
  }, [sourceId, projectId, version])

  const tiles: [string, string | number][] = source ? [
    ['Leads', source.leads],
    ['Contacted', source.contacted],
    ['Replied', source.replied],
    ['Reply rate', source.reply_rate_pct == null ? '—' : `${source.reply_rate_pct}%`],
    ['Qualified', source.qualified],
    ['Won', source.won],
    ['High fit', source.high_fit],
    ['Need attention', source.needs_attention],
  ] : []

  return (
    <Modal title={source?.name ?? 'Source'} onClose={onClose}>
      {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
      {!source && !error && <p className="mt-4 text-sm text-[var(--muted)]">Loading…</p>}
      {source && (
        <div className="mt-2 space-y-5 select-text">
          <div className="text-sm text-[var(--muted)]">
            {source.kind}
            {source.url && <> · <a href={source.url} target="_blank" rel="noreferrer" className="break-all text-[var(--sky-deep)] underline-offset-4 hover:underline">{source.url}</a></>}
            <> · added {date(source.created_at)}</>
          </div>
          {source.notes && <p className="whitespace-pre-wrap rounded-xl border border-[var(--line)] bg-[var(--glass)] px-4 py-3 text-sm text-[var(--ink)]">{source.notes}</p>}

          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {tiles.map(([label, value]) => (
              <div key={label} className="rounded-xl border border-[var(--line)] px-3 py-2">
                <dt className="text-xs text-[var(--muted)]">{label}</dt>
                <dd className="text-xl font-bold tabular-nums text-[var(--ink)]">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Pipeline</h3>
            <dl className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {STATUSES.map((s) => (
                <div key={s} className="flex gap-1">
                  <dt className="capitalize text-[var(--muted)]">{s}</dt>
                  <dd className="font-semibold tabular-nums text-[var(--ink)]">{source[`status_${s}`]}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-2 text-xs text-[var(--muted)]">
              First found {date(source.first_found_at)} · last found {date(source.last_found_at)} · last contact {date(source.last_contact_at)}
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Leads from here ({leads.length})</h3>
            {leads.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">No leads linked to this source yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
                {leads.map((l) => (
                  <li key={l.id}>
                    <button type="button" onClick={() => onOpenLead(l)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[var(--glass-hover)]">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-[var(--ink)]">
                          {l.name}
                          {l.needs_attention ? <span className="ml-2 text-xs font-bold text-[var(--warning)]">Needs attention</span> : null}
                        </span>
                        <span className="block truncate text-xs text-[var(--muted)]">{l.title}</span>
                      </span>
                      <span className="shrink-0 text-right text-xs text-[var(--muted)]">
                        <span className="block font-semibold capitalize text-[var(--ink)]">{l.status}{l.fit ? ` · ${l.fit} fit` : ''}</span>
                        {l.last_message_at ? `last contact ${date(l.last_message_at)}` : 'not contacted'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-wrap justify-end gap-2 border-t border-[var(--line)] pt-4">
            <button type="button" onClick={onShowLeads} className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Show in leads table</button>
            <button type="button" onClick={() => onEdit(source)} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)]">Edit source</button>
          </div>
        </div>
      )}
    </Modal>
  )
}
