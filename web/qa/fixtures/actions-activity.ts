/** One lead with several events days apart, plus one whose time was never recorded (issue #12). */
const now = Date.now()
const day = 864e5

const lead = {
  id: 'lead1', user_id: 'me', name: 'Alice Archer', title: 'Partnerships', company: 'Acme', email: null, phone: null, website: null,
  location: null, linkedin: null, twitter: null, instagram: null, facebook: null, tiktok: null, youtube: null, github: null,
  status: 'replied', notes: null, created_at: now - 9 * day, updated_at: now, source: null, fit: 'high', source_url: null, found_at: null,
  needs_attention: 1, attention_reason: 'Wants a call', attention_at: now - 2 * day, source_id: null, country: 'AU',
  assigned_to_user_id: null, tags: null, custom_fields: null, next_action_at: null, next_action: null, source_name: null,
  source_kind: null, source_link: null, list_ids: 'l1', last_message_at: null, last_reply_at: null,
}

// Newest first, exactly as recent_activity returns them. The lead row was touched today (updated_at),
// which must not appear as any event's time.
const FEED = [
  { kind: 'lead_changed', at: now - 2 * day, at_known: 1, lead_id: 'lead1', lead_name: 'Alice Archer', source_name: null, detail: JSON.stringify({ needs_attention: [0, 1], attention_reason: [null, 'Wants a call'] }), k: 'h:lead1:4' },
  { kind: 'lead_changed', at: now - 4 * day, at_known: 1, lead_id: 'lead1', lead_name: 'Alice Archer', source_name: null, detail: JSON.stringify({ status: ['contacted', 'replied'] }), k: 'h:lead1:3' },
  { kind: 'lead_note', at: now - 6 * day, at_known: 1, lead_id: 'lead1', lead_name: 'Alice Archer', source_name: null, detail: 'Called, wants a demo', k: 'n:lead1:2' },
  { kind: 'lead_changed', at: now - 8 * day, at_known: 1, lead_id: 'lead1', lead_name: 'Alice Archer', source_name: null, detail: JSON.stringify({ status: ['new', 'contacted'] }), k: 'h:lead1:1' },
  { kind: 'lead_note', at: now - 9 * day, at_known: 0, lead_id: 'lead1', lead_name: 'Alice Archer', source_name: null, detail: 'An old note whose time was never recorded', k: 'n:lead1:9' },
  { kind: 'lead_added', at: now - 9 * day, at_known: 1, lead_id: 'lead1', lead_name: 'Alice Archer', source_name: null, detail: 'Partnerships', k: 'a:lead1' },
]

export interface ActionMeta { changes: number }
export const calls: [string, Record<string, unknown>][] = []
;(window as unknown as { calls: typeof calls; FEED: typeof FEED }).calls = calls
;(window as unknown as { FEED: typeof FEED }).FEED = FEED

export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  calls.push([name, params])
  switch (name) {
    case 'recent_activity': return (params.before ? [] : FEED) as T[]
    case 'list_leads': return [lead] as T[]
    case 'get_lead': return [lead] as T[]
    case 'list_lists': return [{ id: 'l1', name: 'Investors', purpose: null, project_id: 'p1', created_at: now, lead_count: 1 }] as T[]
    case 'list_projects': return [{ id: 'p1', name: 'Client A', description: null, owner_name: 'Max', created_at: now, is_owner: 1, member_count: 0 }] as T[]
    case 'count_leads': return [{ total: 1, needs_attention: 1, no_source: 1, assigned_to_me: 0, follow_ups_due: 0 }] as T[]
    case 'stats_pipeline': return [{ total: 1, status_new: 0, status_contacted: 0, status_replied: 1, status_qualified: 0, status_won: 0, status_lost: 0, fit_high: 1, fit_med: 0, fit_low: 0, fit_none: 0, with_conversation: 0, replied: 1, needs_attention: 1 }] as T[]
    case 'stats_timeline': return JSON.parse(params.buckets as string).map(() => ({ leads_added: 0, messages_sent: 0, messages_received: 0, leads_replied: 0, sources_added: 0, flagged: 0 })) as T[]
    default: return [] as T[]
  }
}

export async function x(name: string, params: Record<string, unknown> = {}): Promise<ActionMeta> { calls.push([name, params]); return { changes: 1 } }
