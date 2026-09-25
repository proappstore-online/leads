/**
 * Turn JSONL rows from export_my_data into a transaction for a new, empty D1
 * recovery database. It deliberately emits plain INSERTs (not upserts): a
 * recovery target must be empty, otherwise the operator should stop rather
 * than merge an export into live data.
 */
import { readFileSync } from 'node:fs'

export const EXPORT_FORMAT = 'leads-export/v1'

export const SECTIONS = {
  leads: { table: 'leads', columns: ['id', 'user_id', 'name', 'title', 'company', 'email', 'phone', 'website', 'location', 'linkedin', 'twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'github', 'status', 'notes', 'created_at', 'updated_at', 'source', 'fit', 'source_url', 'found_at', 'needs_attention', 'attention_reason', 'attention_at', 'source_id', 'country', 'assigned_to_user_id', 'tags', 'custom_fields', 'next_action_at', 'next_action', 'history'] },
  lists: { table: 'lists', columns: ['id', 'user_id', 'name', 'purpose', 'created_at', 'project_id'] },
  memberships: { table: 'lead_list_memberships', columns: ['id', 'lead_id', 'list_id', 'user_id', 'created_at'] },
  messages: { table: 'messages', columns: ['id', 'user_id', 'lead_id', 'platform', 'direction', 'body', 'occurred_at', 'created_at', 'seq'] },
  sources: { table: 'sources', columns: ['id', 'user_id', 'name', 'kind', 'url', 'notes', 'created_at'] },
  projects: { table: 'projects', columns: ['id', 'user_id', 'name', 'description', 'owner_name', 'created_at'] },
  project_memberships: { table: 'project_memberships', columns: ['id', 'project_id', 'user_id', 'display_name', 'joined_at', 'created_at'] },
  project_invites: { table: 'project_invites', columns: ['code', 'project_id', 'created_by', 'expires_at', 'created_at'] },
  join_table_backfills: { table: 'join_table_backfills', columns: ['id', 'user_id', 'created_at'] },
  legacy_lead_lists: { table: 'lead_lists', columns: ['lead_id', 'list_id', 'user_id', 'created_at'] },
  legacy_project_members: { table: 'project_members', columns: ['project_id', 'user_id', 'display_name', 'joined_at'] },
}

const sameKeys = (value, keys) => {
  if (!value || Array.isArray(value) || typeof value !== 'object') return false
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, i) => key === expected[i])
}

function literal(value) {
  if (value === null) return 'NULL'
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value)
  throw new Error('export value must be a string, null, or safe integer')
}

/** Validate direct action output rows and produce INSERT statements. */
export function importSql(jsonl) {
  const statements = []
  for (const [lineNo, line] of jsonl.split(/\r?\n/).entries()) {
    if (!line.trim()) continue
    let record
    try { record = JSON.parse(line) } catch { throw new Error(`line ${lineNo + 1}: invalid JSON`) }
    if (record?.format !== EXPORT_FORMAT || typeof record.section !== 'string' || !(record.section in SECTIONS)) {
      throw new Error(`line ${lineNo + 1}: not a ${EXPORT_FORMAT} record`)
    }
    if (record.data === null) continue // the action emits this one-row empty-page marker
    let data
    try { data = typeof record.data === 'string' ? JSON.parse(record.data) : record.data } catch { throw new Error(`line ${lineNo + 1}: data is not JSON`) }
    const { table, columns } = SECTIONS[record.section]
    if (!sameKeys(data, columns)) throw new Error(`line ${lineNo + 1}: ${record.section} has an unexpected schema`)
    statements.push(`INSERT INTO \"${table}\" (${columns.map((column) => `\"${column}\"`).join(', ')}) VALUES (${columns.map((column) => literal(data[column])).join(', ')});`)
  }
  if (!statements.length) throw new Error('no export records to import')
  return ['BEGIN IMMEDIATE;', ...statements, 'COMMIT;', ''].join('\n')
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  try {
    process.stdout.write(importSql(readFileSync(0, 'utf8')))
  } catch (error) {
    console.error(`Recovery import refused: ${error.message}`)
    process.exitCode = 1
  }
}
