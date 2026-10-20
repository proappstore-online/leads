import { useState } from 'react'
import { endOfToday, timeText, toInputValue } from '../lib/lead'
import { STATUSES, type Lead, type LeadList, type Project, type ProjectMember } from '../types'
import { inputClass, wrapAnywhere } from './styles'

/** Saves one change without closing the lead; resolves false when it was refused or failed. */
export type SaveInPlace = (action: string, params: Record<string, unknown>, refused: string) => Promise<boolean>

/**
 * The changes an open lead saves at once, outside its form: the attention flag, the assignment (or,
 * for a lead shared with you, its status) and the follow-up. `lead` is the latest server snapshot.
 */
export function LeadPanel({ lead, lists, members, userId, shared, sharedIn, saving, onSave }: {
  lead: Lead
  lists: LeadList[]
  /** Members of your projects — the people a lead can be assigned to. */
  members: ProjectMember[]
  userId: string
  /** Someone else's lead assigned to you: status, flag and new messages only. */
  shared: boolean
  /** The project it is shared with you in, when known. */
  sharedIn: Project | undefined
  saving: boolean
  onSave: SaveInPlace
}) {
  const [attentionReason, setAttentionReason] = useState('')
  const [followAt, setFollowAt] = useState(lead.next_action_at ? toInputValue(lead.next_action_at) : '')
  const [followAction, setFollowAction] = useState(lead.next_action ?? '')
  // A fresh snapshot (after any save here) replaces the follow-up inputs with what was stored.
  const [shown, setShown] = useState(lead)
  if (shown !== lead) {
    setShown(lead)
    setFollowAt(lead.next_action_at ? toInputValue(lead.next_action_at) : '')
    setFollowAction(lead.next_action ?? '')
  }
  const attention = { on: Boolean(lead.needs_attention), reason: lead.attention_reason, at: lead.attention_at }
  const assignee = lead.assigned_to_user_id
  const followUp = { at: lead.next_action_at, action: lead.next_action }
  // A lead can be assigned to members of the projects its lists belong to.
  const memberOf = lead.list_ids?.split(',') ?? []
  const leadProjects = new Set(memberOf.map((id) => lists.find((l) => l.id === id)?.project_id).filter(Boolean))
  const assignable = [...new Map(members.filter((m) => leadProjects.has(m.project_id)).map((m) => [m.user_id, m])).values()]

  const setFlag = (action: 'flag_needs_attention' | 'clear_needs_attention') =>
    onSave(action, action === 'flag_needs_attention' ? { reason: attentionReason.trim() } : {}, 'Not saved - this lead may have been deleted.')
      .then((saved) => { if (saved) setAttentionReason('') })

  return (
    <>
      {attention.on ? (
        <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-[var(--warning)] bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-4 py-3">
          <div className="min-w-0 select-text">
            <div className="text-xs font-bold uppercase tracking-wider text-[var(--warning)]">
              Needs attention{attention.at ? ` · ${timeText(attention.at)}` : ''}
            </div>
            <p className={`mt-1 whitespace-pre-wrap text-sm text-[var(--ink)] ${wrapAnywhere}`}>{attention.reason}</p>
          </div>
          {!shared && <button type="button" disabled={saving} onClick={() => setFlag('clear_needs_attention')} className="shrink-0 rounded-xl bg-[var(--warning)] px-3 py-2 text-sm font-semibold text-[var(--paper)] disabled:opacity-60">Mark handled</button>}
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <input type="text" aria-label="Why this lead needs attention" value={attentionReason} onChange={(e) => setAttentionReason(e.target.value)} placeholder="Flag as needs attention — say why" className={`${inputClass} mt-0`} />
          <button type="button" disabled={saving || !attentionReason.trim()} onClick={() => setFlag('flag_needs_attention')} className="shrink-0 rounded-xl border border-[var(--warning)] px-3 py-2 text-sm font-semibold text-[var(--warning)] disabled:opacity-40">Flag</button>
        </div>
      )}
      {shared ? (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className={`text-[var(--muted)] ${wrapAnywhere}`}>Assigned to you{sharedIn ? ` in ${sharedIn.name}, shared by ${sharedIn.owner_name ?? 'its owner'}` : ' in a shared project'}</span>
          <select aria-label="Status" value={lead.status} disabled={saving} onChange={(e) => onSave('set_lead_status', { status: e.target.value }, 'Not saved - this lead is no longer assigned to you.')} className={`${inputClass} mt-0 w-auto capitalize`}>
            {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      ) : (
        <label className="mt-3 flex items-center gap-3 text-sm">
          <span className="shrink-0 font-medium text-[var(--ink)]">Assigned to</span>
          <select
            value={assignee === userId ? 'me' : assignee ?? ''}
            disabled={saving}
            onChange={(e) => onSave('assign_lead', { user_id: e.target.value || null }, 'Not saved - that person is not a member of a project this lead\'s lists belong to.')}
            className={`${inputClass} mt-0`}
          >
            <option value="">Nobody</option>
            <option value="me">Me</option>
            {assignable.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name ?? 'Unnamed member'}</option>)}
            {assignee && assignee !== userId && !assignable.some((m) => m.user_id === assignee) && (
              <option value={assignee}>{members.find((m) => m.user_id === assignee)?.display_name ?? 'Former member'} (not in this lead's projects)</option>
            )}
          </select>
        </label>
      )}
      {!shared && leadProjects.size === 0 && <p className="mt-1 text-xs text-[var(--muted)]">To assign this lead to someone else, put it in a list of a project they joined.</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="shrink-0 font-medium text-[var(--ink)]">
          Follow up
          {followUp.at !== null && followUp.at <= endOfToday() && <span className="ml-2 rounded-full bg-[var(--warning)] px-2 py-0.5 text-xs font-bold text-[var(--paper)]">{followUp.at <= Date.now() ? 'Due' : 'Today'}</span>}
        </span>
        {/* Phones: date and next action on their own lines, Save and Clear below. */}
        <input type="datetime-local" aria-label="Follow-up date" value={followAt} onChange={(e) => setFollowAt(e.target.value)} className={`${inputClass} mt-0 sm:w-auto`} />
        <input type="text" aria-label="Next action" value={followAction} onChange={(e) => setFollowAction(e.target.value)} placeholder="Next action, e.g. call about the demo" className={`${inputClass} mt-0 min-w-0 basis-full sm:flex-1 sm:basis-48`} />
        <button type="button" disabled={saving || !followAt} onClick={() => onSave('set_follow_up', { at: new Date(followAt).getTime(), action: followAction.trim() || null }, 'Not saved - this lead is no longer yours to work.')} className="rounded-xl border border-[var(--line-strong)] px-3 py-2 font-semibold text-[var(--ink)] disabled:opacity-40">Save</button>
        {followUp.at !== null && <button type="button" disabled={saving} onClick={() => onSave('set_follow_up', {}, 'Not saved - this lead is no longer yours to work.')} className="rounded-xl px-3 py-2 font-semibold text-[var(--muted)] hover:bg-[var(--line)]">Clear</button>}
      </div>
    </>
  )
}
