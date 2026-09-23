/**
 * Issue #11: every sort control in "Assigned to me" must reorder what is on screen, show which way
 * it is sorting, and keep the active filters — on the desktop table and on the phone.
 *
 *   pnpm qa:sorting
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
        'chrome-headless-shell-linux/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
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

/** First names in the order they are rendered: the table on a wide screen, the cards on a phone. */
async function names(page, wide) {
  const sel = wide ? 'table tbody tr td:first-child > div:first-child' : 'div.sm\\:hidden ul > li > div:first-child'
  return page.$$eval(sel, (els) => els.map((e) => e.textContent.trim().split(' ')[0]))
}

/** The column a table header says it is sorting by, and which way. */
async function headerState(page) {
  return page.$$eval('thead th', (els) => els
    .filter((th) => th.getAttribute('aria-sort'))
    .map((th) => `${th.textContent.trim().replace(/[↑↓]/g, '').trim()}:${th.getAttribute('aria-sort')}`))
}

async function assignedView(page) {
  await page.locator('nav').getByRole('button', { name: /^Assigned to me/ }).click()
  await page.waitForTimeout(500)
}

async function desktop(browser, URL_BASE) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  page.on('pageerror', (e) => ok(false, `console error: ${e.message}`))
  await page.goto(URL_BASE)
  await page.waitForSelector('table')
  await assignedView(page)

  const start = await names(page, true)
  ok(start.join() === 'Ann,Dan,Bob,Cara', `opens on the most recently changed (${start.join(', ')})`)

  await page.getByRole('button', { name: 'Sort by Name' }).click()
  await page.waitForTimeout(400)
  const asc = await names(page, true)
  ok(asc.join() === 'Ann,Bob,Cara,Dan', `Name sorts ascending (${asc.join(', ')})`)
  ok((await headerState(page)).includes('Name:ascending'), 'the Name column says ascending')

  await page.getByRole('button', { name: 'Sort by Name' }).click()
  await page.waitForTimeout(400)
  const desc = await names(page, true)
  ok(desc.join() === 'Dan,Cara,Bob,Ann', `clicking again reverses it (${desc.join(', ')})`)
  ok((await headerState(page)).includes('Name:descending'), 'the Name column says descending')
  ok((await headerState(page)).length === 1, 'only the sorted column claims a direction')

  for (const [label, expected] of [
    ['Status', 'Bob,Cara,Dan,Ann'],
    ['Fit', 'Bob,Cara,Ann,Dan'],
    ['Follow-up', 'Ann,Cara,Bob,Dan'],
    // A date column opens on the most recent first.
    ['Last contact', 'Cara,Bob,Dan,Ann'],
    ['Changed', 'Ann,Dan,Bob,Cara'],
  ]) {
    await page.getByRole('button', { name: `Sort by ${label}` }).click()
    await page.waitForTimeout(400)
    const got = await names(page, true)
    ok(got.join() === expected, `${label} reorders the rows (${got.join(', ')})`)
    ok((await headerState(page))[0]?.startsWith(label), `${label} shows its direction`)
  }

  // Sorting must not drop the filters the view is under.
  await page.getByLabel('Search leads').fill('cor')
  await page.waitForTimeout(600)
  await page.getByRole('button', { name: 'Sort by Name' }).click()
  await page.waitForTimeout(500)
  const filtered = await names(page, true)
  ok(filtered.join() === 'Cara', `search survives a sort (${filtered.join(', ') || 'no rows'})`)
  const sent = await page.evaluate(() => window.calls.filter((c) => c[0] === 'list_assigned_leads').at(-1)[1])
  ok(sent.q === 'cor' && sent.sort === 'name' && sent.project_id === 'p1',
    `the request keeps project, search and sort together (${JSON.stringify({ project: sent.project_id, q: sent.q, sort: sent.sort, dir: sent.dir })})`)
  await page.getByLabel('Search leads').fill('')
  await page.waitForTimeout(500)

  await page.getByLabel('Filter by status').selectOption('won')
  await page.waitForTimeout(500)
  await page.getByRole('button', { name: 'Sort by Name' }).click()
  await page.waitForTimeout(500)
  ok((await names(page, true)).join() === 'Ann', 'the status filter survives a sort too')
  await page.close()
}

async function phone(browser, URL_BASE) {
  const page = await browser.newPage({ viewport: { width: 375, height: 800 }, isMobile: true, hasTouch: true })
  page.on('pageerror', (e) => ok(false, `console error: ${e.message}`))
  await page.goto(URL_BASE)
  await page.waitForSelector('main')
  await assignedView(page)

  const picker = page.getByLabel('Sort leads')
  ok(await picker.inputValue() === 'updated', 'the phone picker shows the current sort')
  await picker.selectOption('name')
  await page.waitForTimeout(500)
  ok((await names(page, false)).join() === 'Ann,Bob,Cara,Dan', 'the picker reorders the cards')

  await page.getByRole('button', { name: /Ascending/ }).click()
  await page.waitForTimeout(500)
  ok((await names(page, false)).join() === 'Dan,Cara,Bob,Ann', 'the direction button reverses them')
  ok(await page.getByRole('button', { name: /Descending/ }).isVisible(), 'and it now offers ascending again')

  await picker.selectOption('status')
  await page.waitForTimeout(500)
  ok((await names(page, false)).join() === 'Bob,Cara,Dan,Ann', 'another column reorders the cards')

  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  ok(over <= 0, `sorting on a phone adds no sideways scrolling (+${over}px)`)
  await page.close()
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
  { cwd: here('..'), stdio: 'ignore', env: { ...process.env, QA_FIXTURES: './fixtures/actions-sorting.ts' } })
process.on('exit', () => server.kill())

try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false)
    if (!up) await new Promise((r) => setTimeout(r, 500))
  }
  if (!up) throw new Error(`the dev server did not start on ${URL_BASE}`)
  const browser = await chromium.launch({ executablePath: exe })
  await desktop(browser, URL_BASE)
  await phone(browser, URL_BASE)
  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
