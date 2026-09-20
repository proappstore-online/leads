import type { LeadFields } from '../types'

export const SOCIALS: { key: keyof LeadFields; label: string; base: string }[] = [
  { key: 'linkedin', label: 'LinkedIn', base: 'https://www.linkedin.com/in/' },
  { key: 'twitter', label: 'X', base: 'https://x.com/' },
  { key: 'instagram', label: 'Instagram', base: 'https://www.instagram.com/' },
  { key: 'facebook', label: 'Facebook', base: 'https://www.facebook.com/' },
  { key: 'tiktok', label: 'TikTok', base: 'https://www.tiktok.com/@' },
  { key: 'youtube', label: 'YouTube', base: 'https://www.youtube.com/@' },
  { key: 'github', label: 'GitHub', base: 'https://github.com/' },
]

/** Profiles are stored as typed — a full URL or a bare handle. */
export function profileUrl(base: string, value: string): string {
  return /^https?:\/\//i.test(value) ? value : base + value.replace(/^@/, '')
}
