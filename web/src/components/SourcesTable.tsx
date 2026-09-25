import type { Source } from '../types'
import { ExternalLink } from './ExternalLink'

/** Per-source performance. Clicking a row opens the source; the No source row lists leads without one. */
export function SourcesTable({ sources, noSource, onOpen, onEdit }: {
  sources: Source[]
  /** Leads that have no source — shown as a final row so the counts add up to the total. */
  noSource: number
  onOpen: (sourceId: string) => void
  onEdit: (source: Source) => void
}) {
  const num = 'px-4 py-3 text-right tabular-nums'
  const card = 'cursor-pointer rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] px-4 py-3 text-sm'
  return (
    <>
      {/* Phones: one card per source; the card opens the source, its link opens the group itself. */}
      <ul className="space-y-2 sm:hidden">
        {sources.map((s) => (
          <li key={s.id} onClick={() => onOpen(s.id)} className={card}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="break-words font-semibold text-[var(--ink)]">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {s.kind}
                  {s.url && <> · <span onClick={(e) => e.stopPropagation()}><ExternalLink href={s.url}>Open group</ExternalLink></span></>}
                  {s.needs_attention > 0 && <span className="ml-2 font-semibold text-[var(--warning)]">{s.needs_attention} need attention</span>}
                </div>
              </div>
              <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(s) }} className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]">Edit</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
              <span><strong className="tabular-nums text-[var(--ink)]">{s.leads}</strong> leads</span>
              <span><strong className="tabular-nums text-[var(--ink)]">{s.contacted}</strong> contacted</span>
              <span><strong className="tabular-nums text-[var(--ink)]">{s.replied}</strong> replied</span>
              <span><strong className="tabular-nums text-[var(--ink)]">{s.reply_rate_pct == null ? '—' : `${s.reply_rate_pct}%`}</strong> reply rate</span>
              <span><strong className="tabular-nums text-[var(--ink)]">{s.won}</strong> won</span>
            </div>
          </li>
        ))}
        <li onClick={() => onOpen('none')} className={`${card} flex justify-between italic text-[var(--muted)]`}>
          <span>No source</span>
          <span className="font-semibold not-italic tabular-nums text-[var(--ink)]">{noSource} leads</span>
        </li>
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] sm:block">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wider text-[var(--muted)]">
            <tr className="border-b border-[var(--line)]">
              <th className="px-4 py-3 font-semibold">Source</th>
              <th className="px-4 py-3 text-right font-semibold">Leads</th>
              <th className="px-4 py-3 text-right font-semibold">Contacted</th>
              <th className="px-4 py-3 text-right font-semibold">Replied</th>
              <th className="px-4 py-3 text-right font-semibold">Reply rate</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">Qualified</th>
              <th className="px-4 py-3 text-right font-semibold">Won</th>
              <th className="hidden px-4 py-3 text-right font-semibold sm:table-cell">High fit</th>
              <th className="hidden px-4 py-3 font-semibold md:table-cell">Last found</th>
              <th className="px-4 py-3"><span className="sr-only">Edit</span></th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--panel-hover)]">
                <td className="px-4 py-3">
                  <div className="font-semibold text-[var(--ink)]">
                    {s.url ? <span onClick={(e) => e.stopPropagation()}><ExternalLink href={s.url}>{s.name}</ExternalLink></span> : s.name}
                  </div>
                  <div className="text-xs text-[var(--muted)]">
                    {s.kind}
                    {s.needs_attention > 0 && <span className="ml-2 font-semibold text-[var(--warning)]">{s.needs_attention} need attention</span>}
                  </div>
                </td>
                <td className={`${num} font-semibold text-[var(--ink)]`}>{s.leads}</td>
                <td className={num}>{s.contacted}</td>
                <td className={num}>{s.replied}</td>
                <td className={`${num} font-semibold text-[var(--ink)]`}>{s.reply_rate_pct == null ? '—' : `${s.reply_rate_pct}%`}</td>
                <td className={`hidden sm:table-cell ${num}`}>{s.qualified}</td>
                <td className={num}>{s.won}</td>
                <td className={`hidden sm:table-cell ${num}`}>{s.high_fit}</td>
                <td className="hidden px-4 py-3 text-xs text-[var(--muted)] md:table-cell">{s.last_found_at ? new Date(s.last_found_at).toLocaleDateString() : '—'}</td>
                <td className="px-4 py-3 text-right">
                  <button type="button" onClick={(e) => { e.stopPropagation(); onEdit(s) }} className="rounded-lg px-2 py-1 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--line)] hover:text-[var(--ink)]">Edit</button>
                </td>
              </tr>
            ))}
            <tr onClick={() => onOpen('none')} className="cursor-pointer hover:bg-[var(--panel-hover)]">
              <td className="px-4 py-3 italic text-[var(--muted)]">No source</td>
              <td className={`${num} font-semibold text-[var(--ink)]`}>{noSource}</td>
              <td colSpan={8} />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  )
}
