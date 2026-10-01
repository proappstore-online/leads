import { q as baseQ, calls, x as baseX } from './actions'
export { calls } from './actions'
export type { ActionMeta } from './actions'
let attempt = 0
export async function x(name: string, params: Record<string, unknown> = {}) {
  if (name === 'save_lead_form' || name === 'add_lead_to_list') {
    calls.push([name, params])
    if (++attempt % 2 === 1) throw new Error('Simulated lost response')
    return { changes: 1 }
  }
  return baseX(name, params)
}

// Simulate agent enrichment between opening the form and its in-place write.
export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const rows = await baseQ<T>(name, params)
  if (name === 'get_lead' && (window as unknown as { enriched?: boolean }).enriched) {
    return rows.map((row) => ({ ...row, company: 'New Company', title: 'New Role',
      email: 'fresh@example.com', status: 'qualified', notes: 'Agent notes', country: 'NZ',
      tags: '["fresh"]', custom_fields: '{"Agent":"new"}', list_ids: null, updated_at: 3 }))
  }
  return rows
}
