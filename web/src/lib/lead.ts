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

/** The largest epoch-ms value a Date can hold either side of 1970; past it is an Invalid Date (#50). */
export const MAX_TIME_MS = 8_640_000_000_000_000

/** True for an epoch-ms value a Date can hold. Writes refuse anything else, but older rows may still carry it (#50). */
export const isValidTime = (ms: unknown): ms is number => typeof ms === 'number' && Number.isFinite(ms) && Math.abs(ms) <= MAX_TIME_MS

/** For a `<time dateTime>`: the ISO string, or undefined for a time that can't be shown. Never throws. */
export const isoTime = (ms: unknown): string | undefined => (isValidTime(ms) ? new Date(ms).toISOString() : undefined)

/** A time as people read it, or "Unknown time" for a value that isn't one. Never throws. */
export const timeText = (ms: unknown, options?: Intl.DateTimeFormatOptions): string => (isValidTime(ms) ? new Date(ms).toLocaleString(undefined, options) : 'Unknown time')

/** Epoch ms → the local `YYYY-MM-DDTHH:mm` a datetime-local input expects; '' (an empty input) for a time that can't be shown. */
export function toInputValue(ms: number): string {
  if (!isValidTime(ms)) return ''
  const local = ms - new Date(ms).getTimezoneOffset() * 60_000
  return isValidTime(local) ? new Date(local).toISOString().slice(0, 16) : ''
}

/**
 * The project_id that addresses a list in every list-scoped action (#4): its project, or 'none' for a
 * list made before projects that has not been moved into one yet.
 */
export const projectOf = (list: { project_id: string | null }) => list.project_id ?? 'none'

/** The switcher value that means "do not narrow to one project" — every project at once. */
export const ALL_PROJECTS = 'all'

/** What the filter bar (`LeadFilters`) is set to - shared by the leads page and the stats popup (#37). '' = any. */
export interface LeadFilter {
  search: string
  status: string
  /** '' = anyone, 'none' = nobody, 'me', otherwise a member's user id. */
  assignedTo: string
  /** '' = any, 'none' = not rated, otherwise a fit. */
  fit: string
  /** '' = any, 'none' = not confirmed yet, otherwise an ISO code. */
  country: string
  /** '' = any source, 'none' = leads without one, otherwise a source id. */
  sourceId: string
  /** '' = any, 'due', 'scheduled', 'none' = open lead with nothing scheduled. */
  followUp: string
  tag: string
}

export const NO_FILTER: LeadFilter = { search: '', status: '', assignedTo: '', fit: '', country: '', sourceId: '', followUp: '', tag: '' }

/** The list_leads params for a filter bar state. */
export function filterParams(f: LeadFilter) {
  return {
    q: f.search.trim() || null, status: f.status || null, assigned_to: f.assignedTo || null, fit: f.fit || null,
    country: f.country || null, source_id: f.sourceId || null, tag: f.tag || null, follow_up: f.followUp || null,
  }
}

/** How many of the dropdowns are set (the search box is not counted). */
export const activeFilterCount = (f: LeadFilter) => [f.status, f.assignedTo, f.fit, f.country, f.sourceId, f.followUp, f.tag].filter(Boolean).length
