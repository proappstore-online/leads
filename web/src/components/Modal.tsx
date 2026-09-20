import type { ReactNode } from 'react'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[var(--shadow-soft)] sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-center justify-between">
          <h2 className="display-font text-xl font-bold text-[var(--ink)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg px-2 py-1 text-lg text-[var(--muted)] hover:bg-[var(--line)]">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
