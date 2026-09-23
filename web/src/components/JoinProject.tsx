import { useEffect, useState } from 'react'
import { q, x } from '../lib/actions'
import { Modal } from './Modal'

interface Invite {
  project_id: string
  project_name: string
  owner_name: string | null
  is_owner: number
  is_member: number
}

/** Opened from an invite link (?join=<code>): shows whose project it is and joins it on confirm. */
export function JoinProject({ code, userName, onClose, onJoined }: {
  code: string
  /** Your name, shown to the project owner. */
  userName: string
  onClose: () => void
  /** The project just joined — the app switches to it. */
  onJoined: (projectId: string) => void
}) {
  const [invite, setInvite] = useState<Invite | null | undefined>(undefined)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    q<Invite>('get_project_invite', { code })
      .then((rows) => setInvite(rows[0] ?? null))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [code])

  async function join() {
    setSaving(true)
    try {
      await x('join_project', { code, display_name: userName || null })
      onJoined(invite!.project_id)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setSaving(false)
    }
  }

  const message = invite === undefined
    ? (error ? '' : 'Checking the invite…')
    : invite === null
      ? 'This invite link is not valid any more — it was used, cancelled or has expired. Ask for a new one.'
      : invite.is_owner
        ? `This is an invite to your own project "${invite.project_name}". Send it to the person you want to add.`
        : invite.is_member
          ? `You are already a member of "${invite.project_name}".`
          : `${invite.owner_name ?? 'Someone'} invited you to the project "${invite.project_name}". Once you join, the leads they assign to you appear under Assigned to me. They will see your name${userName ? ` (${userName})` : ''}.`

  const canJoin = invite && !invite.is_owner && !invite.is_member

  return (
    <Modal title="Join a project" onClose={onClose}>
      <p className="mt-4 select-text text-sm text-[var(--ink)]">{message}</p>
      {error && <p className="mt-4 text-sm text-[var(--error)]">{error}</p>}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onClose} aria-label={canJoin ? 'Not now' : 'Close'} className="rounded-xl px-4 py-2 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--line)]">{canJoin ? 'Not now' : 'Close'}</button>
        {canJoin && <button type="button" onClick={join} disabled={saving} className="rounded-xl bg-[var(--accent)] px-5 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Join project</button>}
      </div>
    </Modal>
  )
}
