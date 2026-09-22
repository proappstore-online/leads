import { useCallback, useEffect, useRef, useState } from 'react'
import { ProShell } from '@proappstore/sdk'
import { useProAuth } from '@proappstore/sdk/hooks'
import { app } from './lib/app'
import { COUNTRY_OPTIONS, countryName } from './lib/countries'
import { q } from './lib/actions'
import { FITS, STATUSES, type Lead, type LeadList, type Project, type ProjectMember, type Sort, type SortKey, type Source, type SourceSort } from './types'
import { JoinProject } from './components/JoinProject'
import { LeadForm } from './components/LeadForm'
import { LeadTable } from './components/LeadTable'
import { ListForm } from './components/ListForm'
import { ProjectForm } from './components/ProjectForm'
import { SourceDetails } from './components/SourceDetails'
import { SourceForm } from './components/SourceForm'
import { SourcesTable } from './components/SourcesTable'
import { StatsPage } from './components/StatsPage'
import { SignIn } from './components/SignIn'

const PAGE = 200

const JOIN_KEY = 'leads.join'
// An invite link (?join=<code>) is kept through sign-in and offered once the user is in.
const joinParam = new URLSearchParams(location.search).get('join')
if (joinParam) {
  localStorage.setItem(JOIN_KEY, joinParam)
  history.replaceState(null, '', location.pathname + location.hash)
}

export default function App() {
  const { user, loading } = useProAuth(app)
  // ProShell's own signed-out gate is GitHub-only; ours offers Google too.
  if (!loading && !user) return <SignIn />

  return (
    <ProShell app={app} appName="Leads">
      <Home userId={user?.id ?? ''} userName={user?.name ?? ''} />
    </ProShell>
  )
}

function Home({ userId, userName }: { userId: string; userName: string }) {
  const [lists, setLists] = useState<LeadList[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  /** Everyone who joined one of your projects. */
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [total, setTotal] = useState(0)
  const [attentionCount, setAttentionCount] = useState(0)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [assignedCount, setAssignedCount] = useState(0)
  /** Leads assigned to you — your own and those shared with you. */
  const [assignedOnly, setAssignedOnly] = useState(false)
  const [projectId, setProjectId] = useState<string | null>(null)
  /** '' = anyone, 'none' = nobody, 'me', otherwise a member's user id. */
  const [assignedTo, setAssignedTo] = useState('')
  const [editingProject, setEditingProject] = useState<Project | 'new' | null>(null)
  const [joinCode, setJoinCode] = useState(() => localStorage.getItem(JOIN_KEY))
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
  /** '' = any, 'none' = not confirmed yet, otherwise an ISO code. */
  const [country, setCountry] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [editingLead, setEditingLead] = useState<Lead | 'new' | null>(null)
  const [editingList, setEditingList] = useState<LeadList | 'new' | null>(null)
  const request = useRef(0)

  const loadLists = useCallback(async () => {
    try {
      const [rows, count, projectRows, memberRows] = await Promise.all([
        q<LeadList>('list_lists'),
        q<{ total: number; needs_attention: number; no_source: number; assigned_to_me: number }>('count_leads'),
        q<Project>('list_projects'),
        q<ProjectMember>('list_project_members'),
      ])
      setLists(rows)
      setProjects(projectRows)
      setMembers(memberRows)
      setTotal(count[0]?.total ?? 0)
      setAttentionCount(count[0]?.needs_attention ?? 0)
      setNoSource(count[0]?.no_source ?? 0)
      setAssignedCount(count[0]?.assigned_to_me ?? 0)
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
      const rows = assignedOnly
        ? await q<Lead>('list_assigned_leads', { status: status || null, q: search.trim() || null, limit: PAGE, offset })
        : await q<Lead>('list_leads', { list_id: listId, project_id: projectId, assigned_to: assignedTo || null, status: status || null, fit: fit || null, country: country || null, needs_attention: attentionOnly || null, source_id: sourceId || null, q: search.trim() || null, sort: sort.key, dir: sort.dir, limit: PAGE, offset })
      if (id !== request.current) return // a newer filter superseded this request
      setLeads((prev) => (offset ? [...prev, ...rows] : rows))
      setHasMore(rows.length === PAGE)
      setError('')
    } catch (e) {
      if (id === request.current) setError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [assignedOnly, listId, projectId, assignedTo, status, fit, country, attentionOnly, sourceId, search, sort])

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

  /** Show the leads table for one scope: a list, a project, flagged or assigned leads — or all leads. */
  function browse(scope: { listId?: string; projectId?: string; attention?: boolean; assigned?: boolean }) {
    setView('leads')
    setListId(scope.listId ?? null)
    setProjectId(scope.projectId ?? null)
    setAttentionOnly(Boolean(scope.attention))
    setAssignedOnly(Boolean(scope.assigned))
  }

  function showSourceLeads(id: string) {
    setViewingSourceId(null)
    browse({})
    setSourceId(id)
  }

  function closeJoin() {
    localStorage.removeItem(JOIN_KEY)
    setJoinCode(null)
  }

  function refresh() {
    setVersion((v) => v + 1)
    loadLists()
    loadSources()
    loadLeads(0)
  }

  const current = lists.find((l) => l.id === listId) ?? null
  const ownProjects = projects.filter((p) => p.is_owner)
  const sharedProjects = projects.filter((p) => !p.is_owner)
  const currentProject = ownProjects.find((p) => p.id === projectId) ?? null
  const looseLists = lists.filter((l) => !ownProjects.some((p) => p.id === l.project_id))
  // Names for the Assigned column, filter and form: members of your projects, and you.
  const people = new Map(members.map((m) => [m.user_id, m.display_name ?? 'Unnamed member']))
  people.set(userId, 'Me')
  const assignees = [...new Map(members.map((m) => [m.user_id, m])).values()]
  const chip = (active: boolean) =>
    `flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'text-[var(--ink)] hover:bg-[var(--line)]'}`
  const listChip = (list: LeadList, nested = false) => (
    <button key={list.id} type="button" onClick={() => browse({ listId: list.id })} title={list.purpose ?? undefined} className={`${chip(view === 'leads' && listId === list.id)} ${nested ? 'lg:ml-4' : ''}`}>
      <span className="truncate">{list.name}</span>
      <span className="text-xs font-medium text-[var(--muted)]">{list.lead_count}</span>
    </button>
  )

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-6 lg:px-6">
      <nav aria-label="Lead lists" className="flex gap-1 overflow-x-auto lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-visible">
        <button type="button" onClick={() => { browse({}); setSourceId('') }} className={chip(view === 'leads' && listId === null && projectId === null && !attentionOnly && !assignedOnly)}>
          <span>All leads</span>
          <span className="text-xs font-medium text-[var(--muted)]">{total}</span>
        </button>
        <button type="button" onClick={() => browse({ attention: true })} className={chip(view === 'leads' && attentionOnly)}>
          <span className={attentionCount > 0 ? 'text-[var(--warning)]' : undefined}>Needs attention</span>
          <span className={`rounded-full px-2 text-xs font-bold ${attentionCount > 0 ? 'bg-[var(--warning)] text-[var(--paper)]' : 'font-medium text-[var(--muted)]'}`}>{attentionCount}</span>
        </button>
        <button type="button" onClick={() => browse({ assigned: true })} className={chip(view === 'leads' && assignedOnly)}>
          <span>Assigned to me</span>
          <span className="text-xs font-medium text-[var(--muted)]">{assignedCount}</span>
        </button>
        {ownProjects.map((project) => (
          <div key={project.id} className="contents">
            <button type="button" onClick={() => browse({ projectId: project.id })} title={project.description ?? undefined} className={chip(view === 'leads' && projectId === project.id)}>
              <span className="truncate">{project.name}</span>
              <span className="text-xs font-medium text-[var(--muted)]">{project.member_count ? `${project.member_count} ${project.member_count === 1 ? 'member' : 'members'}` : 'project'}</span>
            </button>
            {lists.filter((l) => l.project_id === project.id).map((l) => listChip(l, true))}
          </div>
        ))}
        {looseLists.map((l) => listChip(l))}
        <button type="button" onClick={() => setEditingList('new')} className="shrink-0 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--accent)] hover:bg-[var(--line)]">+ New list</button>
        <button type="button" onClick={() => setEditingProject('new')} className="shrink-0 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--accent)] hover:bg-[var(--line)]">+ New project</button>
        {sharedProjects.length > 0 && <div className="hidden px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] lg:block">Shared with me</div>}
        {sharedProjects.map((project) => (
          <button key={project.id} type="button" onClick={() => setEditingProject(project)} className={chip(false)}>
            <span className="truncate">{project.name}</span>
            <span className="truncate text-xs font-medium text-[var(--muted)]">{project.owner_name ?? 'shared'}</span>
          </button>
        ))}
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
            <h1 className="display-font truncate text-2xl font-bold text-[var(--ink)]">{attentionOnly ? 'Needs attention' : assignedOnly ? 'Assigned to me' : current?.name ?? currentProject?.name ?? 'All leads'}</h1>
            {(current?.purpose || currentProject?.description) && <p className="mt-0.5 text-sm text-[var(--muted)]">{current?.purpose ?? currentProject?.description}</p>}
            {assignedOnly && <p className="mt-0.5 text-sm text-[var(--muted)]">Your own leads assigned to you, and leads shared with you through projects you joined.</p>}
          </div>
          <div className="flex gap-2">
            {current && (
              <button type="button" onClick={() => setEditingList(current)} className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Edit list</button>
            )}
            {currentProject && (
              <button type="button" onClick={() => setEditingProject(currentProject)} className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Manage project</button>
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
          {!assignedOnly && <>
          <select
            aria-label="Filter by assignee"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="max-w-44 rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none"
          >
            <option value="">Anyone</option>
            <option value="none">Not assigned</option>
            <option value="me">Assigned to me</option>
            {assignees.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name ?? 'Unnamed member'}</option>)}
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
            aria-label="Filter by country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="max-w-44 rounded-xl border border-[var(--line)] bg-[var(--glass)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none"
          >
            <option value="">Any country</option>
            <option value="none">Country not confirmed</option>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
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
          </>}
        </div>

        {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}

        <div className="mt-4">
          {leads.length > 0 ? (
            <LeadTable leads={leads} lists={lists} projects={projects} people={people} sort={sort} onSort={toggleSort} onOpen={setEditingLead} />
          ) : (
            <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-12 text-center text-sm text-[var(--muted)]">
              {loading ? 'Loading…' : attentionOnly ? 'Nothing needs your attention.' : assignedOnly ? (search || status ? 'No assigned leads match these filters.' : 'Nothing is assigned to you.') : search || status || fit || country || sourceId || assignedTo ? 'No leads match these filters.' : current ? 'No leads in this list yet.' : currentProject ? 'No leads in this project\'s lists yet.' : 'No leads yet. Add your first one.'}
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
          projects={projects}
          members={members}
          userId={userId}
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
          projects={ownProjects}
          defaultProjectId={projectId}
          onClose={() => setEditingList(null)}
          onSaved={(id) => { setEditingList(null); browse({ listId: id }); refresh() }}
          onDeleted={() => { setEditingList(null); browse({}); refresh() }}
        />
      )}
      {editingProject && (
        <ProjectForm
          project={editingProject === 'new' ? null : editingProject}
          ownerName={userName}
          onClose={() => setEditingProject(null)}
          onSaved={(id) => { setEditingProject(null); browse({ projectId: id }); refresh() }}
          onDeleted={() => { setEditingProject(null); browse({}); refresh() }}
          onChanged={refresh}
        />
      )}
      {joinCode && (
        <JoinProject
          code={joinCode}
          userName={userName}
          onClose={closeJoin}
          onJoined={() => { closeJoin(); browse({ assigned: true }); refresh() }}
        />
      )}
    </div>
  )
}
