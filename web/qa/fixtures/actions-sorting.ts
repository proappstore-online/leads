/**
 * Leads whose order differs by column, with sorting and filtering done here the way the actions do
 * it in SQL — so a check can prove the rendered order really follows the controls.
 */
const now = Date.now()
const day = 864e5

interface Row {
  name: string
  email: string
  status: string
  fit: string | null
  next_action_at: number | null
  last_message_at: number | null
  updated_at: number
  needs_attention: number
  company: string
}

// Ann/Bob/Cara/Dan deliberately rank differently in every column.
const ROWS: Row[] = [
  { name: 'Ann Archer', email: 'ann@example.com', status: 'won', fit: 'low', next_action_at: now + day, last_message_at: now - 4 * day, updated_at: now - day, needs_attention: 0, company: 'Alpha' },
  { name: 'Bob Brennan', email: 'bob@example.com', status: 'new', fit: 'high', next_action_at: now + 3 * day, last_message_at: now - 2 * day, updated_at: now - 3 * day, needs_attention: 0, company: 'Beta' },
  { name: 'Cara Cortez', email: 'cara@example.com', status: 'contacted', fit: 'med', next_action_at: now + 2 * day, last_message_at: now - day, updated_at: now - 4 * day, needs_attention: 0, company: 'Gamma' },
  { name: 'Dan Doyle', email: 'dan@example.com', status: 'replied', fit: null, next_action_at: null, last_message_at: now - 3 * day, updated_at: now - 2 * day, needs_attention: 0, company: 'Delta' },
]

const STATUS_ORDER = ['new', 'contacted', 'replied', 'qualified', 'won', 'lost']
const FIT_ORDER = ['high', 'med', 'low']

const lead = (r: Row, i: number) => ({
  id: 'lead' + i, user_id: 'me', name: r.name, title: 'Partnerships', company: r.company, email: r.email, phone: null, website: null,
  location: 'Melbourne', linkedin: null, twitter: null, instagram: null, facebook: null, tiktok: null, youtube: null, github: null,
  status: r.status, notes: null, created_at: now - (i + 1) * day, updated_at: r.updated_at, source: null, fit: r.fit, source_url: null,
  found_at: null, needs_attention: r.needs_attention, attention_reason: r.needs_attention ? 'Call back' : null,
  attention_at: r.needs_attention ? now : null, source_id: null, country: 'AU', assigned_to_user_id: 'me', tags: null,
  custom_fields: null, next_action_at: r.next_action_at, next_action: r.next_action_at ? 'Call' : null, source_name: null,
  source_kind: null, source_link: null, list_ids: 'l1', last_message_at: r.last_message_at, last_reply_at: null, shared: 0, project_id: 'p1',
})

const LEADS = ROWS.map(lead)

/** The value a sort key orders on — the same columns the SQL uses. */
function key(l: ReturnType<typeof lead>, sort: string): string | number | null {
  switch (sort) {
    case 'email': return l.email
    case 'status': return STATUS_ORDER.indexOf(l.status)
    case 'fit': return l.fit ? FIT_ORDER.indexOf(l.fit) : null
    case 'next_action': return l.next_action_at
    case 'last_contact': return l.last_message_at
    case 'last_reply': return l.last_reply_at
    case 'created': return l.created_at
    case 'updated': return l.updated_at
    default: return l.name.toLowerCase()
  }
}

/** Flagged first, then the chosen column in the chosen direction, empty values always last. */
function order(rows: ReturnType<typeof lead>[], sort = 'name', dir = 'asc') {
  return [...rows].sort((a, b) => {
    if (a.needs_attention !== b.needs_attention) return b.needs_attention - a.needs_attention
    const x = key(a, sort)
    const y = key(b, sort)
    if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1
    if (y === null || y === undefined) return -1
    if (x === y) return a.name.localeCompare(b.name)
    return (x < y ? -1 : 1) * (dir === 'desc' ? -1 : 1)
  })
}

function select(params: Record<string, unknown>) {
  let rows = LEADS
  if (params.status) rows = rows.filter((l) => l.status === params.status)
  if (params.q) {
    const q = String(params.q).toLowerCase()
    rows = rows.filter((l) => [l.name, l.company, l.title, l.email].some((v) => v && v.toLowerCase().includes(q)))
  }
  if (params.project_id && params.project_id !== 'p1') rows = []
  return order(rows, (params.sort as string) ?? 'name', (params.dir as string) ?? 'asc')
}

export interface ActionMeta { changes: number }
export const calls: [string, Record<string, unknown>][] = []
;(window as unknown as { calls: typeof calls }).calls = calls

export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  calls.push([name, params])
  switch (name) {
    case 'list_leads': return select(params) as T[]
    // The view under test: its default order is the most recently changed.
    case 'list_assigned_leads': return select({ ...params, sort: params.sort ?? 'updated', dir: params.dir ?? 'desc' }) as T[]
    case 'list_lists': return [{ id: 'l1', name: 'Investors', purpose: null, project_id: 'p1', created_at: now, lead_count: LEADS.length }] as T[]
    case 'list_projects': return [{ id: 'p1', name: 'Client A', description: null, owner_name: 'Max', created_at: now, is_owner: 1, member_count: 0 }] as T[]
    case 'count_leads': return [{ total: LEADS.length, needs_attention: 0, no_source: 0, assigned_to_me: LEADS.length, follow_ups_due: 1 }] as T[]
    default: return [] as T[]
  }
}

export async function x(name: string, params: Record<string, unknown> = {}): Promise<ActionMeta> {
  calls.push([name, params])
  return { changes: 1 }
}
