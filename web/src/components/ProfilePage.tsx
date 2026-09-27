import { useEffect, useState, type FormEvent } from 'react'
import { q, x } from '../lib/actions'
import type { Project } from '../types'
import { explainError, LoadingState, RetryState } from './AsyncState'
import { inputClass, wrapAnywhere } from './styles'

const MAX_NAME = 80

/**
 * The signed-in user's profile (#36). The platform account (name, avatar) is read-only here - it
 * comes from the sign-in provider. The one thing Leads stores is the name collaborators see.
 */
export function ProfilePage({ user, displayName, projects, onNameSaved, onBack, onDeleteData, onSignOut }: {
  user: { name: string; avatarUrl: string | null }
  /** The name collaborators currently see. */
  displayName: string
  projects: Project[]
  onNameSaved: (name: string) => void
  onBack: () => void
  onDeleteData: () => void
  onSignOut: () => void
}) {
  const [name, setName] = useState(displayName)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [leadCount, setLeadCount] = useState<number | null>(null)
  const [countError, setCountError] = useState('')

  const loadCount = () => {
    setCountError('')
    q<{ total: number }>('count_leads')
      .then((rows) => setLeadCount(rows[0]?.total ?? 0))
      .catch((e) => setCountError(e instanceof Error ? e.message : String(e)))
  }
  useEffect(loadCount, [])
  useEffect(() => {
    const previous = document.title
    document.title = 'Profile — ProAppStore'
    return () => { document.title = previous }
  }, [])

  const owned = projects.filter((p) => p.is_owner).length
  const trimmed = name.trim()

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!trimmed || trimmed.length > MAX_NAME) return
    setSaving(true)
    setMessage(null)
    try {
      await x('update_display_name', { display_name: trimmed })
      onNameSaved(trimmed)
      setMessage({ ok: true, text: 'Saved.' })
    } catch (err) {
      setMessage({ ok: false, text: explainError(err) })
    } finally {
      setSaving(false)
    }
  }

  const section = 'rounded-2xl border border-[var(--line)] bg-[var(--panel-strong)] p-4 sm:p-5'
  const secondary = 'rounded-xl border border-[var(--line-strong)] px-4 py-2.5 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--line)]'

  return (
    <main id="main-content" className="mx-auto w-full max-w-2xl flex-1 space-y-4 px-4 py-5">
      <button type="button" onClick={onBack} className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--accent)] hover:bg-[var(--line)]">← Back to leads</button>
      <h1 className="display-font text-2xl font-bold text-[var(--ink)]">Profile</h1>

      <section className={`${section} flex items-center gap-4`}>
        {user.avatarUrl
          ? <img src={user.avatarUrl} alt="" width={56} height={56} className="size-14 shrink-0 rounded-full border border-[var(--line)]" />
          : <div aria-hidden="true" className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-xl font-bold text-[var(--paper)]">{user.name.slice(0, 1).toUpperCase()}</div>}
        <div className="min-w-0">
          <div className={`text-lg font-semibold text-[var(--ink)] ${wrapAnywhere}`}>{user.name}</div>
          <p className="text-sm text-[var(--muted)]">Your name and picture come from the account you sign in with (GitHub or Google). Change them there.</p>
        </div>
      </section>

      <form onSubmit={save} className={section}>
        <label className="block">
          <span className="text-sm font-semibold text-[var(--ink)]">Name shown to project collaborators</span>
          <input
            type="text"
            value={name}
            maxLength={MAX_NAME}
            required
            onChange={(e) => { setName(e.target.value); setMessage(null) }}
            className={inputClass}
          />
        </label>
        <p className="mt-1 text-xs text-[var(--muted)]">People in your projects see this name, and it is used for projects you create or join from now on.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || !trimmed || trimmed === displayName} className="rounded-xl bg-[var(--accent)] px-5 py-2.5 text-sm font-semibold text-[var(--paper)] disabled:opacity-50">
            Save name
          </button>
          {saving && <p role="status" className="text-sm text-[var(--muted)]">Saving…</p>}
          {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? 'text-[var(--success)]' : 'text-[var(--error)]'}`}>{message.text}</p>}
        </div>
      </form>

      <section className={section}>
        <h2 className="text-sm font-semibold text-[var(--ink)]">Your account in Leads</h2>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {([['Projects you own', owned], ['Projects you joined', projects.length - owned], ['Leads', leadCount]] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl border border-[var(--line)] bg-[var(--paper)] px-3 py-2">
              <dt className="text-xs text-[var(--muted)]">{label}</dt>
              <dd className="text-2xl font-bold tabular-nums text-[var(--ink)]">{value ?? '—'}</dd>
            </div>
          ))}
        </dl>
        {countError ? <div className="mt-3"><RetryState error={countError} onRetry={loadCount} /></div> : leadCount === null && <div className="mt-3"><LoadingState label="Counting your leads…" /></div>}
      </section>

      <section className={section}>
        <h2 className="text-sm font-semibold text-[var(--ink)]">Account actions</h2>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <button type="button" onClick={() => location.assign('/.pas/auth/recover')} className={secondary}>Recover session…</button>
          <button type="button" onClick={onSignOut} className={secondary}>Sign out</button>
          <button type="button" onClick={onDeleteData} className="rounded-xl border border-[var(--error)] px-4 py-2.5 text-sm font-semibold text-[var(--error)] hover:bg-[var(--line)]">Delete my data…</button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">Recover session signs you out and clears this app's cached files, for when sign-in gets stuck. Delete my data removes everything this account holds in Leads.</p>
      </section>
    </main>
  )
}
