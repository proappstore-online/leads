import { calls, q as baseQ, x as baseX } from './actions'
export { calls } from './actions'
let joined = false
const scenario = new URLSearchParams(location.search).get('scenario')
export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  if (name === 'get_project_invite') {
    calls.push([name, params])
    return [{ project_id: 'invited', project_name: 'Invited project', owner_name: 'Owner', is_owner: 0, is_member: 0 }] as T[]
  }
  if (name === 'list_projects' && joined) {
    calls.push([name, params])
    if (scenario === 'read-error') throw new Error('Membership check failed')
    return (['valid', 'existing'].includes(scenario ?? '') ? [{ id: 'invited', name: 'Invited project', is_owner: 0 }] : []) as T[]
  }
  return baseQ<T>(name, params)
}
export async function x(name: string, params: Record<string, unknown> = {}) {
  if (name === 'join_project') {
    calls.push([name, params])
    joined = true
    // A batch has no top-level metadata, including when every write changes zero rows.
    return undefined
  }
  return baseX(name, params)
}
