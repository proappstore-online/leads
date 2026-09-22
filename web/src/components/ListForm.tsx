import { useState } from 'react'
import { x } from '../lib/actions'
import { projectOf } from '../lib/lead'
import type { LeadList, Project } from '../types'
import { Modal } from './Modal'
import { inputClass } from './styles'

const NEW_PROJECT = '__new'

/** Create or edit a list. Every list is in a project — pick one, or name a new one right here. */
export function ListForm({ list, projects, defaultProjectId, ownerName, onClose, onSaved, onDeleted }: {
  list: LeadList | null
  /** Your own projects. */
  projects: Project[]
  /** Project being browsed when "New list" was pressed — preselected for a new list. */
  defaultProjectId: string | null
  /** Your name, stored on a project created here (members see it). */
  ownerName: string
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState(list?.name ?? '')
  const [purpose, setPurpose] = useState(list?.purpose ?? '')
  // A list from before projects starts with '' (no project) until it is moved into one.
  const [projectId, setProjectId] = useState(list ? list.project_id ?? '' : defaultProjectId ?? projects[0]?.id ?? NEW_PROJECT)
  const [newProject, setNewProject] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function run(task: () => Promise<void>) {
    setSaving(true)
    try {
      await task()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const id = list?.id ?? crypto.randomUUID()
    run(async () => {
      let target = projectId
      if (target === NEW_PROJECT) {
        target = crypto.randomUUID()
        await x('create_project', { id: target, name: newProject.trim(), owner_name: ownerName || null })
      }
      const fields = { id, name: name.trim(), purpose: purpose.trim() || null }
      if (list) {
        const { changes } = await x('update_list', { ...fields, project_id: projectOf(list) })
        if (changes === 0) throw new Error('Not saved - this list was moved or deleted. Close and reopen it.')
        if (target && target !== list.project_id) await x('set_list_project', { id, project_id: projectOf(list), to_project_id: target })
      } else {
        const { changes } = await x('create_list', { ...fields, project_id: target })
        if (changes === 0) throw new Error('Not saved - that project no longer exists.')
      }
      onSaved(id)
    })
  }

  function remove() {
    if (!list || !confirm(`Delete the list "${list.name}"? Its leads stay in your database.`)) return
    run(async () => {
      await x('delete_list', { id: list.id, project_id: projectOf(list) })
      onDeleted(list.id)
    })
  }

  return (
    <Modal title={list ? 'Edit list' : 'New list'} onClose={onClose}>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Investors, Podcast guests, Hiring…" required autoFocus className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Purpose</span>
          <input type="text" value={purpose} onChange={(e) => setPurpose(e.target.value)} placeholder="What is this list for?" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Project</span>
          <select value={projectId} onChange={(e) => setProjectId(e.target.value)} required className={inputClass}>
            {list && !list.project_id && <option value="">Not in a project yet — choose one</option>}
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value={NEW_PROJECT}>+ New project…</option>
          </select>
          {list && !list.project_id && <span className="mt-1 block text-xs text-[var(--muted)]">This list is from before projects. Every list now belongs to one - choose it here.</span>}
        </label>
        {projectId === NEW_PROJECT && (
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">New project name</span>
            <input type="text" value={newProject} onChange={(e) => setNewProject(e.target.value)} placeholder="Client, initiative…" required className={inputClass} />
          </label>
        )}
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          {list ? (
            <button type="button" onClick={remove} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--line)]">Delete list</button>
          ) : <span />}
          <button type="submit" disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Save</button>
        </div>
      </form>
    </Modal>
  )
}
