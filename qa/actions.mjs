/**
 * The registered actions, run against a real SQLite built from migrations.json, with parameters
 * bound the way the platform binds them. No browser and no dependencies.
 *
 *   node qa/actions.mjs          (also part of `pnpm test`)
 *
 * Covers issue #12: every activity item carries its own event time.
 */
import { DatabaseSync } from 'node:sqlite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const TOOLS = Object.fromEntries(read('../mcp.json').tools.map((t) => [t.name, t]))

const db = new DatabaseSync(':memory:')
for (const m of read('../migrations.json').migrations) db.exec(m.sql)

/** Defaults, optionals and types, as the backend resolves them before binding. */
function resolve(tool, params) {
  const out = {}
  for (const [name, schema] of Object.entries(tool.params ?? {})) {
    let value = params[name]
    if (value === undefined || value === null) {
      if (schema.default !== undefined) value = schema.default
      else if (schema.optional) value = null
      else throw new Error(`${tool.name}: missing required parameter ${name}`)
    }
    if (value !== null && schema.type === 'integer') value = Number(value)
    if (value !== null && schema.type === 'boolean') value = value ? 1 : 0
    out[name] = value
  }
  for (const name of Object.keys(params)) {
    if (!(name in (tool.params ?? {}))) throw new Error(`${tool.name}: unknown parameter ${name}`)
  }
  return out
}

/** Every `:name` becomes one positional `?`, magic values included — exactly like the platform. */
function bind(sql, resolved, user) {
  const magic = { __user_id: () => user, __now: () => Date.now(), __uuid: () => randomUUID() }
  const values = []
  const bound = sql.replace(/:([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (name in magic) values.push(magic[name]())
    else if (name in resolved) values.push(resolved[name])
    else throw new Error(`unresolved parameter: ${name}`)
    return '?'
  })
  if (values.length > 100) throw new Error(`${values.length} bound values, D1 allows 100`)
  return [bound, values]
}

export function call(name, user, params = {}) {
  const tool = TOOLS[name]
  if (!tool) throw new Error(`no such action: ${name}`)
  const resolved = resolve(tool, params)
  if (tool.operation === 'batch') {
    return tool.statements.map((s) => db.prepare(...[bind(s, resolved, user)[0]]).run(...bind(s, resolved, user)[1]).changes)
  }
  const [sql, values] = bind(tool.sql, resolved, user)
  const stmt = db.prepare(sql)
  return tool.operation === 'query' ? stmt.all(...values) : stmt.run(...values).changes
}

let failures = 0
export const ok = (pass, what) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${what}`)
  if (!pass) failures++
}

// --- #12: the activity feed uses each event's own time ----------------------------------------
const O = 'owner'
const P = randomUUID()
const L = randomUUID()
const LEAD = randomUUID()
const OTHER = randomUUID()
const day = 864e5
const now = Date.now()

call('create_project', O, { id: P, name: 'Client A' })
call('create_list', O, { id: L, name: 'Investors', project_id: P })
call('create_source', O, { id: 'src', name: 'Jobs group', kind: 'Facebook group', url: '', notes: '' })
call('create_lead', O, { id: LEAD, name: 'Alice', country: 'AU', source_id: 'src' })
call('add_lead_to_list', O, { lead_id: LEAD, list_id: L, project_id: P })
call('create_lead', O, { id: OTHER, name: 'Bob', country: 'AU' })

// Four things happen to Alice, days apart, and the lead row is edited last of all.
call('set_lead_status', O, { id: LEAD, status: 'contacted' })
call('add_note', O, { id: LEAD, note: 'Called, wants a demo' })
call('set_lead_status', O, { id: LEAD, status: 'replied' })
call('flag_needs_attention', O, { id: LEAD, reason: 'Wants a call' })

/** Stamp the history entries with times of our choosing — the app can only write "now". */
function restamp(leadId, times) {
  const row = db.prepare('SELECT history FROM leads WHERE id = ?').get(leadId)
  const entries = JSON.parse(row.history)
  entries.forEach((e, i) => { if (times[i] !== undefined) e.at = times[i] })
  db.prepare('UPDATE leads SET history = ? WHERE id = ?').run(JSON.stringify(entries), leadId)
  return entries
}

// created, status->contacted, note, status->replied, flagged … then the row is touched today.
const times = [now - 9 * day, now - 8 * day, now - 6 * day, now - 4 * day, now - 2 * day]
restamp(LEAD, times)
db.prepare('UPDATE leads SET created_at = ?, updated_at = ?, attention_at = ? WHERE id = ?')
  .run(now - 9 * day, now, now - 2 * day, LEAD)

const feed = () => call('recent_activity', O, { limit: 50 })
const mine = () => feed().filter((e) => e.lead_id === LEAD)

const ats = mine().map((e) => e.at)
ok(ats.length === 5, `one item per event, not one per lead (${ats.length} items)`)
ok(ats.every((at) => at !== now), 'no item is stamped with the lead\'s latest update time')
ok(JSON.stringify(ats) === JSON.stringify([...ats].sort((a, b) => b - a)), `items come back newest first (${ats.map((a) => Math.round((now - a) / day) + 'd').join(', ')})`)
ok(JSON.stringify(ats) === JSON.stringify([...times].reverse()), 'each item carries its own recorded time')

const kinds = mine().map((e) => e.kind)
ok(JSON.stringify(kinds) === JSON.stringify(['lead_changed', 'lead_changed', 'lead_note', 'lead_changed', 'lead_added']),
  `kinds follow the events (${kinds.join(', ')})`)
ok(mine().find((e) => e.kind === 'lead_note').detail === 'Called, wants a demo', 'a note carries its text')
const change = mine().find((e) => e.kind === 'lead_changed' && e.at === now - 8 * day)
ok(JSON.parse(change.detail).status?.join('->') === 'new->contacted', `a change carries what changed (${change.detail})`)
ok(mine().every((e) => e.at_known === 1), 'each of those times is the recorded one')
ok(mine().find((e) => e.kind === 'lead_added').at === now - 9 * day, 'the lead was added at its creation time')

// The flag is one event, from the history, not also a second one from the lead row.
ok(mine().filter((e) => JSON.stringify(e.detail).includes('needs_attention')).length === 1, 'a flag shows once')
ok(mine().every((e) => e.kind !== 'flagged'), 'the row-level flag event does not double up')

// A lead flagged before history existed still shows its flag.
db.prepare('UPDATE leads SET history = NULL, needs_attention = 1, attention_reason = ?, attention_at = ? WHERE id = ?')
  .run('Old flag', now - 5 * day, OTHER)
const legacy = feed().filter((e) => e.lead_id === OTHER)
ok(legacy.some((e) => e.kind === 'flagged' && e.at === now - 5 * day && e.detail === 'Old flag'), 'a flag from before history still shows, at its own time')
ok(legacy.some((e) => e.kind === 'lead_added'), 'and so does its creation')

// An entry written without a time falls back to the lead's creation, and says so.
const entries = JSON.parse(db.prepare('SELECT history FROM leads WHERE id = ?').get(LEAD).history)
delete entries[2].at
db.prepare('UPDATE leads SET history = ? WHERE id = ?').run(JSON.stringify(entries), LEAD)
const note = mine().find((e) => e.kind === 'lead_note')
ok(note.at === now - 9 * day && note.at_known === 0, `it falls back to the creation time and is marked (at_known ${note.at_known})`)
ok(mine()[0].at === now - 2 * day, 'and it does not jump to the top of the feed')
entries[2].at = times[2]
db.prepare('UPDATE leads SET history = ? WHERE id = ?').run(JSON.stringify(entries), LEAD)

// Paging walks the same order.
const page1 = call('recent_activity', O, { limit: 2 })
const page2 = call('recent_activity', O, { limit: 2, before: page1.at(-1).at, before_k: page1.at(-1).k })
ok(page1.length === 2 && page2.length === 2, 'paging returns full pages')
ok(page2.every((e) => e.at <= page1.at(-1).at), 'the second page continues below the first')
ok(!page2.some((e) => page1.some((p) => p.k === e.k)), 'no item is served twice')

// Filters still apply to the new events.
ok(call('recent_activity', O, { limit: 50, project_id: P }).every((e) => e.lead_id === LEAD), 'the project filter holds')
ok(call('recent_activity', O, { limit: 50, project_id: P }).some((e) => e.kind === 'lead_changed'), 'and keeps the change events')
ok(call('recent_activity', O, { limit: 50, source_id: 'src' }).every((e) => e.lead_id === LEAD), 'the source filter holds')
ok(call('recent_activity', O, { limit: 50 }).some((e) => e.kind === 'source_added'), 'sources still appear without a project')
ok(call('recent_activity', 'stranger', { limit: 50 }).length === 0, 'another user sees none of it')

console.log(failures ? `\n${failures} check(s) failed` : `\nall checks passed`)
process.exit(failures ? 1 : 0)
