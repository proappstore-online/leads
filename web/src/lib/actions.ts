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
  const res = await app.actions.call<{ meta: ActionMeta; results?: { meta?: ActionMeta; rows?: { completed?: number }[] }[] }>(name, params)
  if (name === 'update_display_name') {
    const meta = res.results?.[0]?.meta
    if (meta?.changes !== 1) throw new Error('Name save was not confirmed.')
    return meta
  }
  if (name === 'save_lead_form') {
    // Batch actions return per-statement results, not a top-level meta.
    if (res.results?.at(-1)?.rows?.[0]?.completed !== 1) throw new Error('Save was not confirmed.')
    return { changes: 1 }
  }
  const work = WORK_STATEMENT[name]
  if (work) {
    const meta = res.results?.[work.index]?.meta
    if (meta?.changes !== 1) throw new Error(work.refused)
    return meta
  }
  return res.meta
}

/**
 * Batches whose guard can refuse them: the statement (by index in mcp.json) that does the work. Zero rows
 * there means nothing happened - the batch still resolves, so it must not read as saved.
 */
const WORK_STATEMENT: Record<string, { index: number; refused: string }> = {
  set_list_project: { index: 0, refused: 'The list was not moved to that project. Close and reopen it.' },
  delete_list: { index: 1, refused: 'The list was not deleted - it may have moved. Close and reopen it.' },
  delete_project: { index: 2, refused: 'The project was not deleted. It may have lists now - move or delete them first.' },
  leave_project: { index: 0, refused: 'You are no longer in this project. Reload to see where you are.' },
  remove_project_member: { index: 0, refused: 'That person is no longer a member of this project.' },
}
