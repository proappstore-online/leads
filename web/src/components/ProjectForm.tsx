import { useCallback, useEffect, useState } from 'react'
import { q, x } from '../lib/actions'
import type { Project, ProjectMember } from '../types'
import { Modal } from './Modal'
import { inputClass } from './styles'

interface Invite {
  code: string
  expires_at: number
}

const inviteLink = (code: string) => `${location.origin}/?join=${code}`

/** Create or manage a project: name, members and invite links. A project you joined only offers Leave. */
export function ProjectForm({ project, ownerName, onClose, onSaved, onDeleted, onChanged }: {
  project: Project | null
  /** Your name, shown to the people you invite. */
  ownerName: string
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: () => void
  /** Members changed while the modal stays open — the parent reloads names and assignments. */
  onChanged: () => void
}) {
  const [name, setName] = useState(project?.name ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [members, setMembers] = useState<ProjectMember[]>([])
  const [invites, setInvites] = useState<Invite[]>([])
  const [copied, setCopied] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const owned = !project || project.is_owner === 1

  const loadTeam = useCallback(async () => {
    if (!project?.is_owner) return
    const [m, i] = await Promise.all([
      q<ProjectMember>('list_project_members', { project_id: project.id }),
      q<Invite>('list_project_invites', { project_id: project.id }),
    ])
    setMembers(m)
    setInvites(i)
  }, [project])

  useEffect(() => {
    loadTeam().catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [loadTeam])

  async function run(task: () => Promise<void>) {
    setSaving(true)
    try {
      await task()
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault()
    const id = project?.id ?? crypto.randomUUID()
    run(async () => {
      const fields = { id, name: name.trim(), description: description.trim() || null }
      await x(project ? 'update_project' : 'create_project', project ? fields : { ...fields, owner_name: ownerName || null })
      onSaved(id)
    })
  }

  function remove() {
    if (!project || !confirm(`Delete the project "${project.name}"? Its lists and leads stay; its members lose access.`)) return
    run(async () => {
      await x('delete_project', { id: project.id })
      onDeleted()
    })
  }

  function leave() {
    if (!project || !confirm(`Leave "${project.name}"? You will no longer see the leads assigned to you there.`)) return
    run(async () => {
      await x('leave_project', { project_id: project.id })
      onDeleted()
    })
  }

  const invite = () => run(async () => {
    await x('create_project_invite', { project_id: project!.id })
    await loadTeam()
  })

  const revoke = (code: string) => run(async () => {
    await x('revoke_project_invite', { code })
    await loadTeam()
  })

  function removeMember(m: ProjectMember) {
    if (!confirm(`Remove ${m.display_name ?? 'this member'} from the project? Leads assigned to them here are unassigned.`)) return
    run(async () => {
      await x('remove_project_member', { project_id: m.project_id, user_id: m.user_id })
      await loadTeam()
      onChanged()
    })
  }

  async function copy(code: string) {
    await navigator.clipboard.writeText(inviteLink(code))
    setCopied(code)
  }

  if (!owned && project) {
    return (
      <Modal title={project.name} onClose={onClose}>
        <div className="mt-4 space-y-4 text-sm text-[var(--ink)]">
          <p className="select-text">Shared with you by {project.owner_name ?? 'its owner'}. You see the leads assigned to you here under Assigned to me.</p>
          {project.description && <p className="select-text text-[var(--muted)]">{project.description}</p>}
          {error && <p className="text-[var(--error)]">{error}</p>}
          <div className="flex justify-end">
            <button type="button" onClick={leave} disabled={saving} className="rounded-xl px-3 py-2 font-semibold text-[var(--error)] hover:bg-[var(--line)]">Leave project</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title={project ? 'Project' : 'New project'} onClose={onClose}>
      <form onSubmit={save} className="mt-4 space-y-4">
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Name</span>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Client, initiative…" required autoFocus={!project} className={inputClass} />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-[var(--ink)]">Description</span>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this project for?" className={inputClass} />
        </label>
        <div className="flex justify-end">
          <button type="submit" disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Save</button>
        </div>
      </form>

      {project && (
        <div className="mt-2 space-y-5 border-t border-[var(--line)] pt-4">
          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Members</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Members see only the leads you assign to them. They can record messages, change the status and flag a lead for you — not edit or delete it.</p>
            {members.length === 0 ? (
              <p className="mt-2 text-sm text-[var(--muted)]">Nobody has joined yet.</p>
            ) : (
              <ul className="mt-2 divide-y divide-[var(--line)] rounded-xl border border-[var(--line)]">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold text-[var(--ink)]">{m.display_name ?? 'Unnamed member'}</span>
                    <button type="button" onClick={() => removeMember(m)} disabled={saving} className="shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-[var(--error)] hover:bg-[var(--line)]">Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Invite links</h3>
            <p className="mt-1 text-xs text-[var(--muted)]">Each link lets one person join and expires after 7 days. Send it only to the person you mean to add.</p>
            <ul className="mt-2 space-y-2">
              {invites.map((i) => (
                <li key={i.code} className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-xs">
                  <span className="min-w-0 flex-1 select-text break-all text-[var(--ink)]">{inviteLink(i.code)}</span>
                  <span className="text-[var(--muted)]">until {new Date(i.expires_at).toLocaleDateString()}</span>
                  <button type="button" onClick={() => copy(i.code)} className="rounded-lg px-2 py-1 font-semibold text-[var(--accent)] hover:bg-[var(--line)]">{copied === i.code ? 'Copied' : 'Copy'}</button>
                  <button type="button" onClick={() => revoke(i.code)} disabled={saving} className="rounded-lg px-2 py-1 font-semibold text-[var(--muted)] hover:bg-[var(--line)]">Cancel</button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={invite} disabled={saving} className="mt-2 rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)] disabled:opacity-60">Create invite link</button>
          </section>
        </div>
      )}

      {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
      {project && (
        <div className="mt-4 border-t border-[var(--line)] pt-4">
          <button type="button" onClick={remove} disabled={saving} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--error)] hover:bg-[var(--line)]">Delete project</button>
        </div>
      )}
    </Modal>
  )
}
