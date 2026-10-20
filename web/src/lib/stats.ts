/** One time bucket of stats_timeline. */
export interface Bucket {
  leads_added: number
  messages_sent: number
  messages_received: number
  leads_replied: number
  sources_added: number
  flagged: number
}

/** stats_pipeline: lead counts by status_*, fit_* and the conversation / reply / attention totals. */
export type Pipeline = Record<string, number>

export const RANGES = {
  '7d': { label: 'Last 7 days', unit: 'day', count: 7 },
  '30d': { label: 'Last 30 days', unit: 'day', count: 30 },
  '90d': { label: 'Last 13 weeks', unit: 'week', count: 13 },
  '12m': { label: 'Last 12 months', unit: 'month', count: 12 },
} as const
export type RangeKey = keyof typeof RANGES

/** [start, end) pairs in local time, oldest first, ending with the current day / week / month. */
export function buckets(range: RangeKey, now = new Date()): { pairs: [number, number][]; labels: string[] } {
  const { unit, count } = RANGES[range]
  const pairs: [number, number][] = []
  const labels: string[] = []
  for (let i = count - 1; i >= 0; i--) {
    let start: Date
    let end: Date
    if (unit === 'day') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i)
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1)
      labels.push(start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
    } else if (unit === 'week') {
      const monday = now.getDate() - ((now.getDay() + 6) % 7)
      start = new Date(now.getFullYear(), now.getMonth(), monday - i * 7)
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 7)
      labels.push(start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }))
    } else {
      start = new Date(now.getFullYear(), now.getMonth() - i, 1)
      end = new Date(start.getFullYear(), start.getMonth() + 1, 1)
      labels.push(start.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }))
    }
    pairs.push([start.getTime(), end.getTime()])
  }
  // The last bucket is always the current one.
  labels[labels.length - 1] = unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month'
  return { pairs, labels }
}
