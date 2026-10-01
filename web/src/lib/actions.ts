import { app } from './app'

/**
 * Registered-action helpers. Every user-facing read/write goes through
 * `app.actions.call` (platform-prepared, role-checked SQL registered in
 * mcp.json) instead of raw browser SQL — the data worker only accepts raw
 * SQL from the app's own team since the cross-tenant lockdown.
 */

export interface ActionMeta {
  changes: number
  duration?: number
  last_row_id?: number
}

/** Call a query action; resolves to the result rows. */
export async function q<T>(name: string, params: Record<string, unknown> = {}): Promise<T[]> {
  const res = await app.actions.call<{ rows: T[] }>(name, params)
  return res.rows
}

/** Call an execute action; resolves to the write metadata. */
export async function x(name: string, params: Record<string, unknown> = {}): Promise<ActionMeta> {
  const res = await app.actions.call<{ meta: ActionMeta; results?: { rows?: { completed?: number }[] }[] }>(name, params)
  if (name === 'save_lead_form') {
    // Batch actions return per-statement results, not a top-level meta.
    if (res.results?.at(-1)?.rows?.[0]?.completed !== 1) throw new Error('Save was not confirmed.')
    return { changes: 1 }
  }
  return res.meta
}
