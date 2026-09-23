import type { Lead } from '../types'

/** The lead's tags (stored as a JSON array). */
export function leadTags(lead: Pick<Lead, 'tags'>): string[] {
  return lead.tags ? (JSON.parse(lead.tags) as string[]) : []
}

/** The lead's own fields (stored as a JSON object), values as text. */
export function leadCustomFields(lead: Pick<Lead, 'custom_fields'>): [string, string][] {
  return lead.custom_fields ? Object.entries(JSON.parse(lead.custom_fields) as Record<string, string | number>).map(([k, v]) => [k, String(v)]) : []
}

/** A follow-up whose time has come. */
export const isDue = (lead: Pick<Lead, 'next_action_at'>) => lead.next_action_at !== null && lead.next_action_at <= Date.now()

/** Epoch ms of the end of today, local time — "due" means due by tonight. */
export function endOfToday(): number {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime() - 1
}

/** Epoch ms → the local `YYYY-MM-DDTHH:mm` a datetime-local input expects. */
export function toInputValue(ms: number): string {
  return new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/**
 * The project_id that addresses a list in every list-scoped action (#4): its project, or 'none' for a
 * list made before projects that has not been moved into one yet.
 */
export const projectOf = (list: { project_id: string | null }) => list.project_id ?? 'none'

/** The switcher value that means "do not narrow to one project" — every project at once. */
export const ALL_PROJECTS = 'all'
