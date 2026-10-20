/** Stored JSON columns (tags, custom fields, history changes) never throw while rendering a lead. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/lead.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { leadTags, leadCustomFields, parseChanges } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

assert.deepEqual(leadTags({ tags: '["warm","investor"]' }), ['warm', 'investor'])
assert.deepEqual(leadTags({ tags: null }), [])
assert.deepEqual(leadTags({ tags: '{not json' }), [])
assert.deepEqual(leadTags({ tags: '{"a":1}' }), [])
assert.deepEqual(leadTags({ tags: '["ok",3,null]' }), ['ok'])
console.log('PASS  a malformed tags value reads as no tags, without throwing')

assert.deepEqual(leadCustomFields({ custom_fields: '{"Budget":5000,"Team":"AU"}' }), [['Budget', '5000'], ['Team', 'AU']])
assert.deepEqual(leadCustomFields({ custom_fields: null }), [])
assert.deepEqual(leadCustomFields({ custom_fields: 'nope' }), [])
assert.deepEqual(leadCustomFields({ custom_fields: '["x"]' }), [])
console.log('PASS  a malformed custom fields value reads as no fields, without throwing')

assert.deepEqual(parseChanges('{"status":["new","contacted"]}'), [['status', ['new', 'contacted']]])
assert.deepEqual(parseChanges(null), [])
assert.deepEqual(parseChanges('{broken'), [])
assert.deepEqual(parseChanges('{"status":"new","fit":[null,"high"]}'), [['fit', [null, 'high']]])
console.log('PASS  a malformed history change set is skipped, and a bad pair is dropped, without throwing')
