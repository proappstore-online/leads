/**
 * Issue #37: a Stats value opens a popup of exactly the leads behind it, drawn with the leads page's
 * own LeadFilters and LeadTable, and the popup behaves as a dialog - focus stays in it, Escape
 * closes it and focus goes back to the value that opened it.
 *
 *   pnpm qa:stats
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
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
  { cwd: here('..'), stdio: 'ignore', env: { ...process.env, QA_FIXTURES: './fixtures/actions-stats.ts' } })
process.on('exit', () => server.kill())

try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false)
    if (!up) await new Promise((r) => setTimeout(r, 500))
  }
  if (!up) throw new Error(`the dev server did not start on ${URL_BASE}`)

  // The popup is the leads page's own components with a filter, not a table of its own.
  const popup = readFileSync(here('../src/components/StatsLeads.tsx'), 'utf8')
  ok(/import \{ LeadTable \} from '\.\/LeadTable'/.test(popup) && /import \{ LeadFilters \} from '\.\/LeadFilters'/.test(popup) && /import \{ Modal \} from '\.\/Modal'/.test(popup),
    'the popup is built from the shared LeadTable, LeadFilters and Modal')
  ok(!/<(table|tr|td|th|ul|li)\b/.test(popup), 'the popup draws no table or list rows of its own')
  ok(/<LeadFilters\b/.test(readFileSync(here('../src/App.tsx'), 'utf8')), 'the leads page uses the same LeadFilters')

  const browser = await chromium.launch({ executablePath: exe })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (e) => ok(false, `console error: ${e.message}`))
  await page.goto(URL_BASE)
  await page.waitForSelector('main')
  await page.locator('nav').getByRole('button', { name: 'Stats' }).click()
  await page.waitForSelector('text=Pipeline now')

  const dialog = page.getByRole('dialog')
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent ?? '')
  const lastList = () => page.evaluate(() => window.calls.filter((c) => c[0] === 'list_leads').at(-1)?.[1])
  const count = (label) => Number(/: (\d+) leads?/.exec(label)?.[1])
  const rows = async () => { await page.waitForTimeout(450); return dialog.locator('tbody tr').count() }

  // Chart: real buttons, one tab stop, arrow keys move between periods.
  const bars = page.getByRole('group', { name: /^Leads added by period/ }).getByRole('button')
  ok(await bars.count() === 30, `the Leads added chart has a button per day (${await bars.count()})`)
  ok(await bars.evaluateAll((els) => els.filter((b) => b.tabIndex === 0).length) === 1, 'the chart is a single tab stop')
  await bars.last().focus()
  ok(/^Leads added, Today: 3 leads$/.test(await focused()), `a bar is named by chart, period and value (${await focused()})`)
  await page.keyboard.press('ArrowLeft')
  ok(/^Leads added, .+: 1 lead$/.test(await focused()), `ArrowLeft moves to yesterday (${await focused()})`)
  await page.keyboard.press('End')
  const opener = await focused()
  ok(opener === 'Leads added, Today: 3 leads', 'End moves to the last period')

  // Enter on the bar opens exactly its leads, through the shared components.
  await page.keyboard.press('Enter')
  await dialog.waitFor()
  ok(await dialog.getAttribute('aria-label') === 'Leads added · Today', `the popup is titled after the value (${await dialog.getAttribute('aria-label')})`)
  const stats = await page.evaluate(() => window.calls.filter((c) => c[0] === 'stats_timeline').find((c) => JSON.parse(c[1].buckets).length === 30)[1])
  const [from, before] = JSON.parse(stats.buckets).at(-1)
  ok(await rows() === count(opener), `it shows as many leads as the bar counted (${await rows()} of ${count(opener)})`)
  const sent = await lastList()
  ok(sent.created_from === from && sent.created_before === before && sent.status === null, 'it asks list_leads for the leads saved in that period')
  ok(await dialog.getByRole('searchbox', { name: 'Search leads' }).isVisible() && await dialog.getByRole('combobox', { name: 'Filter by status' }).isVisible(), 'with the leads page\'s filter bar')
  ok(await dialog.getByRole('button', { name: 'Sort by Name' }).isVisible(), 'and the leads page\'s table')
  ok(/Showing 3 leads · the Stats page shows 3$/.test(await dialog.getByRole('status').first().innerText()), 'the popup says the counts agree')
  ok(await dialog.getByText('Added today').isVisible(), 'the active filter is shown')

  // Focus stays inside while it is open.
  let escaped = 0
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press('Tab')
    if (!await page.evaluate(() => Boolean(document.activeElement?.closest('[role=dialog]')))) escaped++
  }
  ok(escaped === 0, `Tab never leaves the popup (${escaped} escapes in 40 presses)`)

  // The filter bar narrows the subset, and the time filter can be cleared.
  await dialog.getByRole('combobox', { name: 'Filter by status' }).selectOption('contacted')
  ok(await rows() === 2 && (await lastList()).status === 'contacted', 'the shared status filter narrows the popup')
  await dialog.getByRole('button', { name: 'Clear filter: Added today' }).click()
  ok(await rows() === 2 && (await lastList()).created_from === undefined, 'clearing the time filter widens it to every contacted lead')

  // Escape closes it and gives focus back to the bar.
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  ok(await focused() === opener, `Escape closes the popup and focus returns to the bar (${await focused()})`)

  // Pipeline values open with the filter set in the same filter bar.
  const contacted = page.getByRole('button', { name: /^Pipeline, contacted: / })
  const contactedName = await contacted.getAttribute('aria-label')
  await contacted.click()
  await dialog.waitFor()
  ok(await dialog.getByRole('combobox', { name: 'Filter by status' }).inputValue() === 'contacted', 'a pipeline status opens with that status chosen in the filter bar')
  ok(await rows() === count(contactedName), `and as many rows as the pipeline counted (${await rows()} of ${count(contactedName)})`)
  // A lead opens over the popup; Escape closes only the lead.
  await dialog.locator('tbody tr').first().click()
  await page.waitForTimeout(300)
  ok(await page.getByRole('dialog').count() === 2, 'a lead opens on top of the popup')
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  ok(await page.getByRole('dialog').count() === 1, 'Escape closes the lead and leaves the popup open')
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  ok(await focused() === contactedName, 'and then focus returns to the pipeline value')

  for (const name of [/^Pipeline, not rated: /, /^Pipeline, have replied: /, /^Leads who replied, last 30 days: /, /^Leads added, last 30 days: /, /^Pipeline, all leads: /]) {
    const button = page.getByRole('button', { name })
    const label = await button.getAttribute('aria-label')
    await button.click()
    await dialog.waitFor()
    ok(await rows() === count(label), `${label.replace(' - show them', '')} → ${await rows()} rows`)
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
  }

  // The chart's table view offers the same values as full-size buttons.
  const replied = page.locator('figure').filter({ hasText: 'Leads who replied' })
  await replied.locator('summary').click()
  const cell = replied.locator('details').getByRole('button', { name: /: 1 lead$/ }).first()
  const cellName = await cell.getAttribute('aria-label')
  await cell.click()
  await dialog.waitFor()
  ok(await rows() === 1 && (await lastList()).replied_from !== undefined, `a table-view count opens its leads too (${cellName})`)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  ok(await focused() === cellName, 'and focus returns to that count')

  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
