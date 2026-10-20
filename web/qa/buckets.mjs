/** The Stats page's time buckets (lib/stats.ts): contiguous local-time [start, end) pairs ending now. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
const source = readFileSync(new URL('../src/lib/stats.ts', import.meta.url), 'utf8')
const { outputText } = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { buckets, RANGES } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)

// A Wednesday afternoon, and a Sunday - the week buckets must still start on a Monday.
for (const now of [new Date(2026, 9, 21, 15, 30), new Date(2026, 9, 25, 23, 59)]) {
  for (const [key, { unit, count }] of Object.entries(RANGES)) {
    const { pairs, labels } = buckets(key, now)
    assert.equal(pairs.length, count, `${key}: one pair per bucket`)
    assert.equal(labels.length, count, `${key}: one label per bucket`)
    for (let i = 1; i < pairs.length; i++) assert.equal(pairs[i][0], pairs[i - 1][1], `${key}: bucket ${i} starts where the last ended`)
    assert.ok(pairs.every(([s, e]) => s < e), `${key}: every bucket is non-empty`)
    const [start, end] = pairs.at(-1)
    assert.ok(start <= now.getTime() && now.getTime() < end, `${key}: the last bucket contains now`)
    assert.equal(labels.at(-1), unit === 'day' ? 'Today' : unit === 'week' ? 'This week' : 'This month')
    const first = new Date(pairs[0][0])
    assert.equal(first.getHours() + first.getMinutes(), 0, `${key}: buckets start at local midnight`)
    if (unit === 'week') assert.ok(pairs.every(([s]) => new Date(s).getDay() === 1), `${key}: weeks start on Monday`)
    if (unit === 'month') assert.ok(pairs.every(([s]) => new Date(s).getDate() === 1), `${key}: months start on the 1st`)
  }
}
console.log('PASS  #71: every range is contiguous local-time buckets ending with the current one')
