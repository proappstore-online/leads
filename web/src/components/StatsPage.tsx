import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { q } from '../lib/actions'
import { summariseChanges, type HistoryNames } from '../lib/history'
import { projectOf } from '../lib/lead'
import { FITS, STATUSES, type LeadList, type Source } from '../types'
import { BarChart } from './BarChart'
import { EmptyState, LoadingState, RetryState } from './AsyncState'

interface Bucket {
  leads_added: number
  messages_sent: number
  messages_received: number
  leads_replied: number
  sources_added: number
  flagged: number
}

type Pipeline = Record<string, number>

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

const RANGES = {
  '7d': { label: 'Last 7 days', unit: 'day', count: 7 },
  '30d': { label: 'Last 30 days', unit: 'day', count: 30 },
  '90d': { label: 'Last 13 weeks', unit: 'week', count: 13 },
  '12m': { label: 'Last 12 months', unit: 'month', count: 12 },
} as const
type RangeKey = keyof typeof RANGES

/** [start, end) pairs in local time, oldest first, ending with the current day / week / month. */
function buckets(range: RangeKey): { pairs: [number, number][]; labels: string[] } {
  const { unit, count } = RANGES[range]
  const now = new Date()
  const pairs: [number, number][] = []
  const labels: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    let start: Date
    let end: Date
    if (unit === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      labels.push(start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
    } else if (unit === 'week') {
      const monday = now.getDate() - ((now.getDay() + 6) % 7)
      start = new Date(now.getFullYear(), now.getMonth(), monday - i * 7)
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
      labels.push(start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      labels.push(start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }))
    }
    pairs.push([start.getTime(), end.getTime()])
  }
  // The last bucket is always the current one.
  labels[labels.length - 1] = unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month'
  return { pairs, labels }
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

/** Charts and activity: what came in, what agents did, and where the pipeline stands. */
export function StatsPage({ lists, sources, people, projectId, version, onOpenLead, onAddLead }: {
  lists: LeadList[]
  sources: Source[]
  /** Names by user id, for a change that reassigned a lead. */
  people: Map<string, string>
  /** The current project, or null for every project — everything here is scoped to it. */
  projectId: string | null
  /** Bumped by the parent after any save, so the page reloads. */
  version: number
  onOpenLead: (id: string) => void
  onAddLead: () => void
}) {
  const [range, setRange] = useState<RangeKey>('30d')
  const [sourceId, setSourceId] = useState('')
  const [listId, setListId] = useState('')
  // Rows are kept with the buckets they were fetched for, so a new range never shows old numbers under new labels.
  const [data, setData] = useState<{ pairs: [number, number][]; series: Bucket[]; totals: Bucket | null } | null>(null)
  const [pipeline, setPipeline] = useState<Pipeline | null>(null)
  const [feed, setFeed] = useState<Activity[]>([])
  const [feedMore, setFeedMore] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [feedLoading, setFeedLoading] = useState(true)
  const [dataError, setDataError] = useState('')
  const [feedError, setFeedError] = useState('')

  const { pairs, labels } = useMemo(() => buckets(range), [range])
  const names = useMemo<HistoryNames>(() => ({ people, sources }), [people, sources])
  // A list is addressed by its project (#4).
  const filters = useMemo(() => {
    const list = lists.find((l) => l.id === listId)
    return { source_id: sourceId || null, list_id: list ? list.id : null, project_id: list ? projectOf(list) : projectId }
  }, [sourceId, listId, lists, projectId])

  const loadStats = useCallback(async () => {
    setDataLoading(true)
    setDataError('')
    const whole: [number, number][] = [[pairs[0][0], pairs[pairs.length - 1][1]]]
    try {
      const [rows, total, pipe] = await Promise.all([
        q<Bucket>('stats_timeline', { buckets: JSON.stringify(pairs), ...filters }),
        // One bucket over the whole range, so "leads who replied" counts each lead once.
        q<Bucket>('stats_timeline', { buckets: JSON.stringify(whole), ...filters }),
        q<Pipeline>('stats_pipeline', filters),
      ])
      setData({ pairs, series: rows, totals: total[0] ?? null })
      setPipeline(pipe[0] ?? null)
    } catch (e) {
      setDataError(e instanceof Error ? e.message : String(e))
    } finally {
      setDataLoading(false)
    }
  }, [pairs, filters])

  useEffect(() => { loadStats() }, [loadStats, version])

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

  const current = data?.pairs === pairs ? data : null
  const totals = current?.totals ?? null
  const col = (key: keyof Bucket) => current?.series.map((b) => b[key]) ?? []
  const selectClass = 'rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none'
  const tiles: [string, number | undefined][] = [
    ['Leads added', totals?.leads_added],
    ['Messages sent', totals?.messages_sent],
    ['Messages received', totals?.messages_received],
    ['Leads who replied', totals?.leads_replied],
    ['Flags raised', totals?.flagged],
    ['Sources added', totals?.sources_added],
  ]

  return (
    <main className="min-w-0 flex-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Stats</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">What came in, what your agents did, and where the pipeline stands.</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className={selectClass}>
          {Object.entries(RANGES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </select>
        <select aria-label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${selectClass} max-w-56`}>
          <option value="">All sources</option>
          <option value="none">No source</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="List" value={listId} onChange={(e) => setListId(e.target.value)} className={`${selectClass} max-w-56`}>
          <option value="">All lists</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {dataError ? <div className="mt-4"><RetryState error={dataError} onRetry={loadStats} /></div> : dataLoading && !current ? <div className="mt-4"><LoadingState label="Loading statistics…" /></div> : <>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2">
            <dt className="text-xs text-[var(--muted)]">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums text-[var(--ink)]">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {RANGES[range].label}. Leads count when they were saved, messages when they were sent.
        {sourceId || listId ? ' Sources added is not narrowed by the source or list filter.' : ''}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <BarChart title="Leads added" labels={labels} current={labels.length - 1} series={[{ name: 'Leads added', color: 'var(--series-1)', values: col('leads_added') }]} />
        <BarChart
          title="Messages"
          labels={labels}
          current={labels.length - 1}
          series={[
            { name: 'Sent', color: 'var(--series-1)', values: col('messages_sent') },
            { name: 'Received', color: 'var(--series-2)', values: col('messages_received') },
          ]}
        />
        <BarChart title="Leads who replied" labels={labels} current={labels.length - 1} series={[{ name: 'Leads who replied', color: 'var(--series-1)', values: col('leads_replied') }]} />
        <BarChart title="Sources added" labels={labels} current={labels.length - 1} series={[{ name: 'Sources added', color: 'var(--series-1)', values: col('sources_added') }]} />
      </div>

      {pipeline && (
        <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Pipeline now <span className="font-normal text-[var(--muted)]">— {pipeline.total} leads</span></h2>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {STATUSES.map((s) => (
              <div key={s} className="flex gap-1"><dt className="capitalize text-[var(--muted)]">{s}</dt><dd className="font-semibold tabular-nums text-[var(--ink)]">{pipeline[`status_${s}`]}</dd></div>
            ))}
          </dl>
          <dl className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {FITS.map((f) => (
              <div key={f} className="flex gap-1"><dt className="capitalize text-[var(--muted)]">{f} fit</dt><dd className="font-semibold tabular-nums text-[var(--ink)]">{pipeline[`fit_${f}`]}</dd></div>
            ))}
            <div className="flex gap-1"><dt className="text-[var(--muted)]">not rated</dt><dd className="font-semibold tabular-nums text-[var(--ink)]">{pipeline.fit_none}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {pipeline.with_conversation} have a recorded conversation · {pipeline.replied} have replied · {pipeline.needs_attention} need attention
          </p>
        </section>
      )}
      </>}

      <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
        <h2 className="text-sm font-semibold text-[var(--ink)]">Recent activity</h2>
        <p className="text-xs text-[var(--muted)]">Newest first, each at the time it happened. Changes and notes start when the lead history was added; older edits are not listed.</p>
        {feedError ? <div className="mt-3"><RetryState error={feedError} onRetry={() => loadFeed(null)} /></div> : feedLoading && feed.length === 0 ? <div className="mt-3"><LoadingState label="Loading recent activity…" /></div> : feed.length === 0 ? (
          <EmptyState action={<button type="button" onClick={onAddLead} className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--paper)]">Add lead</button>}>No activity yet. Add a lead, source, note or message to start the timeline.</EmptyState>
        ) : (
          <ol className="mt-2 divide-y divide-[var(--line)]">
            {feed.map((e) => (
              <li key={e.k + e.at} className="flex gap-3 py-2 text-sm">
                <time
                  dateTime={new Date(e.at).toISOString()}
                  title={e.at_known === 0 ? 'The time of this one was never recorded — shown at the lead\'s creation' : undefined}
                  className="w-28 shrink-0 text-xs tabular-nums text-[var(--muted)]"
                >
                  {new Date(e.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {e.at_known === 0 && <span className="block not-italic opacity-80">time not recorded</span>}
                </time>
                <div className="min-w-0 select-text [overflow-wrap:anywhere]">
                  {e.lead_id ? (
                    <button type="button" onClick={() => onOpenLead(e.lead_id!)} className={`font-semibold hover:underline ${e.kind === 'flagged' ? 'text-[var(--warning)]' : 'text-[var(--ink)]'}`}>{e.lead_name}</button>
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
    </main>
  )
}
