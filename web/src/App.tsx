import { useCallback, useEffect, useRef, useState } from 'react'
import { ProShell } from '@proappstore/sdk'
import { useProAuth } from '@proappstore/sdk/hooks'
import { app } from './lib/app'
import { q } from './lib/actions'
import { FITS, STATUSES, type Lead, type LeadList, type Sort, type SortKey, type Source, type SourceSort } from './types'
import { LeadForm } from './components/LeadForm'
import { LeadTable } from './components/LeadTable'
import { ListForm } from './components/ListForm'
import { SourceDetails } from './components/SourceDetails'
import { SourceForm } from './components/SourceForm'
import { SourcesTable } from './components/SourcesTable'
import { StatsPage } from './components/StatsPage'
import { SignIn } from './components/SignIn'

const PAGE = 200

export default function App() {
  const { user, loading } = useProAuth(app)
  // ProShell's own signed-out gate is GitHub-only; ours offers Google too.
  if (!loading && !user) return <SignIn />

  return (
    <ProShell app={app} appName="Leads">
      <Home />
    </ProShell>
  )
}

function Home() {
  const [lists, setLists] = useState<LeadList[]>([])
  const [total, setTotal] = useState(0)
  const [attentionCount, setAttentionCount] = useState(0)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [view, setView] = useState<'leads' | 'sources' | 'stats'>('leads')
  const [sources, setSources] = useState<Source[]>([])
  const [noSource, setNoSource] = useState(0)
  const [sourceSort, setSourceSort] = useState<SourceSort>('leads')
  /** '' = any source, 'none' = leads without one, otherwise a source id. */
  const [sourceId, setSourceId] = useState('')
  const [editingSource, setEditingSource] = useState<Source | 'new' | null>(null)
  const [viewingSourceId, setViewingSourceId] = useState<string | null>(null)
  /** Bumped on every refresh so an open source panel reloads after edits. */
  const [version, setVersion] = useState(0)
  const [leads, setLeads] = useState<Lead[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [listId, setListId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [fit, setFit] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [editingLead, setEditingLead] = useState<Lead | 'new' | null>(null)
  const [editingList, setEditingList] = useState<LeadList | 'new' | null>(null)
  const request = useRef(0)

  const loadLists = useCallback(async () => {
    try {
      const [rows, count] = await Promise.all([q<LeadList>('list_lists'), q<{ total: number; needs_attention: number; no_source: number }>('count_leads')])
      setLists(rows)
      setTotal(count[0]?.total ?? 0)
      setAttentionCount(count[0]?.needs_attention ?? 0)
      setNoSource(count[0]?.no_source ?? 0)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const sourcesRequest = useRef(0)
  const loadSources = useCallback(async () => {
    const id = ++sourcesRequest.current
    try {
      const rows = await q<Source>('list_sources', { sort: sourceSort })
      if (id === sourcesRequest.current) setSources(rows) // ignore a slower, older response
    } catch (e) {
      if (id === sourcesRequest.current) setError(e instanceof Error ? e.message : String(e))
    }
  }, [sourceSort])

  const loadLeads = useCallback(async (offset: number) => {
    const id = ++request.current
    setLoading(true)
    try {
      const rows = await q<Lead>('list_leads', { list_id: listId, status: status || null, fit: fit || null, needs_attention: attentionOnly || null, source_id: sourceId || null, q: search.trim() || null, sort: sort.key, dir: sort.dir, limit: PAGE, offset })
      if (id !== request.current) return // a newer filter superseded this request
      setLeads((prev) => (offset ? [...prev, ...rows] : rows))
      setHasMore(rows.length === PAGE)
      setError('')
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [listId, status, fit, attentionOnly, sourceId, search, sort])

  useEffect(() => { loadLists() }, [loadLists])
  useEffect(() => { loadSources() }, [loadSources])

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => loadLeads(0), 250)
    return () => clearTimeout(timer)
  }, [loadLeads])

  // Same column flips direction; a new column starts ascending, except the date columns (most recent first).
  function toggleSort(key: SortKey) {
    setSort((prev) => prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'last_contact' || key === 'last_reply' ? 'desc' : 'asc' })
  }

  async function openLeadById(id: string) {
    try {
      const [lead] = await q<Lead>('get_lead', { id })
      if (lead) setEditingLead(lead)
      else setError('That lead no longer exists.')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  function showSourceLeads(id: string) {
    setViewingSourceId(null)
    setView('leads')
    setListId(null)
    setAttentionOnly(false)
    setSourceId(id)
  }

  function refresh() {
    setVersion((v) => v + 1)
    loadLists()
    loadSources()
    loadLeads(0)
  }

  const current = lists.find((l) => l.id === listId) ?? null
  const chip = (active: boolean) =>
    `flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'text-[var(--ink)] hover:bg-[var(--line)]'}`

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-6 lg:px-6">
      <nav aria-label="Lead lists" className="flex gap-1 overflow-x-auto lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-visible">
        <button type="button" onClick={() => { setView('leads'); setListId(null); setAttentionOnly(false); setSourceId('') }} className={chip(view === 'leads' && listId === null && !attentionOnly)}>
          <span>All leads</span>
          <span className="text-xs font-medium text-[var(--muted)]">{total}</span>
        </button>
        <button type="button" onClick={() => { setView('leads'); setListId(null); setAttentionOnly(true) }} className={chip(view === 'leads' && attentionOnly)}>
          <span className={attentionCount > 0 ? 'text-[var(--warning)]' : undefined}>Needs attention</span>
          <span className={`rounded-full px-2 text-xs font-bold ${attentionCount > 0 ? 'bg-[var(--warning)] text-[var(--paper)]' : 'font-medium text-[var(--muted)]'}`}>{attentionCount}</span>
        </button>
        {lists.map((list) => (
          <button key={list.id} type="button" onClick={() => { setView('leads'); setListId(list.id); setAttentionOnly(false) }} title={list.purpose ?? undefined} className={chip(view === 'leads' && listId === list.id)}>
            <span className="truncate">{list.name}</span>
            <span className="text-xs font-medium text-[var(--muted)]">{list.lead_count}</span>
          </button>
        ))}
        <button type="button" onClick={() => setEditingList('new')} className="shrink-0 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--accent)] hover:bg-[var(--line)]">+ New list</button>
        <div className="hidden border-t border-[var(--line)] lg:my-2 lg:block" />
        <button type="button" onClick={() => setView('stats')} className={chip(view === 'stats')}>
          <span>Stats</span>
        </button>
        <button type="button" onClick={() => setView('sources')} className={chip(view === 'sources')}>
          <span>Sources</span>
          <span className="text-xs font-medium text-[var(--muted)]">{sources.length}</span>
        </button>
      </nav>

      {view === 'stats' ? (
        <StatsPage lists={lists} sources={sources} version={version} onOpenLead={openLeadById} />
      ) : view === 'sources' ? (
      <main className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Sources</h1>
            <p className="mt-0.5 text-sm text-[var(--muted)]">Where leads are found and how each place performs. Click a source for its details and leads.</p>
          </div>
          <div className="flex gap-2">
            <select aria-label="Sort sources" value={sourceSort} onChange={(e) => setSourceSort(e.target.value as SourceSort)} className="rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2 text-sm text-[var(--ink)] outline-none">
              <option value="leads">Most leads</option>
              <option value="reply_rate">Best reply rate</option>
              <option value="won">Most won</option>
              <option value="high_fit">Most high fit</option>
              <option value="last_found">Recently found</option>
              <option value="name">Name</option>
            </select>
            <button type="button" onClick={() => setEditingSource('new')} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)]">Add source</button>
          </div>
        </div>
        {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
        <div className="mt-4">
          <SourcesTable
            sources={sources}
            noSource={noSource}
            onOpen={(id) => { if (id === 'none') showSourceLeads('none'); else setViewingSourceId(id) }}
            onEdit={setEditingSource}
          />
        </div>
      </main>
      ) : (
      <main className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display-font truncate text-2xl font-bold text-[var(--ink)]">{attentionOnly ? 'Needs attention' : current?.name ?? 'All leads'}</h1>
            {current?.purpose && <p className="mt-0.5 text-sm text-[var(--muted)]">{current.purpose}</p>}
          </div>
          <div className="flex gap-2">
            {current && (
              <button type="button" onClick={() => setEditingList(current)} className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Edit list</button>
            )}
            <button type="button" onClick={() => setEditingLead('new')} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)]">Add lead</button>
          </div>
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="search"
            aria-label="Search leads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, title, email, phone, source"
            className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--glass)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]"
          />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2.5 text-sm capitalize text-[var(--ink)] outline-none"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            aria-label="Filter by fit"
            value={fit}
            onChange={(e) => setFit(e.target.value)}
            className="rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2.5 text-sm capitalize text-[var(--ink)] outline-none"
          >
            <option value="">Any fit</option>
            {FITS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            aria-label="Filter by source"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="max-w-48 rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none"
          >
            <option value="">Any source</option>
            <option value="none">No source</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}

        <div className="mt-4">
          {leads.length > 0 ? (
            <LeadTable leads={leads} lists={lists} sort={sort} onSort={toggleSort} onOpen={setEditingLead} />
          ) : (
            <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center text-sm text-[var(--muted)]">
              {loading ? 'Loading…' : attentionOnly ? 'Nothing needs your attention.' : search || status || fit || sourceId ? 'No leads match these filters.' : current ? 'No leads in this list yet.' : 'No leads yet. Add your first one.'}
            </p>
          )}
          {hasMore && (
            <button type="button" onClick={() => loadLeads(leads.length)} disabled={loading} className="mt-3 w-full rounded-xl border border-[var(--line-strong)] py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-60">
              {loading ? 'Loading…' : 'Load more'}
            </button>
          )}
        </div>
        <a href="https://proappstore.online" className="mt-6 inline-block text-xs font-semibold text-[var(--muted)] underline-offset-4 hover:underline">Built for ProAppStore</a>
      </main>
      )}

      {viewingSourceId && (
        <SourceDetails
          sourceId={viewingSourceId}
          version={version}
          onClose={() => setViewingSourceId(null)}
          onEdit={setEditingSource}
          onOpenLead={setEditingLead}
          onShowLeads={() => showSourceLeads(viewingSourceId)}
        />
      )}
      {editingLead && (
        <LeadForm
          lead={editingLead === 'new' ? null : editingLead}
          lists={lists}
          sources={sources}
          defaultListId={listId}
          onClose={() => setEditingLead(null)}
          onSaved={() => { setEditingLead(null); refresh() }}
        />
      )}
      {editingSource && (
        <SourceForm
          source={editingSource === 'new' ? null : editingSource}
          onClose={() => setEditingSource(null)}
          onSaved={() => { setEditingSource(null); refresh() }}
          onDeleted={() => {
            const deleted = editingSource === 'new' ? null : editingSource?.id
            setViewingSourceId(null)
            setSourceId((s) => (s === deleted ? '' : s)) // don't leave the leads view filtered on a source that no longer exists
          }}
        />
      )}
      {editingList && (
        <ListForm
          list={editingList === 'new' ? null : editingList}
          onClose={() => setEditingList(null)}
          onSaved={(id) => { setEditingList(null); setListId(id); refresh() }}
          onDeleted={() => { setEditingList(null); setListId(null); refresh() }}
        />
      )}
    </div>
  )
}
