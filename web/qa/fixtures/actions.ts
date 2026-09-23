const now = Date.now()
// A very long URL and a long unbroken blob, per issue #10.
export const LONG = 'https://www.facebook.com/groups/melbournejobsandclassifieds/posts/' + '1234567890'.repeat(12) + '/?comment_id=' + '9876543210'.repeat(10) + '&notif_id=' + 'a'.repeat(60)
const BLOB = 'x'.repeat(220)
const lead = {
  id: 'lead1', user_id: 'me', name: 'Alexandrina Montgomery-Wellington', title: 'Head of Partnerships', company: 'Acme',
  email: 'alexandrina.montgomery.wellington@' + 'averylongdomainname'.repeat(4) + '.com.au', phone: '+61 400 123 456',
  website: 'example.com/' + 'path'.repeat(50), location: 'Melbourne', linkedin: 'https://www.linkedin.com/in/' + 'profile-slug'.repeat(20),
  twitter: null, instagram: null, facebook: null, tiktok: null, youtube: null, github: null, status: 'contacted',
  notes: 'See ' + LONG + ' and also ' + BLOB, created_at: now, updated_at: now, source: null, fit: 'high', source_url: LONG, found_at: now,
  needs_attention: 1, attention_reason: 'They asked about ' + LONG, attention_at: now, source_id: 's1', country: 'AU', assigned_to_user_id: null,
  tags: JSON.stringify(['tag-' + 'y'.repeat(35)]), custom_fields: JSON.stringify({ Link: LONG }), next_action_at: now - 1e6, next_action: 'Open ' + LONG,
  source_name: 'Jobs in Melbourne ' + BLOB, source_kind: 'Facebook group', source_link: LONG, list_ids: 'l1', last_message_at: now, last_reply_at: null,
}
const source = { id: 's1', name: 'Jobs in Melbourne ' + BLOB, kind: 'Facebook group', url: LONG, notes: 'Notes with ' + LONG, created_at: now, leads: 1, contacted: 1, replied: 0, qualified: 0, won: 0, high_fit: 1, needs_attention: 1, reply_rate_pct: 0, last_found_at: now }
const FIX: Record<string, unknown[]> = {
  list_lists: [{ id: 'l1', name: 'List ' + BLOB, purpose: 'Purpose ' + LONG, project_id: 'p1', created_at: now, lead_count: 1 }],
  count_leads: [{ total: 1, needs_attention: 1, no_source: 0, assigned_to_me: 1, follow_ups_due: 1 }],
  list_projects: [{ id: 'p1', name: 'Project ' + BLOB, description: 'About ' + LONG, owner_name: 'Max', created_at: now, is_owner: 1, member_count: 1 }],
  list_project_members: [{ project_id: 'p1', user_id: 'm1', display_name: 'Maria ' + BLOB, joined_at: now }],
  list_project_invites: [{ code: 'abcdef0123456789abcdef0123456789', project_id: 'p1', expires_at: now + 6e8, created_at: now }],
  list_tags: [{ tag: 'tag-' + 'y'.repeat(35), leads: 1 }],
  list_leads: [lead], list_assigned_leads: [lead], get_lead: [lead], list_sources: [source],
  get_source: [{ ...source, status_new: 0, status_contacted: 1, status_replied: 0, status_qualified: 0, status_won: 0, status_lost: 0, first_found_at: now, last_contact_at: now }],
  list_messages: [{ id: 'm1', lead_id: 'lead1', platform: 'Messenger', direction: 'out', body: 'Here: ' + LONG + ' ' + BLOB, occurred_at: now, created_at: now }],
  get_lead_history: [
    { seq: 1, at: now, by_user_id: 'me', via: null, note: 'Note with ' + LONG, changes: null },
    { seq: 0, at: now, by_user_id: 'me', via: 'update_lead', changes: JSON.stringify({ website: [null, LONG], notes: ['old ' + BLOB, 'new ' + LONG] }), note: null },
  ],
  stats_pipeline: [{ total: 1, status_new: 0, status_contacted: 1, status_replied: 0, status_qualified: 0, status_won: 0, status_lost: 0, fit_high: 1, fit_med: 0, fit_low: 0, fit_none: 0, with_conversation: 1, replied: 0, needs_attention: 1 }],
  recent_activity: [{ kind: 'flagged', at: now, lead_id: 'lead1', lead_name: 'Alexandrina Montgomery-Wellington', source_name: 'Jobs ' + BLOB, detail: 'They asked about ' + LONG, k: 'f:lead1' }],
}
export interface ActionMeta { changes: number }
export const calls: [string, Record<string, unknown>][] = []
;(window as unknown as { calls: typeof calls; LONG: string }).calls = calls
;(window as unknown as { LONG: string }).LONG = LONG
export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  calls.push([name, params])
  if (name === 'stats_timeline') return JSON.parse(params.buckets as string).map(() => ({ leads_added: 1, messages_sent: 1, messages_received: 0, leads_replied: 0, sources_added: 0, flagged: 1 })) as T[]
  return (FIX[name] ?? []) as T[]
}
export async function x(name: string, params: Record<string, unknown> = {}): Promise<ActionMeta> { calls.push([name, params]); return { changes: 1 } }
