import type { LeadFields } from '../types'

/**
 * Social profile fields hold LINKS only — the full https:// URL of the profile.
 * The same rule is enforced in SQL by create_lead / update_lead in mcp.json
 * (and explained to agents by check_lead_links); keep the domains in step.
 */
export const SOCIALS: { key: keyof LeadFields; label: string; domains: string[]; example: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', domains: ['linkedin.com'], example: 'https://www.linkedin.com/in/jane-doe' },
  { key: 'twitter', label: 'X', domains: ['x.com', 'twitter.com'], example: 'https://x.com/janedoe' },
  { key: 'instagram', label: 'Instagram', domains: ['instagram.com'], example: 'https://www.instagram.com/janedoe' },
  { key: 'facebook', label: 'Facebook', domains: ['facebook.com', 'fb.com', 'fb.me'], example: 'https://www.facebook.com/jane.doe' },
  { key: 'tiktok', label: 'TikTok', domains: ['tiktok.com'], example: 'https://www.tiktok.com/@janedoe' },
  { key: 'youtube', label: 'YouTube', domains: ['youtube.com', 'youtu.be'], example: 'https://www.youtube.com/@janedoe' },
  { key: 'github', label: 'GitHub', domains: ['github.com'], example: 'https://github.com/janedoe' },
]

/** Mirrors the SQL guard: https://, no spaces, the platform's domain, and a path after it. */
export function isProfileLink(domains: string[], value: string): boolean {
  if (/\s/.test(value) || !value.toLowerCase().startsWith('https://')) return false
  const lower = value.toLowerCase()
  return domains.some((d) => {
    const at = lower.indexOf(`${d}/`)
    return at >= 0 && lower.length > at + d.length + 1
  })
}

/** Websites may be typed without a scheme. */
export function websiteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
