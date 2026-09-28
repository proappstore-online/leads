import { useCallback, useEffect, useRef, useState } from 'react'
import { q } from '../lib/actions'
import { filterParams, NO_FILTER, projectOf, type LeadFilter } from '../lib/lead'
import type { Lead, LeadList, Project, ProjectMember, Sort, SortKey, Source } from '../types'
import { EmptyState, LoadingState, RetryState } from './AsyncState'
import { LeadFilters } from './LeadFilters'
import { LeadTable } from './LeadTable'
import { Modal } from './Modal'

const PAGE = 200

/** One value on the Stats page, and the list_leads filter that returns exactly the leads behind it. */
export interface Drill {
  /** What was opened, e.g. "Leads added · 3 Sep". */
  title: string
  /** The number the Stats page showed. */
  count: number
  /** Filter bar values the value stands for (a status, a fit) - shown and changeable in the bar. */
  filter?: Partial<LeadFilter>
  /** The rest of the filter (a time range, "has a conversation"...), shown as a chip that can be cleared. */
  constraint?: { label: string; params: Record<string, string | number | boolean> }
}

/**
 * The leads behind one Stats value (#37), in a popup over the Stats page. It is the leads page's own
 * LeadFilters and LeadTable with the value's filter applied, so rows look and behave the same, and
 * with nothing changed it lists exactly as many leads as the value counted.
 */
export function StatsLeads({ drill, sourceId, listId, projectId, lists, projects, people, sources, assignees, tags, version, onOpenLead, onClose }: {
  drill: Drill
  /** The Stats page's own source and list narrowing, carried in. */
  sourceId: string
  listId: string
  /** The current project, or null for every project. */
  projectId: string | null
  lists: LeadList[]
  projects: Project[]
  people: Map<string, string>
  sources: Source[]
  assignees: ProjectMember[]
  tags: { tag: string; leads: number }[]
  /** Bumped after any save, so the rows reload after a lead is edited from here. */
  version: number
  onOpenLead: (id: string) => void
  onClose: () => void
}) {
  const [filter, setFilter] = useState<LeadFilter>({ ...NO_FILTER, sourceId, ...drill.filter })
  const [constraintOn, setConstraintOn] = useState(Boolean(drill.constraint))
  const [list, setList] = useState(() => lists.find((l) => l.id === listId) ?? null)
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [leads, setLeads] = useState<Lead[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const request = useRef(0)

  const load = useCallback(async (offset: number) => {
    const id = ++request.current
    setLoading(true)
    setError('')
    try {
      const rows = await q<Lead>('list_leads', {
        ...(constraintOn ? drill.constraint?.params : {}),
        list_id: list?.id ?? null,
        project_id: list ? projectOf(list) : projectId,
        ...filterParams(filter),
        sort: sort.key, dir: sort.dir, limit: PAGE, offset,
      })
      if (id !== request.current) return // a newer filter superseded this request
      setLeads((prev) => (offset ? [...prev, ...rows] : rows))
      setHasMore(rows.length === PAGE)
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [drill, constraintOn, list, projectId, filter, sort])

  // Debounced like the leads page, so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => load(0), 250)
    return () => clearTimeout(timer)
  }, [load, version])

  function toggleSort(key: SortKey) {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'last_contact' || key === 'last_reply' || key === 'updated' ? 'desc' : 'asc' })
  }

  const unchanged = constraintOn === Boolean(drill.constraint) && list?.id === (listId || undefined)
    && JSON.stringify(filter) === JSON.stringify({ ...NO_FILTER, sourceId, ...drill.filter })
  const shown = `${leads.length}${hasMore ? '+' : ''} ${leads.length === 1 && !hasMore ? 'lead' : 'leads'}`
  const chip = 'inline-flex min-w-0 items-center gap-1 rounded-full bg-[var(--accent-soft)] py-0.5 pl-3 pr-1 text-xs font-semibold text-[var(--accent-deep)]'
  const clear = 'rounded-full px-2 text-base leading-none hover:bg-[var(--line)]'

  return (
    <Modal title={drill.title} onClose={onClose} wide>
      <p role="status" className="mt-1 text-sm text-[var(--muted)]">
        {loading && leads.length === 0 ? 'Loading…' : `Showing ${shown}`}
        {' · '}the Stats page shows {drill.count}
        {unchanged ? '' : ' before your changes to the filter'}
      </p>

      {(constraintOn || list) && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Also filtered by">
          {constraintOn && drill.constraint && (
            <span className={chip}>
              <span className="truncate">{drill.constraint.label}</span>
              <button type="button" aria-label={`Clear filter: ${drill.constraint.label}`} onClick={() => setConstraintOn(false)} className={clear}>×</button>
            </span>
          )}
          {list && (
            <span className={chip}>
              <span className="truncate">List: {list.name}</span>
              <button type="button" aria-label={`Clear filter: list ${list.name}`} onClick={() => setList(null)} className={clear}>×</button>
            </span>
          )}
        </div>
      )}

      <div className="mt-3">
        <LeadFilters value={filter} onChange={setFilter} sources={sources} assignees={assignees} tags={tags} />
      </div>

      <div className="mt-4">
        {error ? <RetryState error={error} onRetry={() => load(0)} />
          : leads.length > 0 ? <LeadTable leads={leads} lists={lists} projects={projects} people={people} sort={sort} onSort={toggleSort} onOpen={(lead) => onOpenLead(lead.id)} />
            : loading ? <LoadingState label="Loading leads…" />
              : <EmptyState>No leads match this filter.</EmptyState>}
        {hasMore && (
          <button type="button" onClick={() => load(leads.length)} disabled={loading} className="mt-3 w-full rounded-xl border border-[var(--line-strong)] py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-60">
            {loading ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </Modal>
  )
}
