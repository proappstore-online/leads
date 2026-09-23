import type { Source } from '../types'

/** How a changed field is named in the lead history and the activity feed. */
export const FIELD_LABELS: Record<string, string> = {
  status: 'Status', fit: 'Fit', notes: 'Notes', next_action_at: 'Follow-up', next_action: 'Next action', assigned_to_user_id: 'Assigned to',
  needs_attention: 'Needs attention', attention_reason: 'Attention reason', tags: 'Tags', custom_fields: 'Custom fields', source_id: 'Found in',
  source_url: 'Found-in post', found_at: 'Found', email: 'Email', phone: 'Phone', website: 'Website', location: 'Location', country: 'Country',
  name: 'Name', title: 'Title', company: 'Company', linkedin: 'LinkedIn', twitter: 'X', instagram: 'Instagram', facebook: 'Facebook',
  tiktok: 'TikTok', youtube: 'YouTube', github: 'GitHub',
}

export const fieldLabel = (field: string) => FIELD_LABELS[field] ?? field

export const when = (ms: number) => new Date(ms).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** Names for the ids a change can hold. */
export interface HistoryNames {
  /** Names by user id — you as "You". */
  people?: Map<string, string>
  sources?: Source[]
}

/** One side of a change, as a person reads it. */
export function formatValue(field: string, value: unknown, names: HistoryNames = {}, max = 200): string {
  if (value === null || value === undefined || value === '') return '—'
  if (field === 'next_action_at' || field === 'found_at') return when(Number(value))
  if (field === 'assigned_to_user_id') return names.people?.get(String(value)) ?? 'someone'
  if (field === 'needs_attention') return value ? 'flagged' : 'cleared'
  if (field === 'source_id') return names.sources?.find((s) => s.id === value)?.name ?? 'a source'
  if (Array.isArray(value)) return value.join(', ')
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${k}: ${v}`).join(', ')
  const text = String(value)
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/** A change set on one line: `Status: new → contacted · Fit: — → high`. */
export function summariseChanges(changes: string | null, names: HistoryNames = {}, max = 60): string {
  if (!changes) return 'Changed'
  let parsed: Record<string, [unknown, unknown]>
  try {
    parsed = JSON.parse(changes) as Record<string, [unknown, unknown]>
  } catch {
    return 'Changed'
  }
  const parts = Object.entries(parsed).map(([field, [from, to]]) => (
    field === 'notes'
      ? 'Notes edited'
      : `${fieldLabel(field)}: ${formatValue(field, from, names, max)} → ${formatValue(field, to, names, max)}`
  ))
  return parts.join(' · ') || 'Changed'
}
