/** #50: out-of-range or malformed timestamps never throw while rendering a lead or conversation. */
import { readFileSync, readdirSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/lead.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { isValidTime, isoTime, timeText, toInputValue, MAX_TIME_MS } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

const BAD = [9_000_000_000_000_000, -9_000_000_000_000_000, Number.NaN, Infinity, null, undefined, '1700000000000']
for (const value of BAD) {
  assert.equal(isValidTime(value), false, String(value))
  assert.equal(isoTime(value), undefined, String(value))
  assert.equal(timeText(value), 'Unknown time', String(value))
  if (typeof value === 'number') assert.equal(toInputValue(value), '', String(value))
}
console.log('PASS  #50: out-of-range, non-finite and non-number times render as unknown, without throwing')

assert.equal(MAX_TIME_MS, 8_640_000_000_000_000)
for (const edge of [MAX_TIME_MS, -MAX_TIME_MS]) {
  assert.equal(isValidTime(edge), true)
  assert.equal(isoTime(edge), new Date(edge).toISOString())
  assert.doesNotThrow(() => toInputValue(edge)) // the local-time shift may pass the edge: then empty, never a throw
}
console.log('PASS  #50: the Date range limits are usable and never throw')

const ms = Date.UTC(2026, 9, 2, 3, 4)
assert.equal(isoTime(ms), '2026-10-02T03:04:00.000Z')
assert.equal(toInputValue(ms), new Date(ms - new Date(ms).getTimezoneOffset() * 60_000).toISOString().slice(0, 16))
assert.equal(timeText(ms), new Date(ms).toLocaleString())
console.log('PASS  #50: normal times format exactly as before')

// No component formats a raw timestamp with toISOString: only the guarded helpers in lib/lead.ts do.
const dir = new URL('../src/components/', import.meta.url)
for (const file of readdirSync(dir)) {
  assert.ok(!readFileSync(new URL(file, dir), 'utf8').includes('.toISOString()'), `${file} calls toISOString directly`)
}
console.log('PASS  #50: lead and conversation rendering go through the guarded time helpers')
