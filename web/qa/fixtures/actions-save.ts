import { calls, x as baseX } from './actions'
export { q, calls } from './actions'
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
