import { useState } from 'react'
import { x } from '../lib/actions'
import type { LeadList, Project } from '../types'
import { Modal } from './Modal'
import { inputClass } from './styles'


export function ListForm({ list, projects, defaultProjectId, onClose, onSaved, onDeleted }: {
  list: LeadList | null
  /** Your own projects — a list can belong to one. */
  projects: Project[]
  /** Project being browsed when "New list" was pressed — preselected for a new list. */
  defaultProjectId: string | null
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState(list?.name ?? '')
  const [purpose, setPurpose] = useState(list?.purpose ?? '')
  const [projectId, setProjectId] = useState(list ? list.project_id ?? '' : defaultProjectId ?? '')
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
      const fields = { id, name: name.trim(), purpose: purpose.trim() || null }
      if (list) {
        await x('update_list', fields)
        if (projectId !== (list.project_id ?? '')) await x('set_list_project', { id, project_id: projectId || null })
      } else {
        await x('create_list', { ...fields, project_id: projectId || null })
      }
      onSaved(id)
    })
  }

  function remove() {
    if (!list || !confirm(`Delete the list "${list.name}"? Its leads stay in your database.`)) return
    run(async () => {
      await x('delete_list', { id: list.id })
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
        {projects.length > 0 && (
          <label className="block">
            <span className="text-sm font-medium text-[var(--ink)]">Project</span>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)} className={inputClass}>
              <option value="">No project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
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
