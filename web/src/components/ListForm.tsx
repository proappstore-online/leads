import { useState } from 'react'
import { x } from '../lib/actions'
import type { LeadList } from '../types'
import { Modal } from './Modal'

const inputClass = 'mt-1 w-full rounded-xl border border-[var(--line)] bg-[var(--glass)] px-4 py-2.5 text-sm text-[var(--ink)] outline-none focus:border-[var(--accent)]'

export function ListForm({ list, onClose, onSaved, onDeleted }: {
  list: LeadList | null
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: (id: string) => void
}) {
  const [name, setName] = useState(list?.name ?? '')
  const [purpose, setPurpose] = useState(list?.purpose ?? '')
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
      await x(list ? 'update_list' : 'create_list', { id, name: name.trim(), purpose: purpose.trim() || null })
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
