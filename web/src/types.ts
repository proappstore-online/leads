export const PLATFORMS = ['LinkedIn', 'Email', 'X', 'Instagram', 'Facebook', 'Messenger', 'TikTok', 'YouTube', 'WhatsApp', 'Telegram', 'SMS', 'Phone call', 'In person', 'Other'] as const

/** How well a lead fits the purpose of its list. */
export const FITS = ['high', 'med', 'low'] as const

/** Kinds of place a lead can be found in — the values create_source accepts. */
export const SOURCE_KINDS = ['Facebook group', 'Facebook page', 'Instagram', 'LinkedIn group', 'Reddit', 'Telegram group', 'WhatsApp group', 'Discord', 'Website', 'Event', 'Referral', 'Other'] as const

export const STATUSES = ['new', 'contacted', 'replied', 'qualified', 'won', 'lost'] as const

/** Editable lead fields — every one maps 1:1 to a create_lead/update_lead param. */
export interface LeadFields {
  name: string
  title: string
  company: string
  /** The source (group, page, event) where the lead was found — a row in `sources`. */
  source_id: string
  /** Link to the exact post, thread or page where the lead was found. */
  source_url: string
  email: string
  phone: string
  website: string
  location: string
  /** Confirmed country, ISO 3166 alpha-2. Required on create; older leads may not have one. */
  country: string
  linkedin: string
  twitter: string
  instagram: string
  facebook: string
  tiktok: string
  youtube: string
  github: string
  fit: string
  status: string
  notes: string
}

/** Row shape returned by list_leads (text columns are nullable in D1). */
export type Lead = { [K in keyof LeadFields]: LeadFields[K] | null } & {
  id: string
  name: string
  status: string
  /** Comma-separated list ids from group_concat, null when in no list. */
  list_ids: string | null
  /** Time of the most recent recorded message (epoch ms), null when none. */
  last_message_at: number | null
  /** Time of the lead's most recent message to you (direction 'in'), null when they never replied. */
  last_reply_at: number | null
  /** The lead's source, joined from `sources`. */
  source_name: string | null
  source_kind: string | null
  /** Link to the group / page itself (the lead's own post link is source_url). */
  source_link: string | null
  /** Free-text 'found in' from before sources were a table; shown only when source_id is empty. */
  source: string | null
  /** 1 when the lead is flagged for the owner (by an agent or by hand), with why and when. */
  needs_attention: number
  attention_reason: string | null
  attention_at: number | null
  /** When the lead was found (epoch ms) — set by agents, never cleared by the form. */
  found_at: number | null
  created_at: number
  updated_at: number
}

export interface LeadList {
  id: string
  name: string
  purpose: string | null
  lead_count: number
  created_at: number
}

/** One recorded message of the conversation with a lead. */
export interface Message {
  id: string
  lead_id: string
  platform: string
  /** 'out' = sent by you, 'in' = sent by the lead. */
  direction: 'in' | 'out'
  body: string
  /** Exact time the message was sent (epoch ms). */
  occurred_at: number
  created_at: number
}

/** Column a lead table can be sorted by — the `sort` values list_leads accepts. */
export type SortKey = 'name' | 'email' | 'fit' | 'last_contact' | 'last_reply' | 'status'
export interface Sort { key: SortKey; dir: 'asc' | 'desc' }

/** A place leads are found (Facebook group, page, event…) with its performance, as list_sources returns it. */
export interface Source {
  id: string
  name: string
  kind: string
  url: string | null
  notes: string | null
  created_at: number
  leads: number
  contacted: number
  replied: number
  qualified: number
  won: number
  high_fit: number
  needs_attention: number
  /** replied / contacted as a whole percentage, null when nobody from this source was contacted. */
  reply_rate_pct: number | null
  last_found_at: number | null
}

export type SourceSort = 'leads' | 'reply_rate' | 'won' | 'high_fit' | 'last_found' | 'name'

/** One source in full, as get_source returns it. */
export interface SourceDetail extends Source {
  status_new: number
  status_contacted: number
  status_replied: number
  status_qualified: number
  status_won: number
  status_lost: number
  first_found_at: number | null
  last_contact_at: number | null
}
