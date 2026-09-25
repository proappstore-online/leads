import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { ProShell } from '@proappstore/sdk'
import { useProAuth } from '@proappstore/sdk/hooks'
import { app } from './lib/app'
import { COUNTRY_OPTIONS, countryName } from './lib/countries'
import { q, x } from './lib/actions'
import { ALL_PROJECTS, endOfToday, projectOf } from './lib/lead'
import { FITS, STATUSES, type Lead, type LeadList, type Project, type ProjectMember, type Sort, type SortKey, type Source, type SourceSort } from './types'
import { JoinProject } from './components/JoinProject'
import { LeadBoard } from './components/LeadBoard'
import { LeadForm } from './components/LeadForm'
import { LeadTable } from './components/LeadTable'
import { ListForm } from './components/ListForm'
import { ProjectForm } from './components/ProjectForm'
import { SourceDetails } from './components/SourceDetails'
import { SourceForm } from './components/SourceForm'
import { SourcesTable } from './components/SourcesTable'
import { StatsPage } from './components/StatsPage'
import { SignIn } from './components/SignIn'
import { TopBar } from './components/TopBar'
import { EmptyState, LoadingState, RetryState } from './components/AsyncState'

const PAGE = 200

const JOIN_KEY = 'leads.join'
const LAYOUT_KEY = 'leads.layout'
/** The project being worked in, remembered per browser. */
const PROJECT_KEY = 'leads.project'
// An invite link (?join=<code>) is kept through sign-in and offered once the user is in.
const joinParam = new URLSearchParams(location.search).get('join')
if (joinParam) {
  localStorage.setItem(JOIN_KEY, joinParam)
  history.replaceState(null, '', location.pathname + location.hash)
}

/**
 * You work in one project at a time: the switcher in the top bar sets it, and everything below -
 * lists, counts, leads, sources, stats - is narrowed to it. ALL_PROJECTS shows every project at once,
 * which is also where lists made before projects live.
 */
export default function App() {
  const { user, loading, signOut } = useProAuth(app)
  const [projects, setProjects] = useState<Project[]>([])
  const [loaded, setLoaded] = useState(false)
  const [project, setProject] = useState<string | null>(() => localStorage.getItem(PROJECT_KEY))
  const [editingProject, setEditingProject] = useState<Project | 'new' | null>(null)
  const [joinCode, setJoinCode] = useState(() => localStorage.getItem(JOIN_KEY))
  /** Bumped when projects or their members change, so Home reloads. */
  const [projectsVersion, setProjectsVersion] = useState(0)
  const [error, setError] = useState('')

  const loadProjects = useCallback(async () => {
    setError('')
    setLoaded(false)
    try {
      // 0010 leaves the deployed composite-key tables intact. Copy this caller's
      // rows before any action reads the stable-ID replacements.
      await x('backfill_legacy_join_tables')
      setProjects(await q<Project>('list_projects'))
      setLoaded(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  // On the id, not the user object: a hook that returns a fresh object per render would reload forever.
  useEffect(() => { if (user?.id) loadProjects() }, [user?.id, loadProjects, projectsVersion])

  function switchProject(next: string) {
    localStorage.setItem(PROJECT_KEY, next)
    setProject(next)
  }

  // First visit starts in your first own project; a project that is gone (deleted, left) falls back.
  useEffect(() => {
    if (!loaded) return
    if (project === null || (project !== ALL_PROJECTS && !projects.some((p) => p.id === project))) {
      switchProject(projects.find((p) => p.is_owner)?.id ?? ALL_PROJECTS)
    }
  }, [loaded, project, projects])

  // PAS-OPS-017: whole-account deletion, from the profile menu. Typed confirmation, not a
  // click: the batch itself refuses any other phrase, so a stray tap cannot delete anything.
  async function deleteMyData() {
    const phrase = 'DELETE MY DATA'
    const typed = prompt(`This permanently deletes everything this account holds in Leads - leads, messages, lists, sources, projects and memberships. There is no undo.\n\nType ${phrase} to continue.`)
    if (typed === null) return
    if (typed.trim() !== phrase) { alert('Nothing was deleted: the confirmation text did not match.'); return }
    try {
      await x('delete_my_data', { confirm: phrase })
      localStorage.removeItem(PROJECT_KEY)
      alert('Your data in Leads has been deleted. Your ProAppStore account itself is unchanged - contact support@proappstore.online to delete that.')
      setProject(null)
      loadProjects()
      changed()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  // ProShell's own signed-out gate is GitHub-only; ours offers Google too.
  if (loading) return <div className="mx-auto flex min-h-dvh w-full max-w-7xl items-center px-4"><LoadingState label="Checking your session…" /></div>
  if (!user) return <SignIn />

  const changed = () => setProjectsVersion((v) => v + 1)
  const closeJoin = () => {
    localStorage.removeItem(JOIN_KEY)
    setJoinCode(null)
  }

  return (
    <ProShell
      app={app}
      appName="Leads"
      menuItems={[
        { label: 'Recover session…', onClick: () => { location.assign('/.pas/auth/recover') } },
        { label: 'Delete my data…', onClick: deleteMyData },
      ]}
      renderTopbar={(ctx) => (
        <TopBar
          projects={projects}
          current={project ?? ALL_PROJECTS}
          platform={ctx}
          onSwitch={switchProject}
          onManage={() => setEditingProject(projects.find((p) => p.id === project) ?? null)}
          onNew={() => setEditingProject('new')}
        />
      )}
    >
      {!loaded && !error && <div className="mx-auto w-full max-w-7xl px-4 pt-5 lg:px-6"><LoadingState label="Loading your projects…" /></div>}
      {!loaded && error && <div className="mx-auto w-full max-w-7xl px-4 pt-5 lg:px-6"><RetryState error={error} onRetry={loadProjects} onSignOut={signOut} /></div>}
      {loaded && project !== null && (
        <Home
          key={project}
          userId={user?.id ?? ''}
          userName={user?.name ?? ''}
          projects={projects}
          currentProject={project}
          projectsVersion={projectsVersion}
          onProjectsChanged={changed}
        />
      )}
      {editingProject && (
        <ProjectForm
          project={editingProject === 'new' ? null : editingProject}
          ownerName={user?.name ?? ''}
          onClose={() => setEditingProject(null)}
          onSaved={(id) => { setEditingProject(null); switchProject(id); loadProjects() }}
          onDeleted={() => { setEditingProject(null); switchProject(ALL_PROJECTS); loadProjects() }}
          onChanged={() => { loadProjects(); changed() }}
        />
      )}
      {joinCode && (
        <JoinProject
          code={joinCode}
          userName={user?.name ?? ''}
          onClose={closeJoin}
          onJoined={(joined) => { closeJoin(); switchProject(joined); loadProjects() }}
        />
      )}
    </ProShell>
  )
}

function Home({ userId, userName, projects, currentProject, projectsVersion, onProjectsChanged }: {
  userId: string
  userName: string
  projects: Project[]
  /** Project id, or ALL_PROJECTS. Home is remounted when it changes, so no filter survives a switch. */
  currentProject: string
  projectsVersion: number
  onProjectsChanged: () => void
}) {
  /** What every query here is narrowed to: the current project, or null for all of them. */
  const scope = currentProject === ALL_PROJECTS ? null : currentProject
  const [lists, setLists] = useState<LeadList[]>([])
  /** Everyone who joined one of your projects. */
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [total, setTotal] = useState(0)
  const [attentionCount, setAttentionCount] = useState(0)
  const [attentionOnly, setAttentionOnly] = useState(false)
  const [assignedCount, setAssignedCount] = useState(0)
  const [followUpCount, setFollowUpCount] = useState(0)
  /** Open leads whose follow-up is due by tonight, soonest first. */
  const [followUpsOnly, setFollowUpsOnly] = useState(false)
  const [tags, setTags] = useState<{ tag: string; leads: number }[]>([])
  const [tag, setTag] = useState('')
  /** '' = any, 'due', 'scheduled', 'none' = open lead with nothing scheduled. */
  const [followUp, setFollowUp] = useState('')
  /** Leads assigned to you — your own and those shared with you. */
  const [assignedOnly, setAssignedOnly] = useState(false)
  /** '' = anyone, 'none' = nobody, 'me', otherwise a member's user id. */
  const [assignedTo, setAssignedTo] = useState('')
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
  const [listsLoading, setListsLoading] = useState(true)
  const [sourcesLoading, setSourcesLoading] = useState(true)
  const [listsError, setListsError] = useState('')
  const [sourcesError, setSourcesError] = useState('')
  const [leadsError, setLeadsError] = useState('')
  const [listId, setListId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [fit, setFit] = useState('')
  /** '' = any, 'none' = not confirmed yet, otherwise an ISO code. */
  const [country, setCountry] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [editingLead, setEditingLead] = useState<Lead | 'new' | null>(null)
  const [editingList, setEditingList] = useState<LeadList | 'new' | null>(null)
  /** Table or Kanban board — the same leads either way; remembered on this device. */
  const [layout, setLayout] = useState<'table' | 'board'>(() => (localStorage.getItem(LAYOUT_KEY) === 'board' ? 'board' : 'table'))
  const request = useRef(0)

  const loadLists = useCallback(async () => {
    setListsLoading(true)
    setListsError('')
    try {
      const [rows, count, memberRows, tagRows] = await Promise.all([
        q<LeadList>('list_lists', { project_id: scope }),
        q<{ total: number; needs_attention: number; no_source: number; assigned_to_me: number; follow_ups_due: number }>('count_leads', { project_id: scope, due_before: endOfToday() }),
        q<ProjectMember>('list_project_members', { project_id: scope }),
        q<{ tag: string; leads: number }>('list_tags', { project_id: scope }),
      ])
      setTags(tagRows)
      setFollowUpCount(count[0]?.follow_ups_due ?? 0)
      setLists(rows)
      setMembers(memberRows)
      setTotal(count[0]?.total ?? 0)
      setAttentionCount(count[0]?.needs_attention ?? 0)
      setNoSource(count[0]?.no_source ?? 0)
      setAssignedCount(count[0]?.assigned_to_me ?? 0)
    } catch (e) {
      setListsError(e instanceof Error ? e.message : String(e))
    } finally {
      setListsLoading(false)
    }
  }, [scope, projectsVersion])

  const sourcesRequest = useRef(0)
  const loadSources = useCallback(async () => {
    const id = ++sourcesRequest.current
    setSourcesLoading(true)
    setSourcesError('')
    try {
      const rows = await q<Source>('list_sources', { sort: sourceSort, project_id: scope })
      if (id === sourcesRequest.current) setSources(rows) // ignore a slower, older response
    } catch (e) {
      if (id === sourcesRequest.current) setSourcesError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === sourcesRequest.current) setSourcesLoading(false)
    }
  }, [sourceSort, scope])

  // A list is addressed by its project (#4) - 'none' for a list made before projects.
  const selectedListProject = listId ? projectOf(lists.find((l) => l.id === listId) ?? { project_id: null }) : null
  const loadLeads = useCallback(async (offset: number) => {
    const id = ++request.current
    setLoading(true)
    setLeadsError('')
    try {
      const rows = assignedOnly
        ? await q<Lead>('list_assigned_leads', { project_id: scope, status: status || null, q: search.trim() || null, sort: sort.key, dir: sort.dir, limit: PAGE, offset })
        : await q<Lead>('list_leads', {
          list_id: listId, project_id: selectedListProject ?? scope, assigned_to: assignedTo || null, status: status || null, fit: fit || null, country: country || null,
          needs_attention: attentionOnly || null, source_id: sourceId || null, tag: tag || null, q: search.trim() || null,
          follow_up: followUpsOnly ? 'due' : followUp || null, due_before: endOfToday(),
          sort: sort.key, dir: sort.dir, limit: PAGE, offset,
        })
      if (id !== request.current) return // a newer filter superseded this request
      setLeads((prev) => (offset ? [...prev, ...rows] : rows))
      setHasMore(rows.length === PAGE)
    } catch (e) {
      if (id === request.current) setLeadsError(e instanceof Error ? e.message : String(e))
    } finally {
      if (id === request.current) setLoading(false)
    }
  }, [scope, projectsVersion, assignedOnly, followUpsOnly, listId, selectedListProject, assignedTo, status, fit, country, attentionOnly, sourceId, tag, followUp, search, sort])

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
      : { key, dir: key === 'last_contact' || key === 'last_reply' || key === 'updated' ? 'desc' : 'asc' })
  }

  async function openLeadById(id: string) {
    try {
      const [lead] = await q<Lead>('get_lead', { id })
      if (lead) setEditingLead(lead)
      else setLeadsError('That lead no longer exists.')
    } catch (e) {
      setLeadsError(e instanceof Error ? e.message : String(e))
    }
  }

  /** Show the leads table for one scope: a list, a project, flagged or assigned leads — or all leads. */
  function browse(to: { listId?: string; attention?: boolean; assigned?: boolean; followUps?: boolean }) {
    setView('leads')
    setListId(to.listId ?? null)
    setAttentionOnly(Boolean(to.attention))
    setAssignedOnly(Boolean(to.assigned))
    setFollowUpsOnly(Boolean(to.followUps))
    // Each view opens on the order that suits it; the sort controls take over from there.
    if (to.assigned) setSort({ key: 'updated', dir: 'desc' })
    else if (to.followUps) setSort({ key: 'next_action', dir: 'asc' })
  }

  function showSourceLeads(id: string) {
    setViewingSourceId(null)
    browse({})
    setSourceId(id)
  }

  /**
   * Close a modal only if it is still the one that was open. A save can finish after its modal was
   * closed and another opened (slow mobile networks) - that late save must not close the new one.
   */
  function closeIfOpen<T>(set: Dispatch<SetStateAction<T | null>>, opened: T) {
    set((current) => (current === opened ? null : current))
  }

  function switchLayout(next: 'table' | 'board') {
    localStorage.setItem(LAYOUT_KEY, next)
    setLayout(next)
  }

  /** Board move: shows the new column at once, then saves - and puts the card back if the save is refused. */
  async function moveLead(lead: Lead, status: string) {
    setLeads((rows) => rows.map((l) => (l.id === lead.id ? { ...l, status } : l)))
    try {
      const { changes } = await x('set_lead_status', { id: lead.id, status })
      if (changes === 0) throw new Error(`Could not move ${lead.name} - the lead may have been deleted or is no longer assigned to you.`)
      refresh()
    } catch (e) {
      setLeads((rows) => rows.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l)))
      setLeadsError(e instanceof Error ? e.message : String(e))
    }
  }

  function refresh() {
    setVersion((v) => v + 1)
    loadLists()
    loadSources()
    loadLeads(0)
    onProjectsChanged()
  }

  const current = lists.find((l) => l.id === listId) ?? null
  const ownProjects = projects.filter((p) => p.is_owner)
  // Under "All projects", lists made before projects are shown apart, with the prompt to place them.
  const looseLists = lists.filter((l) => !l.project_id)
  // Names for the Assigned column, filter and form: members of your projects, and you.
  const people = new Map(members.map((m) => [m.user_id, m.display_name ?? 'Unnamed member']))
  people.set(userId, 'Me')
  const assignees = [...new Map(members.map((m) => [m.user_id, m])).values()]
  const chip = (active: boolean) =>
    `flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold ${active ? 'bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'text-[var(--ink)] hover:bg-[var(--line)]'}`
  const listChip = (list: LeadList) => (
    <button key={list.id} type="button" onClick={() => browse({ listId: list.id })} title={list.purpose ?? undefined} className={chip(view === 'leads' && listId === list.id)}>
      <span className="truncate">{list.name}</span>
      <span className="text-xs font-medium text-[var(--muted)]">{list.lead_count}</span>
    </button>
  )

  useEffect(() => {
    const page = view === 'stats' ? 'Stats' : view === 'sources' ? 'Sources' : attentionOnly ? 'Needs attention' : followUpsOnly ? 'Follow-ups due' : assignedOnly ? 'Assigned to me' : current?.name ?? 'Leads'
    document.title = `${page} — ProAppStore`
  }, [view, attentionOnly, followUpsOnly, assignedOnly, current?.name])

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-5 lg:flex-row lg:gap-6 lg:px-6">
      <nav aria-label="Lead lists" className="flex gap-1 overflow-x-auto lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-visible">
        {listsLoading && <span role="status" className="shrink-0 px-3 py-2 text-sm text-[var(--muted)]">Loading lists…</span>}
        {listsError && <div className="min-w-72 lg:min-w-0"><RetryState error={listsError} onRetry={loadLists} /></div>}
        <button type="button" onClick={() => { browse({}); setSourceId('') }} className={chip(view === 'leads' && listId === null && !attentionOnly && !assignedOnly && !followUpsOnly)}>
          <span>All leads</span>
          <span className="text-xs font-medium text-[var(--muted)]">{total}</span>
        </button>
        <button type="button" onClick={() => browse({ attention: true })} className={chip(view === 'leads' && attentionOnly)}>
          <span className={attentionCount > 0 ? 'text-[var(--warning)]' : undefined}>Needs attention</span>
          <span className={`rounded-full px-2 text-xs font-bold ${attentionCount > 0 ? 'bg-[var(--warning)] text-[var(--paper)]' : 'font-medium text-[var(--muted)]'}`}>{attentionCount}</span>
        </button>
        <button type="button" onClick={() => browse({ followUps: true })} className={chip(view === 'leads' && followUpsOnly)}>
          <span className={followUpCount > 0 ? 'text-[var(--warning)]' : undefined}>Follow-ups due</span>
          <span className={`rounded-full px-2 text-xs font-bold ${followUpCount > 0 ? 'bg-[var(--warning)] text-[var(--paper)]' : 'font-medium text-[var(--muted)]'}`}>{followUpCount}</span>
        </button>
        <button type="button" onClick={() => browse({ assigned: true })} className={chip(view === 'leads' && assignedOnly)}>
          <span>Assigned to me</span>
          <span className="text-xs font-medium text-[var(--muted)]">{assignedCount}</span>
        </button>
        {lists.filter((l) => l.project_id).map((l) => listChip(l))}
        {looseLists.length > 0 && <div className="hidden px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] lg:block" title="Lists from before projects - open one and choose its project">Not in a project</div>}
        {looseLists.map((l) => listChip(l))}
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
        <StatsPage lists={lists} sources={sources} people={people} projectId={scope} version={version} onOpenLead={openLeadById} onAddLead={() => setEditingLead('new')} />
      ) : view === 'sources' ? (
      <main id="main-content" className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Sources</h1>
            <p className="mt-0.5 text-sm text-[var(--muted)]">Where leads are found and how each place performs. Click a source for its details and leads.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select aria-label="Sort sources" value={sourceSort} onChange={(e) => setSourceSort(e.target.value as SourceSort)} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none">
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
        <div className="mt-4">
          {sourcesError ? <RetryState error={sourcesError} onRetry={loadSources} />
            : sourcesLoading ? <LoadingState label="Loading sources…" />
              : sources.length === 0 && noSource === 0 ? <EmptyState action={<button type="button" onClick={() => setEditingSource('new')} className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--paper)]">Add source</button>}>No sources yet. Add the places where you find leads.</EmptyState>
                : <SourcesTable
                    sources={sources}
                    noSource={noSource}
                    onOpen={(id) => { if (id === 'none') showSourceLeads('none'); else setViewingSourceId(id) }}
                    onEdit={setEditingSource}
                  />}
        </div>
      </main>
      ) : (
      <main id="main-content" className="min-w-0 flex-1">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="display-font truncate text-2xl font-bold text-[var(--ink)]">{attentionOnly ? 'Needs attention' : followUpsOnly ? 'Follow-ups due' : assignedOnly ? 'Assigned to me' : current?.name ?? 'All leads'}</h1>
            {current?.purpose && <p className="mt-0.5 text-sm text-[var(--muted)] [overflow-wrap:anywhere]">{current.purpose}</p>}
            {followUpsOnly && <p className="mt-0.5 text-sm text-[var(--muted)]">Open leads whose follow-up is due by tonight, soonest first. Filter by Follow-up: none set to find leads going cold.</p>}
            {assignedOnly && <p className="mt-0.5 text-sm text-[var(--muted)]">Your own leads assigned to you, and leads shared with you through projects you joined.</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {current && (
              <button type="button" onClick={() => setEditingList(current)} className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Edit list</button>
            )}
            <div role="group" aria-label="Layout" className="flex rounded-xl border border-[var(--line-strong)] p-0.5">
              {(['table', 'board'] as const).map((l) => (
                <button key={l} type="button" aria-pressed={layout === l} onClick={() => switchLayout(l)} className={`rounded-[10px] px-3 py-1.5 text-sm font-semibold capitalize ${layout === l ? 'bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>{l}</button>
              ))}
            </div>
            <button type="button" onClick={() => setEditingLead('new')} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)]">Add lead</button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <input
            type="search"
            aria-label="Search leads"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, company, title, email, phone, source"
            className="w-full min-w-0 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)] sm:w-auto sm:flex-1"
          />
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm capitalize text-[var(--ink)] outline-none"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {!assignedOnly && <>
          <select
            aria-label="Filter by assignee"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:max-w-44 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none"
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
            className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm capitalize text-[var(--ink)] outline-none"
          >
            <option value="">Any fit</option>
            {FITS.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
          <select
            aria-label="Filter by country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:max-w-44 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none"
          >
            <option value="">Any country</option>
            <option value="none">Country not confirmed</option>
            {COUNTRY_OPTIONS.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
          </select>
          <select
            aria-label="Filter by source"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:max-w-48 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none"
          >
            <option value="">Any source</option>
            <option value="none">No source</option>
            {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {!followUpsOnly && (
            <select aria-label="Filter by follow-up" value={followUp} onChange={(e) => setFollowUp(e.target.value)} className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:max-w-44 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none">
              <option value="">Any follow-up</option>
              <option value="due">Follow-up due</option>
              <option value="scheduled">Follow-up scheduled</option>
              <option value="none">No follow-up set</option>
            </select>
          )}
          {tags.length > 0 && (
            <select aria-label="Filter by tag" value={tag} onChange={(e) => setTag(e.target.value)} className="min-w-0 flex-1 basis-[calc(50%-0.25rem)] sm:flex-none sm:basis-auto sm:max-w-44 rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 text-sm text-[var(--ink)] outline-none">
              <option value="">Any tag</option>
              {tags.map((t) => <option key={t.tag} value={t.tag}>#{t.tag} ({t.leads})</option>)}
            </select>
          )}
          </>}
        </div>

        <div className="mt-4">
          {leadsError ? <RetryState error={leadsError} onRetry={() => loadLeads(0)} /> : leads.length > 0 ? (
            layout === 'board'
              ? <LeadBoard leads={leads} people={people} onOpen={setEditingLead} onMove={moveLead} />
              : <LeadTable leads={leads} lists={lists} projects={projects} people={people} sort={sort} onSort={toggleSort} onOpen={setEditingLead} />
          ) : loading ? <LoadingState label="Loading leads…" /> : (
            <EmptyState action={!attentionOnly && !followUpsOnly && !assignedOnly && !(search || status || fit || country || sourceId || assignedTo || tag || followUp) ? <button type="button" onClick={() => setEditingLead('new')} className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--paper)]">Add lead</button> : undefined}>
              {attentionOnly ? 'Nothing needs your attention.' : followUpsOnly ? 'No follow-ups due. Nice.' : assignedOnly ? (search || status ? 'No assigned leads match these filters.' : 'Nothing is assigned to you.') : search || status || fit || country || sourceId || assignedTo || tag || followUp ? 'No leads match these filters.' : current ? 'No leads in this list yet.' : scope ? 'No leads in this project yet. Add one, or switch project in the top bar.' : 'No leads yet. Add your first one.'}
            </EmptyState>
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
          projectId={scope}
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
          people={people}
          userId={userId}
          defaultListId={listId}
          onClose={() => setEditingLead(null)}
          onSaved={() => { closeIfOpen(setEditingLead, editingLead); refresh() }}
        />
      )}
      {editingSource && (
        <SourceForm
          source={editingSource === 'new' ? null : editingSource}
          onClose={() => setEditingSource(null)}
          onSaved={() => { closeIfOpen(setEditingSource, editingSource); refresh() }}
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
          defaultProjectId={ownProjects.some((p) => p.id === scope) ? scope : null}
          ownerName={userName}
          onClose={() => setEditingList(null)}
          onSaved={(id) => { closeIfOpen(setEditingList, editingList); browse({ listId: id }); refresh() }}
          onDeleted={() => { closeIfOpen(setEditingList, editingList); browse({}); refresh() }}
        />
      )}
    </div>
  )
}
