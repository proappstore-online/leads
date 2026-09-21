import { useState } from 'react'
import { x } from '../lib/actions'
import { SOURCE_KINDS, type Source } from '../types'
import { Modal } from './Modal'
import { inputClass } from './styles'

export function SourceForm({ source, onClose, onSaved, onDeleted }: {
  source: Source | null
  onClose: () => void
  onSaved: () => void
  onDeleted: () => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [kind, setKind] = useState(source?.kind ?? 'Facebook group')
  const [url, setUrl] = useState(source?.url ?? '')
  const [notes, setNotes] = useState(source?.notes ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function run(task: () => Promise<void>) {
    setSaving(true)
    try {
      await task()
      onSaved()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    if (url.trim() && !/^https:\/\/\S+$/i.test(url.trim())) {
      setError('Link must be a full https:// link to the group, page or event.')
      return
    }
    // update_source treats '' as "clear"; create_source treats it as "none".
    const fields = { name: name.trim(), kind, url: url.trim(), notes: notes.trim() }
    run(async () => {
      const { changes } = source
        ? await x('update_source', { id: source.id, ...fields })
        : await x('create_source', { id: crypto.randomUUID(), ...fields })
      if (changes === 0) throw new Error('Not saved. Another source already has this name or link.')
    })
  }

  function remove() {
    if (!source || !confirm(`Delete the source "${source.name}"? Its ${source.leads} leads stay, with no source.`)) return
    run(() => x('delete_source', { id: source.id }).then(onDeleted))
  }

  return (
    <Modal title={source ? 'Edit source' : 'New source'} onClose={onClose}>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jobs in Melbourne" required autoFocus className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Kind</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputClass}>
            {SOURCE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Link</span>
          <input type="text" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.facebook.com/groups/…" className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Size, rules, who runs it" className={`${inputClass} resize-none`} />
        </label>
        {error && <p className="text-sm text-[var(--error)]">{error}</p>}
        <div className="flex items-center justify-between pt-2">
          {source ? (
            <button type="button" onClick={remove} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--line)]">Delete source</button>
          ) : <span />}
          <button type="submit" disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Save</button>
        </div>
      </form>
    </Modal>
  )
}
