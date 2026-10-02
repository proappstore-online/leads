/** The real action adapter must understand the transactional action's wire response. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('../src/lib/actions.ts', import.meta.url), 'utf8')
  .replace("import { app } from './app'", 'const app = { actions: { call: async () => globalThis.actionReply } }')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { x } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
globalThis.actionReply = { results: [{ meta: { changes: 0 } }, { rows: [{ completed: 1 }], meta: { changes: 0 } }] }
assert.equal((await x('save_lead_form', {})).changes, 1)
console.log('PASS  #42: a completed batch receipt confirms a first save or a no-op retry')
for (const reply of [{ results: [] }, { results: [{ rows: [] }] }, { meta: { changes: 1 } }]) {
  globalThis.actionReply = reply
  await assert.rejects(x('save_lead_form', {}), /not confirmed/)
}
console.log('PASS  #42: missing completion evidence is never treated as a successful save')
globalThis.actionReply = { meta: { changes: 0 } }
assert.equal((await x('update_lead', {})).changes, 0)
console.log('PASS  existing execute metadata remains available to callers')

globalThis.actionReply = { results: [{ meta: { changes: 1 } }, { meta: { changes: 0 } }, { meta: { changes: 0 } }] }
assert.equal((await x('update_display_name', {})).changes, 1)
console.log('PASS  #40: a profile-only save confirms persistence without projects')
for (const reply of [{ results: [] }, { results: [{ meta: { changes: 0 } }, { meta: { changes: 1 } }] }, { meta: { changes: 1 } }]) {
  globalThis.actionReply = reply
  await assert.rejects(x('update_display_name', {}), /not confirmed/)
}
console.log('PASS  #40: missing profile persistence evidence never reports a successful save')
