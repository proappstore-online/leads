import type { ReactNode } from 'react'

/** Turns transport errors into guidance a person can act on without exposing server internals. */
export function explainError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/\b(401|unauthenticated|unauthorized|session (?:has )?expired|sign[ -]?in)\b/i.test(message)) return 'Your session has expired. Sign in again, then retry.'
  if (/\b(403|forbidden|not allowed|permission|access denied)\b/i.test(message)) return 'You do not have permission to see or change this data. Check that you are in the right project.'
  if (/\b(400|422|invalid|validation|required|malformed)\b/i.test(message)) return 'That request was not accepted. Check the information and try again.'
  return 'Leads could not reach the service. Check your connection and try again.'
}

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return <p role="status" className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-8 text-center text-sm text-[var(--muted)]">{label}</p>
}

export function EmptyState({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="rounded-2xl border border-dashed border-[var(--line-strong)] px-6 py-8 text-center text-sm text-[var(--muted)]">{children}{action && <div className="mt-3">{action}</div>}</div>
}

export function RetryState({ error, onRetry, onSignOut }: { error: unknown; onRetry: () => void; onSignOut?: () => void }) {
  return (
    <section role="alert" className="rounded-2xl border border-[var(--error)]/35 bg-[var(--panel-strong)] px-5 py-4 text-sm text-[var(--ink)]">
      <p>{explainError(error)}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onRetry} className="rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-[var(--paper)]">Try again</button>
        {onSignOut && <button type="button" onClick={onSignOut} className="rounded-xl border border-[var(--line-strong)] px-4 py-2 text-sm font-semibold text-[var(--ink)]">Sign out</button>}
      </div>
    </section>
  )
}
