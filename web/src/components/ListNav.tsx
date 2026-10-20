import { useCallback, useEffect, useRef, useState } from 'react'
import type { LeadList } from '../types'
import { RetryState } from './AsyncState'

export type HomeView = 'leads' | 'sources' | 'stats'

/** One scope of the leads view: a list, flagged, due or assigned leads - or, with none set, all leads. */
export interface Browse {
  listId?: string
  attention?: boolean
  assigned?: boolean
  followUps?: boolean
}

/**
 * The views and lists beside the leads: a sideways-scrolling strip on phones, a sidebar from lg up.
 * Views come first, then lists in a project, then lists from before projects.
 */
export function ListNav({ lists, counts, loading, error, onRetry, view, active, onBrowse, onAllLeads, onNewList, onView }: {
  lists: LeadList[]
  counts: { total: number; attention: number; followUps: number; assigned: number; sources: number }
  loading: boolean
  error: string
  onRetry: () => void
  view: HomeView
  /** The scope of the leads view, marked current while `view` is 'leads'. */
  active: { listId: string | null; attention: boolean; followUps: boolean; assigned: boolean }
  onBrowse: (to: Browse) => void
  /** "All leads" also clears a source filter, unlike other scopes. */
  onAllLeads: () => void
  onNewList: () => void
  onView: (view: HomeView) => void
}) {
  const navRef = useRef<HTMLElement>(null)
  /** Which ends of the phone nav strip have more to scroll to - they fade as a hint. */
  const [navMore, setNavMore] = useState({ start: false, end: false })
  const leads = view === 'leads'
  // Under "All projects", lists made before projects are shown apart, with the prompt to place them.
  const looseLists = lists.filter((l) => !l.project_id)

  /** Props for a nav chip; aria-current also lets the phone strip scroll the active one into view. */
  const chip = (isActive: boolean, extra = '') => ({
    'aria-current': isActive ? 'page' as const : undefined,
    className: `flex shrink-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold ${extra} ${isActive ? 'bg-[var(--accent-soft)] text-[var(--accent-deep)]' : 'text-[var(--ink)] hover:bg-[var(--line)]'}`,
  })
  const listChip = (list: LeadList) => (
    <button key={list.id} type="button" onClick={() => onBrowse({ listId: list.id })} title={list.purpose ?? undefined} {...chip(leads && active.listId === list.id, 'max-lg:order-1')}>
      <span className="truncate">{list.name}</span>
      <span className="text-xs font-medium text-[var(--muted)]">{list.lead_count}</span>
    </button>
  )

  const updateNavMore = useCallback(() => {
    const nav = navRef.current
    if (!nav) return
    setNavMore({ start: nav.scrollLeft > 1, end: nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1 })
  }, [])
  useEffect(() => {
    updateNavMore()
    window.addEventListener('resize', updateNavMore)
    return () => window.removeEventListener('resize', updateNavMore)
  }, [updateNavMore, lists.length, loading])
  // Keep the chip for the current view in sight on the phone strip.
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [view, active.listId, active.attention, active.followUps, active.assigned])
  const fade = (side: 'left' | 'right') => `linear-gradient(to ${side}, black calc(100% - 2rem), transparent)`
  const navMask = navMore.start && navMore.end
    ? 'linear-gradient(to right, transparent, black 2rem, black calc(100% - 2rem), transparent)'
    : navMore.end ? fade('right') : navMore.start ? fade('left') : undefined

  return (
    // Phones: one strip that scrolls sideways - views first, then lists; the faded edge shows there is more.
    <nav ref={navRef} onScroll={updateNavMore} aria-label="Lead lists" style={{ maskImage: navMask, WebkitMaskImage: navMask }} className="flex gap-1 overflow-x-auto lg:w-60 lg:shrink-0 lg:flex-col lg:overflow-visible">
      {loading && <span role="status" className="shrink-0 px-3 py-2 text-sm text-[var(--muted)]">Loading lists…</span>}
      {error && <div className="min-w-72 lg:min-w-0"><RetryState error={error} onRetry={onRetry} /></div>}
      <button type="button" onClick={onAllLeads} {...chip(leads && active.listId === null && !active.attention && !active.assigned && !active.followUps)}>
        <span>All leads</span>
        <span className="text-xs font-medium text-[var(--muted)]">{counts.total}</span>
      </button>
      <button type="button" onClick={() => onBrowse({ attention: true })} {...chip(leads && active.attention)}>
        <span className={counts.attention > 0 ? 'text-[var(--warning)]' : undefined}>Needs attention</span>
        <span className={`rounded-full px-2 text-xs font-bold ${counts.attention > 0 ? 'bg-[var(--warning)] text-[var(--paper)]' : 'font-medium text-[var(--muted)]'}`}>{counts.attention}</span>
      </button>
      <button type="button" onClick={() => onBrowse({ followUps: true })} {...chip(leads && active.followUps)}>
        <span className={counts.followUps > 0 ? 'text-[var(--warning)]' : undefined}>Follow-ups due</span>
        <span className={`rounded-full px-2 text-xs font-bold ${counts.followUps > 0 ? 'bg-[var(--warning)] text-[var(--paper)]' : 'font-medium text-[var(--muted)]'}`}>{counts.followUps}</span>
      </button>
      <button type="button" onClick={() => onBrowse({ assigned: true })} {...chip(leads && active.assigned)}>
        <span>Assigned to me</span>
        <span className="text-xs font-medium text-[var(--muted)]">{counts.assigned}</span>
      </button>
      {lists.filter((l) => l.project_id).map((l) => listChip(l))}
      {looseLists.length > 0 && <div className="hidden px-3 pt-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] lg:block" title="Lists from before projects - open one and choose its project">Not in a project</div>}
      {looseLists.map((l) => listChip(l))}
      <button type="button" onClick={onNewList} className="shrink-0 rounded-xl px-3 py-2 text-left text-sm font-semibold text-[var(--accent)] hover:bg-[var(--line)] max-lg:order-1">+ New list</button>
      <div className="hidden border-t border-[var(--line)] lg:my-2 lg:block" />
      <button type="button" onClick={() => onView('stats')} {...chip(view === 'stats')}>
        <span>Stats</span>
      </button>
      <button type="button" onClick={() => onView('sources')} {...chip(view === 'sources')}>
        <span>Sources</span>
        <span className="text-xs font-medium text-[var(--muted)]">{counts.sources}</span>
      </button>
    </nav>
  )
}
