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

/** Mirrors SQL: HTTPS, an unambiguous platform host and a nonempty profile path. */
export function isProfileLink(domains: string[], value: string): boolean {
  if (/[\\\s\u0000-\u001f\u007f]/.test(value) || !/^https:\/\//i.test(value)) return false
  // Restrict the raw authority too: URL parsing normalizes credentials and escapes.
  const authority = value.slice('https://'.length).split('/')[0].toLowerCase()
  if (!/^[a-z0-9.-]+$/.test(authority)) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === authority && url.pathname.length > 1
      && domains.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`))
  } catch {
    return false
  }
}

/** Websites may be typed without a scheme. */
export function websiteUrl(value: string): string {
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}
