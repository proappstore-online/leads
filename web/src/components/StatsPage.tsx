import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { q } from '../lib/actions'
import { projectOf } from '../lib/lead'
import { buckets, RANGES, type Bucket, type Pipeline, type RangeKey } from '../lib/stats'
import { FITS, STATUSES, type LeadList, type Project, type ProjectMember, type Source } from '../types'
import { ActivityFeed } from './ActivityFeed'
import { BarChart } from './BarChart'
import { LoadingState, RetryState } from './AsyncState'
import { StatsLeads, type Drill } from './StatsLeads'

/**
 * Charts and activity: what came in, what agents did, and where the pipeline stands. Every value that
 * counts leads is a button that opens those leads (#37); message and source counts are not leads.
 */
export function StatsPage({ lists, projects, sources, assignees, tags, people, projectId, version, onOpenLead, onAddLead }: {
  lists: LeadList[]
  projects: Project[]
  sources: Source[]
  /** For the popup's filter bar, as on the leads page. */
  assignees: ProjectMember[]
  tags: { tag: string; leads: number }[]
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
  // Timeline and pipeline share the complete request snapshot, including refreshes.
  const [data, setData] = useState<{ snapshot: object; pairs: [number, number][]; series: Bucket[]; totals: Bucket | null; pipeline: Pipeline | null } | null>(null)
  const [dataLoading, setDataLoading] = useState(true)
  const [dataError, setDataError] = useState<{ snapshot: object; message: string } | null>(null)
  /** The value whose leads are open in the popup. */
  const [drill, setDrill] = useState<{ value: Drill; sourceId: string; listId: string; projectId: string | null } | null>(null)

  const { pairs, labels } = useMemo(() => buckets(range), [range])
  // A list is addressed by its project (#4).
  const filters = useMemo(() => {
    const list = lists.find((l) => l.id === listId)
    return { source_id: sourceId || null, list_id: list ? list.id : null, project_id: list ? projectOf(list) : projectId }
  }, [sourceId, listId, lists, projectId])

  const snapshot = useMemo(() => ({ pairs, filters, version }), [pairs, filters, version])
  const statsRequest = useRef(0)
  const loadStats = useCallback(async () => {
    const id = ++statsRequest.current
    setDataLoading(true)
    setDataError(null)
    const whole: [number, number][] = [[pairs[0][0], pairs[pairs.length - 1][1]]]
    try {
      const [rows, total, pipe] = await Promise.all([
        q<Bucket>('stats_timeline', { buckets: JSON.stringify(pairs), ...filters }),
        // One bucket over the whole range, so "leads who replied" counts each lead once.
        q<Bucket>('stats_timeline', { buckets: JSON.stringify(whole), ...filters }),
        q<Pipeline>('stats_pipeline', filters),
      ])
      if (id !== statsRequest.current) return
      setData({ snapshot, pairs, series: rows, totals: total[0] ?? null, pipeline: pipe[0] ?? null })
    } catch (e) {
      if (id === statsRequest.current) setDataError({ snapshot, message: e instanceof Error ? e.message : String(e) })
    } finally {
      if (id === statsRequest.current) setDataLoading(false)
    }
  }, [pairs, filters, snapshot])

  useEffect(() => {
    loadStats()
    return () => { ++statsRequest.current }
  }, [loadStats])

  const current = data?.snapshot === snapshot ? data : null
  const pipeline = current?.pipeline ?? null
  const currentError = dataError?.snapshot === snapshot ? dataError.message : ''
  const totals = current?.totals ?? null
  const col = (key: keyof Bucket) => current?.series.map((b) => b[key]) ?? []
  const selectClass = 'rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none'

  function open(next: Drill, opener: HTMLElement) {
    opener.focus() // Safari does not focus a clicked button; the popup hands focus back to whatever had it
    setDrill({ value: next, sourceId, listId, projectId })
  }
  // The leads behind a count over [from, before): leads saved, replying or flagged in it.
  const period = (title: string, what: string, count: number, key: 'created' | 'replied' | 'flagged', [from, before]: [number, number], when: string): Drill => ({
    title: `${title} · ${when}`,
    count,
    constraint: { label: `${what} ${when.toLowerCase() === 'today' ? 'today' : `in ${when}`}`, params: { [`${key}_from`]: from, [`${key}_before`]: before } },
  })
  const shownPairs = current?.pairs ?? pairs
  const whole: [number, number] = [shownPairs[0][0], shownPairs[shownPairs.length - 1][1]]
  const rangeLabel = RANGES[range].label
  const tiles: [string, number | undefined, Drill?][] = [
    ['Leads added', totals?.leads_added, totals ? period('Leads added', 'Added', totals.leads_added, 'created', whole, rangeLabel) : undefined],
    ['Messages sent', totals?.messages_sent],
    ['Messages received', totals?.messages_received],
    ['Leads who replied', totals?.leads_replied, totals ? period('Leads who replied', 'Replied', totals.leads_replied, 'replied', whole, rangeLabel) : undefined],
    ['Flags raised', totals?.flagged, totals ? period('Flags raised', 'Flagged', totals.flagged, 'flagged', whole, rangeLabel) : undefined],
    ['Sources added', totals?.sources_added],
  ]
  const valueButton = (count: number, name: string, d: Omit<Drill, 'count'>) => (
    <button type="button" aria-label={`${name}: ${count} ${count === 1 ? 'lead' : 'leads'} - show them`} onClick={(e) => open({ ...d, count }, e.currentTarget)} className="rounded-md font-semibold tabular-nums text-[var(--accent-deep)] underline-offset-2 hover:underline">
      {count}
    </button>
  )

  return (
    <main className="min-w-0 flex-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Stats</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">What came in, what your agents did, and where the pipeline stands.</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:flex sm:flex-wrap">
        <select aria-label="Time range" value={range} onChange={(e) => setRange(e.target.value as RangeKey)} className={selectClass}>
          {Object.entries(RANGES).map(([k, r]) => <option key={k} value={k}>{r.label}</option>)}
        </select>
        <select aria-label="Source" value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${selectClass} sm:max-w-56`}>
          <option value="">All sources</option>
          <option value="none">No source</option>
          {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select aria-label="List" value={listId} onChange={(e) => setListId(e.target.value)} className={`${selectClass} sm:max-w-56`}>
          <option value="">All lists</option>
          {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
        </select>
      </div>

      {currentError ? <div className="mt-4"><RetryState error={currentError} onRetry={loadStats} /></div> : dataLoading && !current ? <div className="mt-4"><LoadingState label="Loading statistics…" /></div> : <>
      <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([label, value, d]) => (
          <div key={label} className={`relative rounded-xl border border-[var(--line)] bg-[var(--panel-strong)] px-3 py-2 ${d ? 'hover:border-[var(--accent)]' : ''}`}>
            <dt className="text-xs text-[var(--muted)]">{label}</dt>
            <dd className="text-2xl font-bold tabular-nums text-[var(--ink)]">
              {d && value !== undefined ? (
                // The whole tile is the target; the button stays the named, focusable control.
                <button type="button" aria-label={`${label}, ${rangeLabel.toLowerCase()}: ${value} ${value === 1 ? 'lead' : 'leads'} - show them`} onClick={(e) => open(d, e.currentTarget)} className="text-[var(--accent-deep)] after:absolute after:inset-0 after:rounded-xl after:content-['']">
                  {value}
                </button>
              ) : value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-[var(--muted)]">
        {RANGES[range].label}. Leads count when they were saved, messages when they were sent.
        {sourceId || listId ? ' Sources added is not narrowed by the source or list filter.' : ''}
      </p>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        <BarChart
          title="Leads added"
          labels={labels}
          current={labels.length - 1}
          series={[{ name: 'Leads added', color: 'var(--series-1)', values: col('leads_added') }]}
          onSelect={current ? (i, opener) => open(period('Leads added', 'Added', current.series[i].leads_added, 'created', current.pairs[i], labels[i]), opener) : undefined}
        />
        <BarChart
          title="Messages"
          labels={labels}
          current={labels.length - 1}
          series={[
            { name: 'Sent', color: 'var(--series-1)', values: col('messages_sent') },
            { name: 'Received', color: 'var(--series-2)', values: col('messages_received') },
          ]}
        />
        <BarChart
          title="Leads who replied"
          labels={labels}
          current={labels.length - 1}
          series={[{ name: 'Leads who replied', color: 'var(--series-1)', values: col('leads_replied') }]}
          onSelect={current ? (i, opener) => open(period('Leads who replied', 'Replied', current.series[i].leads_replied, 'replied', current.pairs[i], labels[i]), opener) : undefined}
        />
        <BarChart title="Sources added" labels={labels} current={labels.length - 1} series={[{ name: 'Sources added', color: 'var(--series-1)', values: col('sources_added') }]} />
      </div>

      {pipeline && (
        <section className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4">
          <h2 className="text-sm font-semibold text-[var(--ink)]">Pipeline now <span className="font-normal text-[var(--muted)]">— {valueButton(pipeline.total, 'Pipeline, all leads', { title: 'Pipeline · all leads' })} leads</span></h2>
          <dl className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {STATUSES.map((s) => (
              <div key={s} className="flex items-center gap-1"><dt className="capitalize text-[var(--muted)]">{s}</dt><dd>{valueButton(pipeline[`status_${s}`], `Pipeline, ${s}`, { title: `Pipeline · ${s}`, filter: { status: s } })}</dd></div>
            ))}
          </dl>
          <dl className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            {FITS.map((f) => (
              <div key={f} className="flex items-center gap-1"><dt className="capitalize text-[var(--muted)]">{f} fit</dt><dd>{valueButton(pipeline[`fit_${f}`], `Pipeline, ${f} fit`, { title: `Pipeline · ${f} fit`, filter: { fit: f } })}</dd></div>
            ))}
            <div className="flex items-center gap-1"><dt className="text-[var(--muted)]">not rated</dt><dd>{valueButton(pipeline.fit_none, 'Pipeline, not rated', { title: 'Pipeline · not rated', filter: { fit: 'none' } })}</dd></div>
          </dl>
          <p className="mt-2 text-xs text-[var(--muted)]">
            {valueButton(pipeline.with_conversation, 'Pipeline, with a recorded conversation', { title: 'Pipeline · with a recorded conversation', constraint: { label: 'Has a recorded conversation', params: { has_messages: true } } })} have a recorded conversation
            {' · '}{valueButton(pipeline.replied, 'Pipeline, have replied', { title: 'Pipeline · have replied', constraint: { label: 'Has replied', params: { replied_from: 0 } } })} have replied
            {' · '}{valueButton(pipeline.needs_attention, 'Pipeline, need attention', { title: 'Pipeline · need attention', constraint: { label: 'Needs attention', params: { needs_attention: true } } })} need attention
          </p>
        </section>
      )}
      </>}

      <ActivityFeed sourceId={sourceId} projectId={projectId} version={version} people={people} sources={sources} onOpenLead={onOpenLead} onAddLead={onAddLead} />
      {drill && (
        <StatsLeads
          drill={drill.value}
          sourceId={drill.sourceId}
          listId={drill.listId}
          projectId={drill.projectId}
          lists={lists}
          projects={projects}
          people={people}
          sources={sources}
          assignees={assignees}
          tags={tags}
          version={version}
          onOpenLead={onOpenLead}
          onClose={() => setDrill(null)}
        />
      )}
    </main>
  )
}
