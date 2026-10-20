import type { Source, SourceSort } from '../types'
import { EmptyState, LoadingState, RetryState } from './AsyncState'
import { SourcesTable } from './SourcesTable'

/** The Sources page: where leads are found and how each place performs. Home owns the loading. */
export function SourcesView({ sources, noSource, sort, onSort, loading, error, onRetry, onAdd, onOpen, onEdit }: {
  sources: Source[]
  /** Leads with no source, shown as their own row. */
  noSource: number
  sort: SourceSort
  onSort: (sort: SourceSort) => void
  loading: boolean
  error: string
  onRetry: () => void
  onAdd: () => void
  /** A source id, or 'none' for the leads without one. */
  onOpen: (id: string) => void
  onEdit: (source: Source) => void
}) {
  return (
    <main id="main-content" className="min-w-0 flex-1">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Sources</h1>
          <p className="mt-0.5 text-sm text-[var(--muted)]">Where leads are found and how each place performs. Click a source for its details and leads.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select aria-label="Sort sources" value={sort} onChange={(e) => onSort(e.target.value as SourceSort)} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--ink)] outline-none">
            <option value="leads">Most leads</option>
            <option value="reply_rate">Best reply rate</option>
            <option value="won">Most won</option>
            <option value="high_fit">Most high fit</option>
            <option value="last_found">Recently found</option>
            <option value="name">Name</option>
          </select>
          <button type="button" onClick={onAdd} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)]">Add source</button>
        </div>
      </div>
      <div className="mt-4">
        {error ? <RetryState error={error} onRetry={onRetry} />
          : loading ? <LoadingState label="Loading sources…" />
            : sources.length === 0 && noSource === 0 ? <EmptyState action={<button type="button" onClick={onAdd} className="rounded-xl bg-[var(--accent)] px-4 py-2 font-semibold text-[var(--paper)]">Add source</button>}>No sources yet. Add the places where you find leads.</EmptyState>
              : <SourcesTable sources={sources} noSource={noSource} onOpen={onOpen} onEdit={onEdit} />}
      </div>
    </main>
  )
}
