import { useRef, useState } from 'react'
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

  // One identity for the lifetime of this form, including retries: a save whose response was lost
  // is finished by the retry, never repeated as a second list or project (#70).
  const [id] = useState(() => list?.id ?? crypto.randomUUID())
  const [newProjectId] = useState(() => crypto.randomUUID())
  const pendingSave = useRef<{ request_id: string; payload: string } | null>(null)

  function save(e: React.FormEvent) {
    e.preventDefault()
    const addingProject = projectId === NEW_PROJECT
    const target = addingProject ? newProjectId : projectId
    const fields = { id, name: name.trim(), purpose: purpose.trim() || null }
    if (!list) {
      // A new list (and its new project) is one transaction with a receipt: the same request is replayed until confirmed.
      const payload = JSON.stringify({ ...fields, project_id: target, new_project: addingProject ? { name: newProject.trim(), owner_name: ownerName || null } : null })
      if (pendingSave.current?.payload !== payload) pendingSave.current = { request_id: crypto.randomUUID(), payload }
      const request = pendingSave.current
      run(async () => {
        try {
          await x('save_list_form', request)
        } catch {
          throw new Error('Save could not be confirmed. Retry with the same values to safely finish. If it is still refused, close and reopen the form - the project may no longer exist.')
        }
        onSaved(id)
      })
      return
    }
    run(async () => {
      if (addingProject) {
        // Replaying the same id and name confirms a project already added by an earlier attempt.
        const { changes } = await x('create_project', { id: target, name: newProject.trim(), owner_name: ownerName || null })
        if (changes === 0) throw new Error('Not saved - a project was already added from this form under another name. Close and reopen the list to move it there.')
      }
      const { changes } = await x('update_list', { ...fields, project_id: projectOf(list) })
      if (changes === 0) throw new Error('Not saved - this list was moved or deleted. Close and reopen it.')
      if (target && target !== list.project_id) await x('set_list_project', { id, project_id: projectOf(list), to_project_id: target })
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
