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
import { importSql, SECTIONS } from '../recovery/import.mjs'

const read = (p) => JSON.parse(readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8'))
const TOOLS = Object.fromEntries(read('../mcp.json').tools.map((t) => [t.name, t]))
const MIGRATIONS = read('../migrations.json').migrations

const db = new DatabaseSync(':memory:')
for (const m of MIGRATIONS) db.exec(m.sql)

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
  const terms = compoundTerms(sql)
  if (terms > 5) throw new Error(`${terms} terms in one compound SELECT, D1 allows 5`)
  return [bound, values]
}

/** Most terms in any one compound SELECT (UNION/INTERSECT/EXCEPT at the same paren depth, outside strings). Local SQLite allows 500, D1 only 5 (#13). */
function compoundTerms(sql) {
  const frames = [0]
  let max = 0
  for (const [tok] of sql.matchAll(/'(?:[^']|'')*'|\(|\)|\b(?:UNION|INTERSECT|EXCEPT)\b/gi)) {
    if (tok === '(') frames.push(0)
    else if (tok === ')') frames.pop()
    else if (tok[0] !== "'") max = Math.max(max, ++frames[frames.length - 1])
  }
  return max + 1
}

export function call(name, user, params = {}) {
  const tool = TOOLS[name]
  if (!tool) throw new Error(`no such action: ${name}`)
  const resolved = resolve(tool, params)
  if (tool.operation === 'batch') {
    db.exec('BEGIN IMMEDIATE')
    try {
      const results = tool.statements.map((s) => {
        const [sql, values] = bind(s, resolved, user)
        return db.prepare(sql).run(...values).changes
      })
      db.exec('COMMIT')
      return results
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
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

// The platform refuses to register any tool whose SQL holds a semicolon, even inside a string
// literal, and the whole deploy fails at that step.
const semicolons = Object.values(TOOLS).filter((t) => [t.sql ?? '', ...(t.statements ?? [])].some((s) => s.includes(';')))
ok(semicolons.length === 0, `no action SQL contains a semicolon (${semicolons.map((t) => t.name).join(', ') || 'none'})`)

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

// --- PAS-DATA-001/002: forward-only join-table replacement and compatibility backfill ---------
const replacement = MIGRATIONS.find((m) => m.name === '0010_join_table_replacements')
ok(replacement.name === '0010_join_table_replacements', 'the join-table replacement is an appended migration')
ok(!/\b(?:INSERT|UPDATE|DELETE|DROP|RENAME)\b/i.test(replacement.sql), 'the appended migration is schema-additive only')
ok(MIGRATIONS.find((m) => m.name === '0006_sources')?.sql.includes('INSERT INTO sources'), 'the deployed 0006 data migration remains unchanged')
const tableInfo = (table) => db.prepare(`PRAGMA table_info(${table})`).all()
for (const table of ['lead_list_memberships', 'project_memberships', 'join_table_backfills']) {
  const columns = tableInfo(table)
  ok(columns.some((c) => c.name === 'id' && c.type === 'TEXT' && c.pk === 1), `${table} has a stable TEXT primary key`)
  ok(columns.some((c) => c.name === 'created_at' && c.notnull === 1), `${table} has a required created_at`)
}

const LEGACY_LEAD = randomUUID()
const LEGACY_MEMBER = 'legacy-member'
const legacyAt = now - 3 * day
call('create_lead', O, { id: LEGACY_LEAD, name: 'Legacy Alice', country: 'AU' })
db.prepare('INSERT INTO lead_lists (lead_id, list_id, user_id, created_at) VALUES (?, ?, ?, ?)').run(LEGACY_LEAD, L, O, legacyAt)
db.prepare('INSERT INTO project_members (project_id, user_id, display_name, joined_at) VALUES (?, ?, ?, ?)').run(P, LEGACY_MEMBER, 'Legacy member', legacyAt)
const legacyBefore = {
  lists: db.prepare('SELECT * FROM lead_lists WHERE lead_id = ?').all(LEGACY_LEAD),
  members: db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').all(P, LEGACY_MEMBER),
}
const backfilled = call('backfill_legacy_join_tables', O)
ok(backfilled[0] === 1 && backfilled[1] === 1 && backfilled[2] === 1, `the backfill copies legacy joins once (${backfilled.join(',')})`)
const copiedList = db.prepare('SELECT * FROM lead_list_memberships WHERE lead_id = ? AND list_id = ?').get(LEGACY_LEAD, L)
const copiedMember = db.prepare('SELECT * FROM project_memberships WHERE project_id = ? AND user_id = ?').get(P, LEGACY_MEMBER)
ok(typeof copiedList?.id === 'string' && copiedList.id.length > 0 && copiedList.created_at === legacyAt, 'the list membership keeps its timestamp and gets a stable ID')
ok(typeof copiedMember?.id === 'string' && copiedMember.id.length > 0 && copiedMember.joined_at === legacyAt && copiedMember.created_at === legacyAt, 'the project membership keeps its timestamp and gets a stable ID')
ok(JSON.stringify(legacyBefore.lists) === JSON.stringify(db.prepare('SELECT * FROM lead_lists WHERE lead_id = ?').all(LEGACY_LEAD)) && JSON.stringify(legacyBefore.members) === JSON.stringify(db.prepare('SELECT * FROM project_members WHERE project_id = ? AND user_id = ?').all(P, LEGACY_MEMBER)), 'the backfill never mutates legacy rows')
ok(call('list_leads', O, { list_id: L, project_id: P, limit: 50 }).some((lead) => lead.id === LEGACY_LEAD), 'runtime list reads use the backfilled stable-ID membership')
ok(call('list_project_members', O, { project_id: P }).some((member) => member.user_id === LEGACY_MEMBER), 'runtime member reads use the backfilled stable-ID membership')
ok(call('remove_lead_from_list', O, { lead_id: LEGACY_LEAD, list_id: L, project_id: P }) === 1, 'a backfilled membership can be removed normally')
const againBackfill = call('backfill_legacy_join_tables', O)
ok(againBackfill.every((changes) => changes === 0), `the one-time backfill cannot resurrect a removed membership (${againBackfill.join(',')})`)
ok(!call('list_leads', O, { list_id: L, project_id: P, limit: 50 }).some((lead) => lead.id === LEGACY_LEAD), 'legacy source rows do not override later membership removal')
const unrelatedBackfill = call('backfill_legacy_join_tables', 'unrelated-backfill')
ok(JSON.stringify(unrelatedBackfill) === JSON.stringify([0, 0, 1, 0]) && db.prepare('SELECT count(*) AS n FROM lead_list_memberships WHERE user_id = ?').get('unrelated-backfill').n === 0 && db.prepare('SELECT count(*) AS n FROM project_memberships WHERE user_id = ?').get('unrelated-backfill').n === 0, 'a different user cannot backfill the owner’s legacy joins')
const legacyRuntimeReferences = Object.values(TOOLS).filter((tool) => !['backfill_legacy_join_tables', 'remove_project_member', 'leave_project', 'delete_my_data', 'export_my_data'].includes(tool.name)).filter((tool) => /\b(?:lead_lists|project_members)\b/.test((tool.sql ?? '') + (tool.statements ?? []).join(' ')))
ok(legacyRuntimeReferences.length === 0, 'only the explicit backfill, account purge and recovery export reference legacy join tables')

// --- #38: legacy relationships stay revoked regardless of caller order ---------------------
for (const first of ['owner', 'member', 'neither']) {
  for (const action of ['remove_project_member', 'leave_project']) {
    const owner = randomUUID(), member = randomUUID(), project = randomUUID()
    call('create_project', owner, { id: project, name: 'Revocation regression' })
    db.prepare('INSERT INTO project_members VALUES (?, ?, ?, ?)').run(project, member, 'Legacy', legacyAt)
    if (first !== 'neither') call('backfill_legacy_join_tables', first === 'owner' ? owner : member)
    call(action, action === 'leave_project' ? member : owner,
      action === 'leave_project' ? { project_id: project } : { project_id: project, user_id: member })
    call('backfill_legacy_join_tables', owner)
    call('backfill_legacy_join_tables', member)
    ok(!call('list_project_members', owner, { project_id: project }).some((m) => m.user_id === member),
      `#38 ${action} survives both backfills (${first} migrated first)`)
    call('create_project_invite', owner, { project_id: project })
    const code = call('list_project_invites', owner, { project_id: project })[0].code
    call('join_project', member, { code, display_name: 'Invited again' })
    ok(call('list_project_members', owner, { project_id: project }).some((m) => m.user_id === member),
      `#38 a fresh invite permits rejoining after ${action} (${first})`)
  }
}
// Simulate a revocation made by the old code, before relationship markers existed.
for (const first of ['owner', 'member']) {
  const owner = randomUUID(), member = randomUUID(), project = randomUUID()
  call('create_project', owner, { id: project, name: 'Previously revoked' })
  db.prepare('INSERT INTO project_members VALUES (?, ?, ?, ?)').run(project, member, 'Legacy', legacyAt)
  db.prepare('INSERT INTO join_table_backfills VALUES (?, ?, ?)').run(randomUUID(), first === 'owner' ? owner : member, now)
  call('backfill_legacy_join_tables', first === 'owner' ? member : owner)
  ok(call('list_project_members', owner, { project_id: project }).length === 0,
    `#38 pre-fix revocation survives the other caller (${first} marker)`)
}

// Four things happen to Alice, days apart, and the lead row is edited last of all.
call('set_lead_status', O, { id: LEAD, status: 'contacted' })
call('add_note', O, { id: LEAD, note: 'Called, wants a demo', client_mutation_id: randomUUID() })
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

// --- PAS-DATA-018: notes retain a caller retry key, but never expose it in normal reads --------
const RETRY_LEAD = randomUUID()
const RETRY_KEY = randomUUID()
call('create_lead', O, { id: RETRY_LEAD, name: 'Retry Alice', country: 'AU' })
const firstNote = call('add_note', O, { id: RETRY_LEAD, note: 'Called once', client_mutation_id: RETRY_KEY })
const afterFirstNote = db.prepare('SELECT history, updated_at FROM leads WHERE id = ?').get(RETRY_LEAD)
const retryNote = call('add_note', O, { id: RETRY_LEAD, note: 'Called once', client_mutation_id: RETRY_KEY })
const afterRetryNote = db.prepare('SELECT history, updated_at FROM leads WHERE id = ?').get(RETRY_LEAD)
const retryHistory = call('get_lead_history', O, { id: RETRY_LEAD })
const retryActivity = call('recent_activity', O, { limit: 50 })
ok(firstNote === 1 && retryNote === 0, `the exact note retry changes once (${firstNote}, ${retryNote})`)
ok(afterFirstNote.history === afterRetryNote.history && afterFirstNote.updated_at === afterRetryNote.updated_at, 'a duplicate retry leaves the durable note and lead timestamp unchanged')
ok(JSON.parse(afterRetryNote.history).filter((entry) => entry.note === 'Called once').length === 1, 'a retry leaves exactly one durable note')
ok(JSON.parse(afterRetryNote.history).some((entry) => entry.client_mutation_id === RETRY_KEY) && !JSON.stringify(retryHistory).includes(RETRY_KEY) && !JSON.stringify(retryActivity).includes(RETRY_KEY), 'the retry key is stored in history but absent from normal history and activity reads')
const anotherNote = call('add_note', O, { id: RETRY_LEAD, note: 'Called once', client_mutation_id: randomUUID() })
ok(anotherNote === 1 && call('get_lead_history', O, { id: RETRY_LEAD }).filter((entry) => entry.note === 'Called once').length === 2, 'different mutations retain intentionally repeated note text')
const CONTENDED_KEY = randomUUID()
const contenders = [
  call('add_note', O, { id: RETRY_LEAD, note: 'Concurrent retry', client_mutation_id: CONTENDED_KEY }),
  call('add_note', O, { id: RETRY_LEAD, note: 'Concurrent retry', client_mutation_id: CONTENDED_KEY }),
]
ok(JSON.stringify(contenders) === JSON.stringify([1, 0]) && JSON.parse(db.prepare('SELECT history FROM leads WHERE id = ?').get(RETRY_LEAD).history).filter((entry) => entry.client_mutation_id === CONTENDED_KEY).length === 1, 'contending same-key writes serialize to one note through the atomic update guard')
const tooLongKey = 'x'.repeat(129)
ok(call('add_note', O, { id: RETRY_LEAD, note: 'Refused', client_mutation_id: tooLongKey }) === 0, 'a mutation key over 128 characters is refused')

// --- PAS-OPS-014: every scoped export can be rebuilt into a clean recovery database ------------
const EXPORT_OTHER = 'export-other'
call('create_lead', EXPORT_OTHER, { id: randomUUID(), name: 'Must not export', country: 'NZ' })
const recoveryRows = []
for (const section of Object.keys(SECTIONS)) {
  let offset = 0
  let total = null
  do {
    const page = call('export_my_data', O, { section, limit: 2, offset })
    total ??= page[0]?.total
    const records = page.filter((record) => record.data !== null)
    recoveryRows.push(...records)
    offset += records.length
  } while (offset < total)
}
ok(recoveryRows.every((record) => record.format === 'leads-export/v1' && typeof record.data === 'string'), 'the scoped export is JSONL-ready and contains only record bodies')
ok(!JSON.stringify(recoveryRows).includes('Must not export'), 'the scoped export never includes another owner\'s rows')
ok(call('export_my_data', O, { section: 'leads', limit: 201 }).length === 0 && call('export_my_data', O, { section: 'not-a-section' }).length === 0, 'the registered export rejects an oversized page and unknown section')
const restored = new DatabaseSync(':memory:')
for (const m of MIGRATIONS) restored.exec(m.sql)
restored.exec(importSql(recoveryRows.map((record) => JSON.stringify(record)).join('\n')))
const scopeWhere = {
  lead_form_saves: 'user_id = ?',
  leads: 'user_id = ?', lists: 'user_id = ?', memberships: 'user_id = ?', messages: 'user_id = ?', sources: 'user_id = ?', projects: 'user_id = ?', join_table_backfills: 'user_id = ?', legacy_lead_lists: 'user_id = ?',
  legacy_project_membership_backfills: 'project_id IN (SELECT id FROM projects WHERE user_id = ?)',
  project_memberships: 'project_id IN (SELECT id FROM projects WHERE user_id = ?)', project_invites: 'project_id IN (SELECT id FROM projects WHERE user_id = ?)', legacy_project_members: 'project_id IN (SELECT id FROM projects WHERE user_id = ?)',
}
const ordered = (database, table, where) => database.prepare(`SELECT * FROM ${table} WHERE ${where}`).all(O).map((row) => JSON.stringify(row)).sort()
const recoveryMismatches = Object.entries(SECTIONS).filter(([section, { table }]) =>
  JSON.stringify(ordered(db, table, scopeWhere[section])) !== JSON.stringify(ordered(restored, table, scopeWhere[section]))).map(([section]) => section)
ok(recoveryMismatches.length === 0, `a complete paged export imports losslessly into an empty database (${recoveryMismatches.join(', ') || 'all sections'})`)
let unsafeImportRefused = false
try { importSql('{"format":"leads-export/v1","section":"leads","data":{"id":"only-one-field"}}') } catch { unsafeImportRefused = true }
ok(unsafeImportRefused, 'the recovery importer refuses incomplete or altered records')

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


// --- PAS-DATA-022: a stranger, armed with the owner's ids, gets nothing and changes nothing --------
//
// One cross-user negative per scoped action (platform#185). Every action in mcp.json is called as a
// user who owns nothing, with the OWNER's ids as its parameters. A read must return none of the
// owner's rows; a write must change nothing the owner has. The invariant is checked two ways so a
// dropped scoping predicate cannot hide: the stranger's result must not carry any owner id, and
// for reads it must differ from the owner's own result (a count of 0, not 2), and after the whole
// sweep every row the owner had is still there, byte for byte.
const S = 'stranger'
const MSG = randomUUID()
call('add_message', O, { id: MSG, lead_id: LEAD, platform: 'Email', direction: 'out', body: 'Following up', occurred_at: now })
call('create_project_invite', O, { project_id: P })
const CODE = db.prepare('SELECT code FROM project_invites WHERE project_id = ?').get(P).code
const OWNER_IDS = [P, L, LEAD, OTHER, LEGACY_LEAD, LEGACY_MEMBER, 'src', MSG, CODE]
const TABLES = ['lead_form_saves', 'leads', 'lists', 'lead_lists', 'lead_list_memberships', 'messages', 'project_invites', 'project_members', 'project_memberships', 'join_table_backfills', 'legacy_project_membership_backfills', 'projects', 'sources']
const snapshot = () => Object.fromEntries(TABLES.map((t) => [t, new Set(db.prepare(`SELECT * FROM ${t}`).all().map((r) => JSON.stringify(r)))]))
const before = snapshot()

/** What a stranger would try: the owner's ids for every id-shaped parameter, valid values elsewhere. */
const ARGS = {
  id: LEAD, lead_id: LEAD, list_id: L, project_id: P, to_project_id: P, source_id: 'src', code: CODE, user_id: O,
  request_id: randomUUID(), payload: JSON.stringify({ id: LEAD, name: 'Alice', country: 'AU', status: 'new', mode: 'update', lists: [], removed_lists: [], tags: '[]', fields: '{}' }),
  name: 'Alice', country: 'AU', kind: 'Reddit', platform: 'Email', direction: 'out', body: 'x', occurred_at: now,
  status: 'contacted', reason: 'x', note: 'x', client_mutation_id: 'cross-user-retry', action: 'call', at: now, fields: '{"a":1}', tags: '["t"]',
  messages: '[{"direction":"in","body":"x","occurred_at":1}]', lead_ids: JSON.stringify([LEAD]),
  q: 'Alice', limit: 50, buckets: JSON.stringify([[now - 30 * day, now + day]]), display_name: 'Eve',
}
/** Actions where a stranger's call is NOT a cross-user attempt, each with why. */
const SKIP = {
  how_to_use: 'static guidance, the same for every caller',
  save_lead_form: 'refusals throw to roll back the transaction; ownership and replay isolation are tested in #42',
  backfill_legacy_join_tables: 'creates only a caller-owned completion marker; its legacy-copy and isolation behaviour is tested above',
  get_project_invite: 'the invite code IS the grant — reading it by code is how joining works',
  join_project: 'the grant path; its one-shot behaviour is tested below',
  check_lead_links: 'validates the caller\'s own input and touches no rows',
  update_display_name: 'takes no ids and renames only the caller\'s own rows; tested below',
}
/** Executes where the stranger creates a row of their OWN (owner-less); it must carry the stranger's id. */
const SELF_CREATE = { create_project: 'projects', create_source: 'sources', create_lead: 'leads' }
const hasOwnerId = (v) => OWNER_IDS.some((id) => JSON.stringify(v).includes(id))
const argsFor = (tool, fresh) => {
  const out = {}
  for (const [name, schema] of Object.entries(tool.params ?? {})) {
    if (name === 'id' && fresh) { out.id = fresh; continue }
    if (name in ARGS) out[name] = ARGS[name]
    else if (!schema.optional) out[name] = schema.type === 'integer' ? 1 : schema.type === 'boolean' ? false : 'x'
  }
  return out
}
let swept = 0
for (const tool of Object.values(TOOLS)) {
  if (tool.name in SKIP) { console.log(`SKIP  ${tool.name} — ${SKIP[tool.name]}`); continue }
  swept++
  const fresh = tool.name in SELF_CREATE ? randomUUID() : undefined
  const params = argsFor(tool, fresh)
  let result
  try { result = call(tool.name, S, params) } catch (e) { ok(false, `${tool.name}: a stranger's call threw (${e.message})`); continue }
  if (tool.operation === 'query') {
    const owners = call(tool.name, O, params)
    const differs = JSON.stringify(result) !== JSON.stringify(owners)
    ok(!hasOwnerId(result) && (differs || owners.length === 0),
      `${tool.name}: a stranger with the owner's ids sees none of the owner's data (${result.length} row(s); owner sees ${owners.length})`)
  } else if (fresh) {
    // Named with the owner's ids (their source, say), the create is either refused or makes a row
    // that is the stranger's own — never one attached to the owner.
    const row = db.prepare(`SELECT user_id FROM ${SELF_CREATE[tool.name]} WHERE id = ?`).get(fresh)
    ok(row === undefined || (row.user_id === S && !hasOwnerId(row)),
      `${tool.name}: with the owner's ids a stranger's create is refused or is the stranger's own (${row ? 'created as ' + row.user_id : 'refused'})`)
    // And with nothing of the owner's, it works and is stamped with the caller — :__user_id, not a parameter.
    const own = randomUUID()
    const bare = Object.fromEntries(Object.entries(argsFor(tool, own)).filter(([, v]) => !hasOwnerId(v)))
    if ('name' in bare) bare.name = `own ${own.slice(0, 8)}` // sources refuse a duplicate name per user
    call(tool.name, S, bare)
    const mine = db.prepare(`SELECT user_id FROM ${SELF_CREATE[tool.name]} WHERE id = ?`).get(own)
    ok(mine?.user_id === S, `${tool.name}: a stranger's own create is stamped with the stranger's id`)
  } else {
    const changes = Array.isArray(result) ? result : [result]
    ok(changes.every((c) => c === 0), `${tool.name}: a stranger with the owner's ids changes nothing (${changes.join(',')})`)
  }
}
const after = snapshot()
ok(TABLES.every((t) => [...before[t]].every((row) => after[t].has(row))),
  'after the sweep every row the owner had is still there, unchanged')
ok(swept + Object.keys(SKIP).length === Object.keys(TOOLS).length && swept === Object.keys(TOOLS).length - Object.keys(SKIP).length,
  `every action in mcp.json was swept or named as an exception (${swept} swept, ${Object.keys(SKIP).length} skipped, ${Object.keys(TOOLS).length} total)`)

// The one grant a stranger may take — an invite code — is one-shot (PAS-DATA-008).
const joined = call('join_project', S, { code: CODE, display_name: 'Eve' })
ok(joined[0] === 1 && joined[1] === 1, `a valid invite admits the stranger and is consumed (${joined.join(',')})`)
const again = call('join_project', S, { code: CODE, display_name: 'Eve' })
ok(again.every((c) => c === 0), `the same code cannot be redeemed twice (${again.join(',')})`)
ok(call('list_project_members', O, { project_id: P }).filter((m) => m.user_id === S).length === 1, 'the owner sees the new member exactly once')
ok(call('get_project_invite', S, { code: CODE }).length === 0, 'a consumed code no longer resolves')

// #51: preview grants no access; redemption must be followed by an access check.
for (const scenario of ['revoked', 'consumed', 'expired', 'valid']) {
  const member = `join-51-${scenario}`
  call('create_project_invite', O, { project_id: P })
  const code = db.prepare('SELECT code FROM project_invites WHERE project_id = ? ORDER BY rowid DESC LIMIT 1').get(P).code
  ok(call('get_project_invite', member, { code }).length === 1, `#51 ${scenario}: invite resolves before submit`)
  if (scenario === 'revoked') call('revoke_project_invite', O, { code })
  if (scenario === 'consumed') call('join_project', 'join-51-winner', { code })
  if (scenario === 'expired') db.prepare('UPDATE project_invites SET expires_at = 0 WHERE code = ?').run(code)
  call('join_project', member, { code })
  ok(call('list_projects', member).some((p) => p.id === P) === (scenario === 'valid'),
    `#51 ${scenario}: access check distinguishes success from zero-change redemption`)
  if (scenario === 'valid') {
    call('join_project', member, { code })
    ok(call('list_projects', member).some((p) => p.id === P), '#51: retry of consumed code still confirms existing access')
  }
}

// #36: the profile's display name renames only the caller's own project and membership rows.
{
  const others = () => JSON.stringify(db.prepare('SELECT id, owner_name FROM projects WHERE user_id <> ? ORDER BY id').all(S))
    + JSON.stringify(db.prepare('SELECT id, display_name FROM project_memberships WHERE user_id <> ? ORDER BY id').all(S))
  const before = others()
  const renamed = call('update_display_name', S, { display_name: '  Sam Stranger  ' })
  ok(renamed[1] >= 1, `a member's rename reaches their memberships (${renamed.join(',')})`)
  ok(call('list_project_members', O, { project_id: P }).find((m) => m.user_id === S)?.display_name === 'Sam Stranger', 'the owner sees the member\'s new name, trimmed')
  ok(call('get_display_name', S)[0]?.name === 'Sam Stranger', 'get_display_name returns the name just set')
  ok(others() === before, 'nobody else\'s project or membership name changed')
  for (const bad of ['   ', 'x'.repeat(81)]) {
    const refused = call('update_display_name', S, { display_name: bad })
    ok(refused.every((c) => c === 0) && call('get_display_name', S)[0]?.name === 'Sam Stranger', `a ${bad.trim() ? '81-character' : 'blank'} name changes nothing (${refused.join(',')})`)
  }
  const ownerRenamed = call('update_display_name', O, { display_name: 'Olivia' })
  ok(ownerRenamed[0] >= 1 && call('list_projects', S).some((p) => p.id === P && p.owner_name === 'Olivia'), `a member sees the owner's new name on the shared project (${ownerRenamed.join(',')})`)
  ok(call('get_display_name', 'nobody-yet').length === 0, 'a user with no projects has no stored name')
}

// #37: every stats value the Stats page lets you open is exactly the number of rows list_leads
// returns for the same filter - per bucket, for the whole-range tiles and for the pipeline, with and
// without the page's source / list / project narrowing.
{
  const U = 'stats-drill'
  const d = 864e5
  const t0 = Date.UTC(2026, 0, 10)
  const PJ = randomUUID(), LI = randomUUID(), SRC = randomUUID()
  call('create_project', U, { id: PJ, name: 'Drill' })
  call('create_list', U, { id: LI, name: 'Drill list', project_id: PJ })
  call('create_source', U, { id: SRC, name: 'Drill source', kind: 'Event' })
  // [created day, status, fit, from SRC, in LI, flagged day, inbound message days, outbound message days]
  const seed = [
    [0, 'new', null, true, true, null, [], []],
    [0, 'contacted', 'high', false, true, 1, [], [0]],
    [1, 'replied', 'med', true, false, null, [1, 2], [1]],
    [2, 'replied', 'high', true, true, 2, [2], []],
    [2, 'won', 'low', false, false, null, [0, 3], [0]],
    [3, 'lost', null, true, true, 3, [], [3]],
    [-5, 'qualified', 'med', false, true, null, [3], []], // before the range, replied inside it
  ]
  for (const [i, [created, status, fit, fromSrc, inList, flagged, ins, outs]] of seed.entries()) {
    const id = `drill-${i}`
    call('create_lead', U, { id, name: `Drill ${i}`, country: 'AU', status, fit, source_id: fromSrc ? SRC : null })
    if (inList) call('add_lead_to_list', U, { lead_id: id, list_id: LI, project_id: PJ })
    db.prepare('UPDATE leads SET created_at = ?, needs_attention = ?, attention_at = ? WHERE id = ?')
      .run(t0 + created * d + 3600e3, flagged === null ? 0 : 1, flagged === null ? null : t0 + flagged * d + 7200e3, id)
    for (const [dir, days] of [['in', ins], ['out', outs]]) {
      for (const day of days) call('add_message', U, { id: randomUUID(), lead_id: id, platform: 'Email', direction: dir, body: 'x', occurred_at: t0 + day * d + 60e3 })
    }
  }
  const pairs = [0, 1, 2, 3].map((k) => [t0 + k * d, t0 + (k + 1) * d])
  const whole = [[pairs[0][0], pairs[3][1]]]
  const rows = (params) => call('list_leads', U, { limit: 500, ...params }).length
  for (const [scope, filters] of [
    ['everything', {}],
    ['one source', { source_id: SRC }],
    ['no source', { source_id: 'none' }],
    ['one list', { list_id: LI, project_id: PJ }],
    ['one project', { project_id: PJ }],
  ]) {
    const buckets = call('stats_timeline', U, { buckets: JSON.stringify(pairs), ...filters })
    const tiles = call('stats_timeline', U, { buckets: JSON.stringify(whole), ...filters })[0]
    const pipe = call('stats_pipeline', U, filters)[0]
    const checks = []
    pairs.forEach(([from, before], k) => {
      checks.push([`leads added, day ${k}`, buckets[k].leads_added, rows({ ...filters, created_from: from, created_before: before })])
      checks.push([`leads who replied, day ${k}`, buckets[k].leads_replied, rows({ ...filters, replied_from: from, replied_before: before })])
    })
    const [from, before] = whole[0]
    checks.push(['leads added tile', tiles.leads_added, rows({ ...filters, created_from: from, created_before: before })])
    checks.push(['leads who replied tile', tiles.leads_replied, rows({ ...filters, replied_from: from, replied_before: before })])
    checks.push(['flags raised tile', tiles.flagged, rows({ ...filters, flagged_from: from, flagged_before: before })])
    checks.push(['pipeline total', pipe.total, rows(filters)])
    for (const s of ['new', 'contacted', 'replied', 'qualified', 'won', 'lost']) checks.push([`pipeline ${s}`, pipe[`status_${s}`], rows({ ...filters, status: s })])
    for (const f of ['high', 'med', 'low']) checks.push([`pipeline ${f} fit`, pipe[`fit_${f}`], rows({ ...filters, fit: f })])
    checks.push(['pipeline not rated', pipe.fit_none, rows({ ...filters, fit: 'none' })])
    checks.push(['pipeline needs attention', pipe.needs_attention, rows({ ...filters, needs_attention: true })])
    checks.push(['pipeline with a conversation', pipe.with_conversation, rows({ ...filters, has_messages: true })])
    checks.push(['pipeline replied', pipe.replied, rows({ ...filters, replied_from: 0 })])
    const wrong = checks.filter(([, stat, listed]) => stat !== listed)
    ok(wrong.length === 0, `stats values match their list_leads rows - ${scope} (${checks.length} values${wrong.length ? `; ${wrong.map(([w, a, b]) => `${w}: ${a} vs ${b}`).join('; ')}` : ''})`)
    ok(checks.some(([, stat]) => stat > 0), `the ${scope} fixture has non-zero values to compare`)
  }
  ok(rows({ replied_from: pairs[1][0], replied_before: pairs[1][1] }) === 1 && rows({ created_from: pairs[0][0], created_before: pairs[0][1] }) === 2, 'the drill-down filters pick the expected leads')
  ok(call('list_leads', 'someone-else', { created_from: 0, replied_from: 0, has_messages: true, fit: 'none', limit: 500 }).length === 0, 'the drill-down filters never reach another user\'s leads')
}

// PAS-OPS-017 (platform#186): delete_my_data leaves NO row for that user in any table, and
// nobody else's rows change except the two cross-user links it must sever (assignment, project
// attachment). Runs AFTER the sweep so the owner's fixture is complete and the invariant above
// has already been checked.
{
  const G = 'goner'
  const GP = randomUUID(), GS = randomUUID(), GL = randomUUID(), GLIST = randomUUID(), GMSG = randomUUID()
  call('create_project', G, { id: GP, name: 'Goner project' })
  call('create_source', G, { id: GS, name: 'Goner source', kind: 'Reddit' })
  call('create_lead', G, { id: GL, name: 'Goner lead', country: 'AU', source_id: GS })
  call('create_list', G, { id: GLIST, name: 'Goner list', purpose: 'x', project_id: GP })
  call('add_lead_to_list', G, { lead_id: GL, list_id: GLIST, project_id: GP })
  call('add_message', G, { id: GMSG, lead_id: GL, platform: 'Email', direction: 'out', body: 'hi', occurred_at: now })
  call('create_project_invite', G, { project_id: GP })
  // Cross-user links: the goner is a member of the owner's project, is assigned one of the owner's
  // leads, and the owner has a list attached to the goner's project.
  db.prepare('INSERT INTO project_memberships (id, project_id, user_id, display_name, joined_at, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(randomUUID(), P, G, 'Goner', now, now)
  db.prepare('UPDATE leads SET assigned_to_user_id = ? WHERE id = ?').run(G, OTHER)
  const OL = randomUUID()
  // Inserted directly: create_list rightly refuses a project the caller is not a member of.
  db.prepare('INSERT INTO lists (id, user_id, name, purpose, created_at, project_id) VALUES (?, ?, ?, ?, ?, ?)').run(OL, O, 'Owner list in goner project', 'x', now, GP)
  call('backfill_legacy_join_tables', G)
  const ownerBefore = snapshot()
  const rowsFor = (user) => Object.fromEntries(TABLES.map((t) => {
    const col = t === 'project_invites' ? 'created_by' : 'user_id'
    return [t, db.prepare(`SELECT count(*) AS n FROM ${t} WHERE ${col} = ?`).get(user).n]
  }))
  ok(Object.values(rowsFor(G)).some((n) => n > 0), 'fixture: the goner holds rows before deletion')

  const wrong = call('delete_my_data', G, { confirm: 'delete my data' })
  ok(wrong.every((c) => c === 0), `delete_my_data with the wrong phrase changes nothing (${wrong.join(',')})`)

  const gone = call('delete_my_data', G, { confirm: 'DELETE MY DATA' })
  ok(gone.some((c) => c > 0), `delete_my_data with the exact phrase deletes (${gone.join(',')})`)
  const left = rowsFor(G)
  ok(Object.values(left).every((n) => n === 0), `no row for the deleted user remains in any table (${JSON.stringify(left)})`)
  ok(db.prepare('SELECT count(*) AS n FROM lead_list_memberships WHERE lead_id = ? OR list_id = ?').get(GL, GLIST).n === 0, 'no stable-ID memberships reference the deleted leads or lists')
  ok(db.prepare('SELECT count(*) AS n FROM messages WHERE lead_id = ?').get(GL).n === 0, 'no messages reference the deleted leads')
  ok(db.prepare('SELECT count(*) AS n FROM project_invites WHERE project_id = ?').get(GP).n === 0, 'no invites reference the deleted project')
  ok(db.prepare('SELECT assigned_to_user_id FROM leads WHERE id = ?').get(OTHER).assigned_to_user_id === null, "the owner's lead assigned to the deleted user is unassigned, not deleted")
  ok(db.prepare('SELECT project_id FROM lists WHERE id = ?').get(OL).project_id === null, "the owner's list attached to the deleted project is detached, not deleted")
  const ownerAfter = snapshot()
  const untouched = ['leads', 'lists', 'sources', 'messages', 'projects'].every((t) =>
    [...ownerBefore[t]].filter((r) => { const row = JSON.parse(r); return (row.user_id === O) && !(t === 'leads' && row.id === OTHER) && !(t === 'lists' && row.id === OL) }).every((r) => ownerAfter[t].has(r)))
  ok(untouched, "every other row of the owner's is still there, unchanged")
}

// #42: an atomic form save survives refused stages and uncertain transport outcomes.
{
  const user = 'atomic-form-owner'
  const id = randomUUID()
  const request = randomUUID()
  call('create_project', user, { id: request, name: 'Atomic' })
  call('create_list', user, { id: request, project_id: request, name: 'Atomic list' })
  const payload = { id, name: 'Atomic lead', country: 'AU', status: 'new', mode: 'create', lists: [{ id: request, project_id: request }], removed_lists: [], tags: '["warm"]', fields: '{"Budget":"5k"}' }
  const save = (value = payload, key = request) => call('save_lead_form', user, { request_id: key, payload: JSON.stringify(value) })
  const state = () => JSON.stringify(['leads', 'lead_list_memberships', 'lead_form_saves'].map((t) => db.prepare(`SELECT * FROM ${t} WHERE user_id = ? ORDER BY id`).all(user)))
  const refused = (value, label) => {
    const before = state()
    let threw = false
    try { save(value) } catch { threw = true }
    ok(threw && state() === before, label)
  }
  if (!TOOLS.save_lead_form) {
    ok(false, '#42: transactional save_lead_form action exists')
  } else {
    refused({ ...payload, lists: [{ id: request, project_id: 'wrong' }] }, '#42: refused membership rolls back the entire save')
    refused({ ...payload, tags: '[42]' }, '#42: refused tags roll back the entire save')
    refused({ ...payload, fields: '{"Budget":[]}' }, '#42: refused fields roll back the entire save')
    refused({ ...payload, country: 'XX' }, '#42: refused lead rolls back the entire save')
    const tool = TOOLS.save_lead_form
    const statements = tool.statements
    for (let stage = 1; stage <= statements.length; stage++) {
      const before = state()
      tool.statements = [...statements.slice(0, stage), "INSERT INTO leads (id) VALUES (:request_id)", ...statements.slice(stage)]
      let threw = false
      try { save() } catch { threw = true }
      ok(threw && state() === before, `#42: failure after statement ${stage} rolls back all writes`)
    }
    tool.statements = statements
    save()
    const committed = state()
    let identityConflict = false
    try { save(payload, randomUUID()) } catch { identityConflict = true }
    ok(identityConflict && state() === committed, '#42: a different request key cannot create the same form lead twice')
    save() // Simulate a committed request whose response was lost.
    ok(state() === committed, '#42: create retry is a no-op, including history and memberships')
    ok(db.prepare('SELECT count(*) AS n FROM leads WHERE user_id = ?').get(user).n === 1, '#42: retry creates exactly one lead without email or profiles')
    refused({ ...payload, name: 'different' }, '#42: an idempotency key cannot be reused for another payload')
    const row = db.prepare('SELECT * FROM leads WHERE id = ?').get(id)
    ok(JSON.parse(row.tags)[0] === 'warm' && JSON.parse(row.custom_fields).Budget === '5k' && db.prepare('SELECT count(*) AS n FROM lead_list_memberships WHERE lead_id = ?').get(id).n === 1, '#42: successful save includes lists, tags and fields')
    const edit = { ...payload, mode: 'update', name: 'Updated', if_unchanged_since: row.updated_at, lists: [], removed_lists: payload.lists }
    for (let stage = 1; stage <= statements.length; stage++) {
      const before = state()
      tool.statements = [...statements.slice(0, stage), "INSERT INTO leads (id) VALUES (:request_id)", ...statements.slice(stage)]
      let threw = false
      try { save(edit, randomUUID()) } catch { threw = true }
      ok(threw && state() === before, `#42: edit failure after statement ${stage} rolls back all writes`)
    }
    tool.statements = statements
    save(edit, randomUUID())
    const stale = state()
    let conflict = false
    try { save({ ...edit, if_unchanged_since: -1 }, randomUUID()) } catch { conflict = true }
    ok(conflict && state() === stale, '#42: stale edit leaves the whole save unchanged')
    const editKey = randomUUID()
    edit.if_unchanged_since = db.prepare('SELECT updated_at FROM leads WHERE id = ?').get(id).updated_at
    save(edit, editKey)
    const edited = state()
    save(edit, editKey)
    ok(state() === edited, '#42: update retry succeeds with its original conflict token')
    ok(db.prepare('SELECT count(*) AS n FROM lead_list_memberships WHERE lead_id = ?').get(id).n === 0, '#42: selected list removal is saved')
    const isolated = state()
    for (const key of [request, randomUUID()]) {
      let refused = false
      try { call('save_lead_form', 'atomic-stranger', { request_id: key, payload: JSON.stringify(edit) }) } catch { refused = true }
      ok(refused && state() === isolated, '#42: another user cannot replay a receipt or edit the lead')
    }
    const exported = call('export_my_data', user, { section: 'lead_form_saves' }).filter((r) => r.data !== null)
    ok(exported.length === 3, '#42: completed retry receipts are included in recovery export')
    call('delete_lead', user, { id })
    save() // A delayed retry must not resurrect a deleted contact.
    ok(!db.prepare('SELECT id FROM leads WHERE id = ?').get(id), '#42: delayed creation retry never resurrects a deleted lead')
    call('delete_my_data', user, { confirm: 'DELETE MY DATA' })
    ok(db.prepare('SELECT count(*) AS n FROM lead_form_saves WHERE user_id = ?').get(user).n === 0, '#42: delete_my_data removes the durable receipts')
  }
}

// #48: deduplication counts occurrences independently for each resolved platform.
{
  const user = 'bulk-platform-owner'
  const lead = randomUUID()
  call('create_lead', user, { id: lead, name: 'Platform threads', country: 'AU' })
  const message = { direction: 'out', occurred_at: 1, body: 'same' }
  const add = (messages, platform = 'Email') => call('add_messages', user, { lead_id: lead, platform, messages: JSON.stringify(messages) })
  const rows = () => call('list_messages', user, { lead_id: lead })
  call('add_message', user, { id: randomUUID(), lead_id: lead, platform: 'Email', ...message })
  ok(add([{ ...message, platform: 'SMS' }]) === 1, '#48: stored Email does not suppress matching SMS')
  ok(add([{ ...message, platform: 'SMS' }]) === 0, '#48: retry of matching SMS adds nothing')
  const mixed = [{ ...message, platform: 'SMS' }, message, { ...message, platform: 'SMS' }, { ...message, platform: 'Email' }, message]
  ok(add(mixed) === 3, '#48: mixed batch adds only missing occurrences per platform')
  ok(rows().filter((m) => m.platform === 'Email').length === 3 && rows().filter((m) => m.platform === 'SMS').length === 2, '#48: default and explicit Email share a key while SMS counts independently')
  const snapshot = JSON.stringify(rows())
  ok(add(mixed) === 0 && JSON.stringify(rows()) === snapshot, '#48: mixed-platform retry preserves every stored row')
  const fresh = { ...message, occurred_at: 2 }
  const thread = [{ ...fresh, platform: 'SMS' }, fresh, { ...fresh, platform: 'SMS' }, fresh]
  ok(add(thread) === 4, '#48: fresh mixed batch preserves intentional repeats on both platforms')
  ok(JSON.stringify(rows().filter((m) => m.occurred_at === 2).map((m) => m.platform)) === JSON.stringify(['SMS', 'Email', 'SMS', 'Email']), '#48: mixed-platform messages retain input order')
  ok(add(thread) === 0, '#48: fresh mixed batch retry adds nothing')
  ok(add([{ ...message, occurred_at: 3 }], 'SMS') === 1 && add([{ ...message, occurred_at: 3 }], 'Email') === 1, '#48: changing the action default records a distinct platform')
  ok(add([{ ...message, occurred_at: 3, platform: 'SMS' }], 'Email') === 0, '#48: explicit platform overrides the action default during deduplication')
  ok(add([{ ...message, occurred_at: 4 }, { ...message, platform: 'invalid' }]) === 0 && !rows().some((m) => m.occurred_at === 4), '#48: invalid platform still rejects the whole batch')
}

// #46: browser authority separators must never bypass platform-domain validation.
for (const [field, domains] of Object.entries({ linkedin: ['linkedin.com'], twitter: ['x.com', 'twitter.com'], instagram: ['instagram.com'], facebook: ['facebook.com', 'fb.com', 'fb.me'], tiktok: ['tiktok.com'], youtube: ['youtube.com', 'youtu.be'], github: ['github.com'] })) {
  for (const domain of domains) {
    const owner = `url-${domain}`
    const id = randomUUID()
    call('create_lead', owner, { id, name: 'URL test', country: 'AU' })
    for (const value of [`https://evil.example\\foo.${domain}/profile`, `https://evil.example?foo.${domain}/profile`, `https://evil.example#foo.${domain}/profile`, `https://user@www.${domain}/profile`, `https://www.${domain}/pro\\file`, `https://www.${domain}/pro\tfile`, `https://www.${domain}/pro\nfile`, `https://www.${domain}/pro\u0000file`]) {
      ok(call('check_lead_links', owner, { [field]: value })[0][field].startsWith('REJECTED'), `#46: ${domain} diagnostic rejects ${JSON.stringify(value)}`)
      ok(call('create_lead', owner, { id: randomUUID(), name: 'Bad URL', country: 'AU', [field]: value }) === 0, `#46: ${domain} create rejects unsafe URL`)
      for (const action of ['update_lead', 'enrich_lead']) {
        ok(call(action, owner, { id, name: 'URL test', [field]: value }) === 0, `#46: ${domain} ${action} rejects unsafe URL`)
      }
      for (const mode of ['create', 'update']) {
        let rejected = false
        try { call('save_lead_form', owner, { request_id: randomUUID(), payload: JSON.stringify({ mode, id: mode === 'create' ? randomUUID() : id, name: 'URL test', country: 'AU', [field]: value, lists: [], removed_lists: [], tags: '[]', fields: '{}' }) }) } catch { rejected = true }
        ok(rejected, `#46: ${domain} atomic ${mode} rejects unsafe URL`)
      }
    }
    for (const value of [`https://${domain}/profile`, `HTTPS://WWW.${domain.toUpperCase()}/profile?tab=1#about`]) {
      ok(call('check_lead_links', owner, { [field]: value })[0][field] === 'ok', `#46: ${domain} accepts valid profile URL`)
      ok(call('update_lead', owner, { id, name: 'URL test', [field]: value }) === 1, `#46: ${domain} stores valid profile URL`)
    }
  }
}

// #52: source changes and automatic unassignments are recorded in the lead history and activity feed.
{
  const lastEntry = (lead) => JSON.parse(db.prepare('SELECT history FROM leads WHERE id = ?').get(lead).history).at(-1)
  const historyLength = (lead) => JSON.parse(db.prepare('SELECT history FROM leads WHERE id = ?').get(lead).history).length
  const changeIn = (owner, lead, via) => call('recent_activity', owner, { limit: 50 }).some((e) => e.kind === 'lead_changed' && e.lead_id === lead) && call('get_lead_history', owner, { id: lead })[0].via === via

  /** A lead in a project list, assigned to a collaborator who joined that project. */
  function assigned() {
    const owner = randomUUID(), member = randomUUID(), project = randomUUID(), list = randomUUID(), lead = randomUUID()
    call('create_project', owner, { id: project, name: '#52 project' })
    call('create_list', owner, { id: list, name: '#52 list', project_id: project })
    call('create_lead', owner, { id: lead, name: '#52 lead', country: 'AU' })
    call('add_lead_to_list', owner, { lead_id: lead, list_id: list, project_id: project })
    call('create_project_invite', owner, { project_id: project })
    call('join_project', member, { code: call('list_project_invites', owner, { project_id: project })[0].code, display_name: 'Helper' })
    ok(call('assign_lead', owner, { id: lead, user_id: member }) === 1, '#52 setup: the collaborator is assigned')
    return { owner, member, project, list, lead }
  }
  const unassigned = ({ owner, member, lead }, via, by) => {
    const entry = lastEntry(lead)
    ok(db.prepare('SELECT assigned_to_user_id AS a FROM leads WHERE id = ?').get(lead).a === null, `#52 ${via} unassigns the collaborator`)
    ok(entry.via === via && entry.by === by && JSON.stringify(entry.changes) === JSON.stringify({ assigned_to_user_id: [member, null] }) && typeof entry.at === 'number',
      `#52 ${via} records the unassignment in the lead history`)
    ok(changeIn(owner, lead, via), `#52 ${via} shows the unassignment in history and recent activity`)
  }

  let a = assigned()
  call('remove_project_member', a.owner, { project_id: a.project, user_id: a.member })
  unassigned(a, 'remove_project_member', a.owner)

  a = assigned()
  call('leave_project', a.member, { project_id: a.project })
  unassigned(a, 'leave_project', a.member)

  a = assigned()
  call('delete_list', a.owner, { id: a.list, project_id: a.project })
  unassigned(a, 'delete_list', a.owner)

  a = assigned()
  const elsewhere = randomUUID()
  call('create_project', a.owner, { id: elsewhere, name: '#52 other project' })
  call('set_list_project', a.owner, { id: a.list, project_id: a.project, to_project_id: elsewhere })
  unassigned(a, 'set_list_project', a.owner)

  // delete_project only runs on an empty project; its sweep catches an assignment left stale.
  a = assigned()
  db.prepare('DELETE FROM lead_list_memberships WHERE lead_id = ?').run(a.lead)
  db.prepare('DELETE FROM lists WHERE id = ?').run(a.list)
  call('delete_project', a.owner, { id: a.project })
  unassigned(a, 'delete_project', a.owner)

  // Leads still reachable keep their assignee and gain no history entry.
  a = assigned()
  const before = historyLength(a.lead)
  call('remove_project_member', a.owner, { project_id: a.project, user_id: randomUUID() })
  ok(historyLength(a.lead) === before, '#52 a cleanup that changes nothing adds no history entry')

  // Sources.
  const owner = randomUUID(), s1 = randomUUID(), s2 = randomUUID(), l1 = randomUUID(), l2 = randomUUID()
  call('create_source', owner, { id: s1, name: '#52 source one', kind: 'Event' })
  call('create_source', owner, { id: s2, name: '#52 source two', kind: 'Event' })
  call('create_lead', owner, { id: l1, name: '#52 no source', country: 'AU' })
  call('create_lead', owner, { id: l2, name: '#52 already s2', country: 'AU', source_id: s2 })
  const l2Before = historyLength(l2)
  call('assign_leads_to_source', owner, { source_id: s2, lead_ids: JSON.stringify([l1, l2]) })
  ok(JSON.stringify(lastEntry(l1).changes) === JSON.stringify({ source_id: [null, s2] }) && lastEntry(l1).via === 'assign_leads_to_source' && lastEntry(l1).by === owner,
    '#52 assign_leads_to_source records the source change')
  ok(changeIn(owner, l1, 'assign_leads_to_source'), '#52 assign_leads_to_source shows in history and recent activity')
  ok(historyLength(l2) === l2Before, '#52 assign_leads_to_source records only leads whose source actually changed')
  call('assign_leads_to_source', owner, { source_id: s1, lead_ids: JSON.stringify([l2]) })
  ok(JSON.stringify(lastEntry(l2).changes) === JSON.stringify({ source_id: [s2, s1] }), '#52 moving between sources records old and new')
  call('assign_leads_to_source', owner, { source_id: 'none', lead_ids: JSON.stringify([l1]) })
  ok(JSON.stringify(lastEntry(l1).changes) === JSON.stringify({ source_id: [s2, null] }), '#52 clearing the source records it')

  // Deleting a source records the cleared source on every lead it held, keeping the 300-entry cap.
  db.prepare('UPDATE leads SET history = ? WHERE id = ?').run(JSON.stringify(Array.from({ length: 300 }, (_, i) => ({ at: i, by: owner, via: 'seed', changes: { status: ['new', 'new'] } }))), l2)
  call('delete_source', owner, { id: s1 })
  const capped = JSON.parse(db.prepare('SELECT history, source_id FROM leads WHERE id = ?').get(l2).history)
  ok(capped.length === 300 && capped[0].at === 1 && capped.at(-1).via === 'delete_source' && JSON.stringify(capped.at(-1).changes) === JSON.stringify({ source_id: [s1, null] }),
    '#52 delete_source records the cleared source and keeps the 300-entry cap')
  ok(changeIn(owner, l2, 'delete_source'), '#52 delete_source shows in history and recent activity')
}

console.log(failures ? `\n${failures} check(s) failed` : `\nall checks passed`)
process.exit(failures ? 1 : 0)
