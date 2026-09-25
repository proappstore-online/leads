import { useEffect, useRef, type ReactNode } from 'react'

/**
 * Open modals, bottom first. There is one history entry per open modal, so the phone's back gesture
 * (and Escape) closes the top modal instead of leaving the app. Entries are reconciled once per tick,
 * so a modal closing while another opens - or React re-mounting one - never leaves history out of step.
 */
const open: (() => void)[] = []
let owned = 0
let ignorePops = 0
let syncQueued = false

function syncHistory() {
  if (syncQueued) return
  syncQueued = true
  setTimeout(() => {
    syncQueued = false
    while (owned < open.length) {
      history.pushState({ modal: true }, '')
      owned++
    }
    if (owned > open.length) {
      ignorePops++
      history.go(open.length - owned)
      owned = open.length
    }
  })
}

window.addEventListener('popstate', () => {
  if (ignorePops > 0) {
    ignorePops--
  } else if (owned > 0) {
    owned--
    open.at(-1)?.()
  }
})

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') open.at(-1)?.()
})

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const onCloseRef = useRef(onClose)
  const dialogRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<HTMLElement | null>(null)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const close = () => onCloseRef.current()
    open.push(close)
    syncHistory()
    document.body.style.overflow = 'hidden'
    const focusDialog = () => {
      const dialog = dialogRef.current
      if (!dialog || dialog.contains(document.activeElement)) return
      dialog.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus()
      if (!dialog.contains(document.activeElement)) dialog.focus()
    }
    const frame = requestAnimationFrame(focusDialog)
    return () => {
      cancelAnimationFrame(frame)
      open.splice(open.indexOf(close), 1)
      syncHistory()
      if (open.length === 0) document.body.style.overflow = ''
      // Only restore focus when this dialog owned it. A newly opened modal must
      // retain focus rather than being pulled back to an element behind it.
      if (document.activeElement === document.body || dialogRef.current?.contains(document.activeElement)) openerRef.current?.focus()
    }
  }, [])

  function trapTab(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return
    const dialog = dialogRef.current
    if (!dialog) return
    const focusable = [...dialog.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
    if (focusable.length === 0) { e.preventDefault(); dialog.focus(); return }
    const first = focusable[0]
    const last = focusable.at(-1)!
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-6" onClick={onClose}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={trapTab}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl border border-[var(--line)] bg-[var(--paper)] p-5 shadow-[var(--shadow-soft)] sm:rounded-2xl sm:p-6"
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="display-font min-w-0 break-words text-xl font-bold text-[var(--ink)]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="shrink-0 rounded-lg px-3 py-1.5 text-2xl leading-none text-[var(--muted)] hover:bg-[var(--line)]">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
