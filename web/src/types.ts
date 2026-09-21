export const PLATFORMS = ['LinkedIn', 'Email', 'X', 'Instagram', 'Facebook', 'TikTok', 'YouTube', 'WhatsApp', 'Telegram', 'SMS', 'Phone call', 'In person', 'Other'] as const

export const STATUSES = ['new', 'contacted', 'replied', 'qualified', 'won', 'lost'] as const

/** Editable lead fields — every one maps 1:1 to a create_lead/update_lead param. */
export interface LeadFields {
  name: string
  title: string
  company: string
  /** Where the lead was found (group, community, event) — not their employer. */
  source: string
  email: string
  phone: string
  website: string
  location: string
  linkedin: string
  twitter: string
  instagram: string
  facebook: string
  tiktok: string
  youtube: string
  github: string
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
