import { useState } from 'react'
import { isDue, leadTags } from '../lib/lead'
import { STATUSES, type Lead } from '../types'

const date = (ms: number) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

/**
 * Leads as a Kanban board, one column per status. Drag a card to another column (mouse), or use its
 * Move picker (touch, keyboard) — both change the status.
 */
export function LeadBoard({ leads, people, onOpen, onMove }: {
  leads: Lead[]
  /** Name to show for each user id a lead can be assigned to. */
  people: Map<string, string>
  onOpen: (lead: Lead) => void
  onMove: (lead: Lead, status: string) => void
}) {
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)

  function drop(status: string, id: string) {
    const lead = leads.find((l) => l.id === id)
    if (lead && lead.status !== status) onMove(lead, status)
    setDragging(null)
    setOver(null)
  }

  return (
    <div className="-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-2 lg:mx-0 lg:snap-none lg:px-0 xl:grid xl:grid-cols-6 xl:gap-2 xl:overflow-visible xl:pb-0">
      {STATUSES.map((status) => {
        const column = leads.filter((l) => l.status === status)
        return (
          <section
            key={status}
            aria-label={`${status}, ${column.length} leads`}
            onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(status) } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOver(null) }}
            onDrop={(e) => { e.preventDefault(); drop(status, e.dataTransfer.getData('text/plain')) }}
            className={`flex w-[82vw] max-w-72 shrink-0 snap-start flex-col rounded-2xl border bg-[var(--panel-strong)] sm:w-64 xl:w-auto xl:min-w-0 xl:max-w-none ${over === status ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--line)]'}`}
          >
            <h2 className="flex items-center justify-between gap-1 px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <span className="truncate capitalize">{status}</span>
              <span className="rounded-full bg-[var(--line)] px-2 py-0.5 text-[var(--ink)]">{column.length}</span>
            </h2>
            <ul className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {column.map((lead) => (
                <li
                  key={lead.id}
                  draggable
                  onDragStart={(e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; setDragging(lead.id) }}
                  onDragEnd={() => { setDragging(null); setOver(null) }}
                  onClick={() => onOpen(lead)}
                  className={`cursor-grab rounded-xl border bg-[var(--paper)] px-3 py-2.5 text-sm shadow-[var(--shadow-card)] active:cursor-grabbing ${dragging === lead.id ? 'opacity-40' : ''} ${lead.needs_attention ? 'border-[var(--warning)]' : 'border-[var(--line)]'}`}
                >
                  <div className="font-semibold text-[var(--ink)] [overflow-wrap:anywhere]">{lead.name}</div>
                  {lead.needs_attention ? <div className="text-xs font-semibold text-[var(--warning)]">Needs attention</div> : null}
                  {(lead.title || lead.company) && <div className="truncate text-xs text-[var(--muted)]">{[lead.title, lead.company].filter(Boolean).join(' · ')}</div>}
                  {lead.tags && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {leadTags(lead).map((t) => <span key={t} className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent-deep)]">#{t}</span>)}
                    </div>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted)]">
                    {lead.fit && <span className={`font-semibold capitalize ${lead.fit === 'high' ? 'text-[var(--success)]' : ''}`}>{lead.fit} fit</span>}
                    {lead.next_action_at && <span className={isDue(lead) ? 'font-semibold text-[var(--warning)]' : undefined}>{isDue(lead) ? 'Due ' : 'Follow up '}{date(lead.next_action_at)}</span>}
                    {lead.assigned_to_user_id && <span>→ {people.get(lead.assigned_to_user_id) ?? 'Former member'}</span>}
                  </div>
                  <select
                    aria-label={`Move ${lead.name}`}
                    value={lead.status}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => onMove(lead, e.target.value)}
                    className="mt-2 w-full rounded-lg border border-[var(--line)] bg-[var(--glass)] px-2 py-1.5 text-xs capitalize text-[var(--ink)] outline-none"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s === lead.status ? `In ${s}` : `Move to ${s}`}</option>)}
                  </select>
                </li>
              ))}
              {column.length === 0 && <li className="rounded-xl border border-dashed border-[var(--line-strong)] px-3 py-4 text-center text-xs text-[var(--muted)]">Drop a lead here</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
