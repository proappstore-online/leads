import type { ReactNode } from 'react'
import { ALL_PROJECTS } from '../lib/lead'
import type { Project } from '../types'

const NEW_PROJECT = '__new'

/**
 * The app's top bar: the project switcher sits next to the name and decides what the whole app shows.
 * Platform controls (PRO badge, text size, profile menu) come from ProShell so they stay consistent.
 */
export function TopBar({ projects, current, platform, onSwitch, onManage, onNew }: {
  projects: Project[]
  /** Project id, or ALL_PROJECTS. */
  current: string
  platform: { proBadge: ReactNode; textSizeToggle: ReactNode; profileMenu: ReactNode }
  onSwitch: (project: string) => void
  onManage: () => void
  onNew: () => void
}) {
  const own = projects.filter((p) => p.is_owner)
  const shared = projects.filter((p) => !p.is_owner)
  const selected = projects.find((p) => p.id === current)

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--paper)]/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-2 px-4 py-2.5 lg:px-6">
        <span className="display-font shrink-0 text-lg font-bold text-[var(--ink)]">Leads</span>
        <select
          aria-label="Current project"
          value={current}
          onChange={(e) => (e.target.value === NEW_PROJECT ? onNew() : onSwitch(e.target.value))}
          className="min-w-0 flex-1 rounded-xl border border-[var(--line)] bg-[var(--glass)] px-2 py-1.5 text-sm font-semibold text-[var(--ink)] outline-none sm:flex-none sm:max-w-64"
        >
          {own.length > 0 && (
            <optgroup label="Your projects">
              {own.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </optgroup>
          )}
          {shared.length > 0 && (
            <optgroup label="Shared with me">
              {shared.map((p) => <option key={p.id} value={p.id}>{p.name}{p.owner_name ? ` · ${p.owner_name}` : ''}</option>)}
            </optgroup>
          )}
          <option value={ALL_PROJECTS}>All projects</option>
          <option value={NEW_PROJECT}>+ New project…</option>
        </select>
        {selected && (
          <button type="button" onClick={onManage} title={`Manage ${selected.name}`} className="shrink-0 rounded-xl border border-[var(--line-strong)] px-2.5 py-1.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--line)]">
            <span className="hidden sm:inline">Manage</span>
            <span aria-hidden="true" className="sm:hidden">⚙</span>
            <span className="sr-only sm:hidden">Manage project</span>
          </button>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {platform.proBadge}
          {platform.textSizeToggle}
          {platform.profileMenu}
        </div>
      </div>
    </header>
  )
}
