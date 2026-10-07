/**
 * Issue #37: a small in-memory lead database. stats_timeline, stats_pipeline and list_leads are all
 * computed from it, so the popup's rows can be checked against the number the Stats page showed.
 * (The real SQL is checked to agree in qa/actions.mjs.)
 */
const now = Date.now()
const day = 864e5
const today = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()

const base = {
  user_id: 'me', title: 'Partnerships', company: 'Acme', email: null, phone: null, website: null, location: null,
  linkedin: null, twitter: null, instagram: null, facebook: null, tiktok: null, youtube: null, github: null, notes: null,
  updated_at: now, source: null, source_url: null, found_at: null, attention_reason: null, attention_at: null, source_id: null,
  country: 'AU', assigned_to_user_id: null, tags: null, custom_fields: null, next_action_at: null, next_action: null,
  source_name: null, source_kind: null, source_link: null, list_ids: '', last_message_at: null,
}
// [name, created days ago, status, fit, last reply days ago]
const LEADS = ([
  ['Ada Today', 0, 'new', 'high', null],
  ['Ben Today', 0, 'contacted', null, 0],
  ['Cy Today', 0, 'contacted', 'med', null],
  ['Dee Yesterday', 1, 'new', 'low', 1],
  ['Eve Last week', 6, 'won', 'high', 3],
] as const).map(([name, ago, status, fit, reply], i) => ({
  ...base, id: `lead${i}`, name, status, fit, created_at: today - ago * day + 3600e3, needs_attention: 0,
  last_reply_at: reply === null ? null : today - reply * day + 7200e3,
}))
type L = (typeof LEADS)[number]

const inRange = (t: number | null, from: unknown, before: unknown) =>
  t !== null && (from == null || t >= Number(from)) && (before == null || t < Number(before))

function matches(l: L, p: Record<string, unknown>) {
  if ((p.created_from != null || p.created_before != null) && !inRange(l.created_at, p.created_from, p.created_before)) return false
  if ((p.replied_from != null || p.replied_before != null) && !inRange(l.last_reply_at, p.replied_from, p.replied_before)) return false
  if (p.status && l.status !== p.status) return false
  if (p.fit && (p.fit === 'none' ? l.fit !== null : l.fit !== p.fit)) return false
  if (p.q && !l.name.toLowerCase().includes(String(p.q).toLowerCase())) return false
  return true
}

export interface ActionMeta { changes: number }
export const calls: [string, Record<string, unknown>][] = []
;(window as unknown as { calls: typeof calls }).calls = calls

// Explicitly release stats requests to reproduce out-of-order responses without timing races.
const pending: { source: unknown; resolve: () => void; reject: (e: Error) => void }[] = []
const statsControl = {
  hold: false,
  pending: (source: unknown) => pending.filter((p) => p.source === source).length,
  release: (source: unknown, error = '') => {
    for (const p of pending.filter((p) => p.source === source)) {
      pending.splice(pending.indexOf(p), 1)
      if (error) p.reject(new Error(error))
      else p.resolve()
    }
  },
}
;(window as unknown as { statsControl: typeof statsControl }).statsControl = statsControl

export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  calls.push([name, params])
  if (statsControl.hold && (name === 'stats_timeline' || name === 'stats_pipeline')) {
    await new Promise<void>((resolve, reject) => pending.push({ source: params.source_id, resolve, reject }))
  }
  const selected = params.source_id === 'none' ? LEADS.slice(0, 2) : LEADS
  switch (name) {
    case 'list_leads': return selected.filter((l) => matches(l, params)).slice(Number(params.offset ?? 0), Number(params.offset ?? 0) + Number(params.limit ?? 100)) as T[]
    case 'get_lead': return LEADS.filter((l) => l.id === params.id) as T[]
    case 'stats_timeline': return (JSON.parse(params.buckets as string) as [number, number][]).map(([from, before]) => ({
      leads_added: selected.filter((l) => inRange(l.created_at, from, before)).length,
      leads_replied: selected.filter((l) => inRange(l.last_reply_at, from, before)).length,
      messages_sent: 0, messages_received: 0, sources_added: 0, flagged: 0,
    })) as T[]
    case 'stats_pipeline': {
      const count = (f: (l: L) => boolean) => selected.filter(f).length
      return [{
        total: selected.length,
        ...Object.fromEntries(['new', 'contacted', 'replied', 'qualified', 'won', 'lost'].map((s) => [`status_${s}`, count((l) => l.status === s)])),
        ...Object.fromEntries(['high', 'med', 'low'].map((f) => [`fit_${f}`, count((l) => l.fit === f)])),
        fit_none: count((l) => l.fit === null), with_conversation: 0, replied: count((l) => l.last_reply_at !== null), needs_attention: 0,
      }] as T[]
    }
    case 'list_projects': return [{ id: 'p1', name: 'Client A', description: null, owner_name: 'Max', created_at: now, is_owner: 1, member_count: 0 }] as T[]
    case 'count_leads': return [{ total: LEADS.length, needs_attention: 0, no_source: LEADS.length, assigned_to_me: 0, follow_ups_due: 0 }] as T[]
    default: return [] as T[]
  }
}

export async function x(name: string, params: Record<string, unknown> = {}): Promise<ActionMeta> { calls.push([name, params]); return { changes: 1 } }
