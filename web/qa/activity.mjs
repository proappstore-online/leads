/**
 * Issue #12: the activity feed shows each item at its own time — several events on one lead, days
 * apart, never the lead's latest update time — and says so when a time was never recorded.
 *
 *   pnpm qa:activity
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  for (const dir of [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]) {
    if (!existsSync(dir)) continue
    for (const build of readdirSync(dir).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell',
        'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-headless-shell-linux/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const exe = join(dir, build, rel)
        if (existsSync(exe)) return exe
      }
    }
  }
  return null
}

let failures = 0
const ok = (pass, what) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${what}`)
  if (!pass) failures++
}

const exe = findChromium()
if (!exe) {
  console.error('No Chromium found. Run `npx playwright install chromium`, or set CHROMIUM_PATH.')
  process.exit(2)
}
const { chromium } = await import('playwright-core')
const port = await freePort()
const URL_BASE = `http://localhost:${port}/`
const server = spawn('npx', ['vite', '--config', here('./vite.config.ts'), '--port', String(port), '--strictPort'],
  { cwd: here('..'), stdio: 'ignore', env: { ...process.env, QA_FIXTURES: './fixtures/actions-activity.ts' } })
process.on('exit', () => server.kill())

try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false)
    if (!up) await new Promise((r) => setTimeout(r, 500))
  }
  if (!up) throw new Error(`the dev server did not start on ${URL_BASE}`)
  const browser = await chromium.launch({ executablePath: exe })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (e) => ok(false, `console error: ${e.message}`))
  await page.goto(URL_BASE)
  await page.waitForSelector('main')
  await page.locator('nav').getByRole('button', { name: 'Stats' }).click()
  await page.waitForSelector('text=Recent activity')
  await page.waitForTimeout(600)

  const items = await page.$$eval('section:has(h2) ol li', (els) => els.map((li) => ({
    stamp: li.querySelector('time')?.getAttribute('datetime') ?? null,
    shown: li.querySelector('time')?.textContent.trim() ?? '',
    text: li.textContent.trim(),
  })))
  ok(items.length === 6, `every event is listed (${items.length})`)

  const stamps = items.map((i) => (i.stamp ? Date.parse(i.stamp) : NaN))
  ok(stamps.every((s) => !Number.isNaN(s)), 'each item shows a time')
  ok(stamps.every((s, i) => i === 0 || s <= stamps[i - 1]), 'they run newest first')
  ok(new Set(stamps).size >= 5, `several events on one lead show different times (${new Set(stamps).size} distinct)`)

  // The lead row was last touched today; no item may claim that time.
  const today = new Date().toDateString()
  ok(!stamps.some((s) => new Date(s).toDateString() === today), 'no item is stamped today, when the lead row was last edited')

  ok(items.some((i) => /Status: contacted → replied/.test(i.text)), 'a change reads as what changed')
  ok(items.some((i) => /Status: new → contacted/.test(i.text)), 'an older change of the same field is its own item')
  ok(items.some((i) => /Note — Called, wants a demo/.test(i.text)), 'a note shows its text')
  ok(items.some((i) => /Needs attention: cleared → flagged/.test(i.text)), 'a flag reads as a change')
  ok(items.some((i) => /Added lead/.test(i.text)), 'the lead was added')

  const unknown = items.find((i) => /never recorded/.test(i.text) || /time not recorded/.test(i.text))
  ok(Boolean(unknown), 'an entry with no recorded time says so')
  ok(unknown && Date.parse(unknown.stamp) === stamps[stamps.length - 2], 'and it sits at the lead\'s creation, not at the top')
  await page.screenshot({ path: '/tmp/pw/12-activity.png' })
  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
