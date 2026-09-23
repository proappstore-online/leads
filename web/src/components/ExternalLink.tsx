import type { ReactNode } from 'react'

export const linkClass = 'text-[var(--sky-deep)] underline-offset-4 hover:underline'

/** A URL as a short label: no scheme or www, and the middle dropped when it is long. */
export function shortUrl(url: string, max = 42): string {
  const bare = url.replace(/^[a-z]+:\/\/(www\.)?/i, '').replace(/\/+$/, '')
  return bare.length <= max ? bare : `${bare.slice(0, max - 11)}…${bare.slice(-10)}`
}

/**
 * A link that can never widen its container: the label is cut with an ellipsis, while the whole URL
 * stays in href and in the tooltip. Pass children for a label of your own (a source name, "post");
 * with none, the URL itself is shortened. Its parent needs a width to cut against - inside a flex
 * row that means `min-w-0` on the item.
 */
export function ExternalLink({ href, children, title, className = '' }: {
  href: string
  children?: ReactNode
  /** Tooltip; the full URL by default. */
  title?: string
  className?: string
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title ?? href}
      className={`inline-block max-w-full truncate align-bottom ${linkClass} ${className}`}
    >
      {children ?? shortUrl(href)}
    </a>
  )
}
