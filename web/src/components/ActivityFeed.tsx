import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { q } from '../lib/actions'
import { summariseChanges, type HistoryNames } from '../lib/history'
import { isoTime, timeText } from '../lib/lead'
import type { Source } from '../types'
import { EmptyState, LoadingState, RetryState } from './AsyncState'

interface Activity {
  kind: 'lead_added' | 'lead_changed' | 'lead_note' | 'messages_recorded' | 'flagged' | 'source_added'
  /** When the event happened, not when its lead was last touched. */
  at: number
  /** 0 when that time was never recorded and `at` falls back to the lead's creation. */
  at_known: number
  lead_id: string | null
  lead_name: string | null
  source_name: string | null
  /** For lead_changed a JSON object of field: [old, new]; for lead_note the note. */
  detail: string | null
  /** Tie-breaker for paging events that share a timestamp. */
  k: string
}

const FEED_PAGE = 50

function describe(e: Activity, names: HistoryNames): string {
  switch (e.kind) {
    case 'lead_added': return `Added lead${e.detail ? ` — ${e.detail}` : ''}`
    case 'lead_changed': return summariseChanges(e.detail, names)
    case 'lead_note': return `Note — ${e.detail ?? ''}`
    case 'messages_recorded': return `Recorded ${e.detail?.replace(/^(\d+)/, '$1 messages')}`
    case 'flagged': return `Flagged for attention — ${e.detail ?? ''}`
    case 'source_added': return `Added source (${e.detail})`
  }
}

/**
 * Recent activity, newest first, each event at its own time (#12). Narrowed to the Stats page's
 * source filter and project, and reloaded when `version` is bumped. `aria-busy` (and the test id)
 * says when a page of events is loading, for assistive tech and for qa:activity (#72).
 */
export function ActivityFeed({ sourceId, projectId, version, people, sources, onOpenLead, onAddLead }: {
  /** A source id, 'none' for leads without one, or '' for every source. */
  sourceId: string
  projectId: string | null
  version: number
  /** Names by user id, for a change that reassigned a lead. */
  people: Map<string, string>
  sources: Source[]
  onOpenLead: (id: string) => void
  onAddLead: () => void
}) {
  const [feed, setFeed] = useState<Activity[]>([])
  const [feedMore, setFeedMore] = useState(false)
  const [feedLoading, setFeedLoading] = useState(true)
  const [feedError, setFeedError] = useState('')
  const names = useMemo<HistoryNames>(() => ({ people, sources }), [people, sources])

  const feedRequest = useRef(0)
  const loadFeed = useCallback(async (last: Activity | null) => {
    const id = ++feedRequest.current
    setFeedLoading(true)
    setFeedError('')
    try {
      const rows = await q<Activity>('recent_activity', { limit: FEED_PAGE, before: last?.at ?? null, before_k: last?.k ?? null, source_id: sourceId || null, project_id: projectId })
      if (id !== feedRequest.current) return // a newer request (other filter) superseded this one
      setFeed((prev) => (last ? [...prev, ...rows] : rows))
      setFeedMore(rows.length === FEED_PAGE)
    } catch (e) {
      if (id === feedRequest.current) setFeedError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === feedRequest.current) setFeedLoading(false)
    }
  }, [sourceId, projectId])

  useEffect(() => { loadFeed(null) }, [loadFeed, version])

  return (
    <section data-testid="activity-feed" aria-busy={feedLoading} className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
      <h2 className="text-sm font-semibold text-[var(--ink)]">Recent activity</h2>
      <p className="text-xs text-[var(--muted)]">Newest first, each at the time it happened. Changes and notes start when the lead history was added; older edits are not listed.</p>
      {feedError ? <div className="mt-3"><RetryState error={feedError} onRetry={() => loadFeed(null)} /></div> : feedLoading && feed.length === 0 ? <div className="mt-3"><LoadingState label="Loading recent activity…" /></div> : feed.length === 0 ? (
        <EmptyState action={<button type="button" onClick={onAddLead} className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--paper)]">Add lead</button>}>No activity yet. Add a lead, source, note or message to start the timeline.</EmptyState>
      ) : (
        <ol className="mt-2 divide-y divide-[var(--line)]">
          {feed.map((e) => (
            <li key={e.k + e.at} className="flex flex-col gap-0.5 py-2 text-sm sm:flex-row sm:gap-3">
              <time
                dateTime={isoTime(e.at)}
                title={e.at_known === 0 ? 'The time of this one was never recorded — shown at the lead\'s creation' : undefined}
                className="shrink-0 text-xs tabular-nums text-[var(--muted)] sm:w-28"
              >
                {timeText(e.at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {e.at_known === 0 && <span className="block not-italic opacity-80">time not recorded</span>}
              </time>
              <div className="min-w-0 select-text [overflow-wrap:anywhere]">
                {e.lead_id ? (
                  <button type="button" onClick={() => onOpenLead(e.lead_id!)} className={`text-left font-semibold hover:underline ${e.kind === 'flagged' ? 'text-[var(--warning)]' : 'text-[var(--ink)]'}`}>{e.lead_name}</button>
                ) : (
                  <span className="font-semibold text-[var(--ink)]">{e.source_name}</span>
                )}
                <span className="text-[var(--muted)]"> · {describe(e, names)}</span>
                {e.lead_id && e.source_name && <span className="block truncate text-xs text-[var(--muted)]">from {e.source_name}</span>}
              </div>
            </li>
          ))}
        </ol>
      )}
      {feedMore && (
        <button type="button" onClick={() => loadFeed(feed[feed.length - 1])} className="mt-2 w-full rounded-xl border border-[var(--line-strong)] py-2 text-sm font-semibold text-[var(--ink)]">Load older activity</button>
      )}
    </section>
  )
}
