import type { Source } from '../types'

const linkClass = 'text-[var(--sky-deep)] underline-offset-4 hover:underline'

/** Per-source performance. Clicking a row opens the source; the No source row lists leads without one. */
export function SourcesTable({ sources, noSource, onOpen, onEdit }: {
  sources: Source[]
  /** Leads that have no source — shown as a final row so the counts add up to the total. */
  noSource: number
  onOpen: (sourceId: string) => void
  onEdit: (source: Source) => void
}) {
  const num = 'px-4 py-3 text-right tabular-nums'
  return (
    <div className="overflow-x-auto rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)]">
      <table className="w-full select-text text-left text-sm">
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
            <tr key={s.id} onClick={() => onOpen(s.id)} className="cursor-pointer border-b border-[var(--line)] last:border-0 hover:bg-[var(--glass-hover)]">
              <td className="px-4 py-3">
                <div className="font-semibold text-[var(--ink)]">
                  {s.url ? <a href={s.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className={linkClass}>{s.name}</a> : s.name}
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
          <tr onClick={() => onOpen('none')} className="cursor-pointer hover:bg-[var(--glass-hover)]">
            <td className="px-4 py-3 italic text-[var(--muted)]">No source</td>
            <td className={`${num} font-semibold text-[var(--ink)]`}>{noSource}</td>
            <td colSpan={8} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}
