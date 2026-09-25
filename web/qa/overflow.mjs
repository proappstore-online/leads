/**
 * Issue #10: long URLs must never make a page or a modal scroll sideways on a phone, and a
 * shortened link label must still point at the whole URL.
 *
 * Renders the real app against `fixtures/` (every lead field, note, message and source holds a
 * ~200-character URL) and walks its surfaces at 320px and 375px.
 *
 *   pnpm qa:overflow (also exposed as qa:mobile)
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const WIDTHS = [360, 640]
const here = (p) => fileURLToPath(new URL(p, import.meta.url))

/** A free port, so a dev server already running does not collide with this one. */
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

/** A Chromium to drive: CHROMIUM_PATH, else the newest one Playwright has downloaded. */
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  const cache = join(homedir(), 'Library/Caches/ms-playwright')
  const linux = join(homedir(), '.cache/ms-playwright')
  for (const dir of [cache, linux]) {
    if (!existsSync(dir)) continue
    const builds = readdirSync(dir).filter((d) => d.startsWith('chromium')).sort().reverse()
    for (const build of builds) {
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

/** How far the page, and any open modal, can be scrolled sideways. */
const measure = () => {
  const dialog = document.querySelector('[role=dialog]')
  return {
    page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
  }
}

async function check(page, where, width) {
  await page.waitForTimeout(120)
  const { page: p, dialog: d, smallTargets } = await page.evaluate(() => {
    const dialog = document.querySelector('[role=dialog]')
    const overflow = {
      page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dialog: dialog ? dialog.scrollWidth - dialog.clientWidth : 0,
    }
    const smallTargets = [...document.querySelectorAll('button, select, textarea, input:not([type=checkbox]):not([type=radio]):not([type=hidden])')]
      .filter((el) => el.getClientRects().length > 0 && !el.hasAttribute('disabled'))
      .map((el) => {
        const box = el.getBoundingClientRect()
        return { label: el.getAttribute('aria-label') || el.textContent?.trim() || el.tagName.toLowerCase(), width: Math.round(box.width), height: Math.round(box.height) }
      })
      .filter((box) => box.width < 44 || box.height < 44)
    return { ...overflow, smallTargets }
  })
  ok(p <= 0 && d <= 0, `${width}px ${where} — page +${p}px, modal +${d}px`)
  ok(smallTargets.length === 0, `${width}px ${where} — every visible control is at least 44×44px${smallTargets.length ? ` (${smallTargets[0].label}: ${smallTargets[0].width}×${smallTargets[0].height})` : ''}`)
}

async function run(browser, width) {
  const page = await browser.newPage({ viewport: { width, height: 780 }, isMobile: true, hasTouch: true })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(URL_BASE)
  await page.waitForSelector('main')
  await page.waitForTimeout(180)
  const nav = page.locator('nav')
  const openLead = () => width < 768
    ? page.locator('li').filter({ hasText: 'Alexandrina Montgomery-Wellington' }).first().click({ position: { x: 4, y: 4 } })
    : page.locator('tr').filter({ hasText: 'Alexandrina Montgomery-Wellington' }).first().click({ position: { x: 4, y: 4 } })

  await check(page, 'leads list', width)

  await openLead()
  await page.locator('[role=dialog]').waitFor()
  await check(page, 'lead: details', width)

  // The shortened labels must still carry the whole URL.
  const long = await page.evaluate(() => window.LONG)
  const links = await page.locator('[role=dialog] a[href]').evaluateAll((all) => {
    const room = document.querySelector('[role=dialog]').clientWidth
    return all.map((a) => ({ href: a.getAttribute('href'), title: a.title, text: a.textContent.trim(), fits: a.offsetWidth <= room }))
  })
  const full = links.filter((l) => l.href === long)
  ok(full.length > 0, `${width}px lead: the long URL is still the link destination (${full.length} link(s))`)
  ok(full.every((l) => l.text !== long), `${width}px lead: the raw URL is never printed in full`)
  ok(full.every((l) => l.fits), `${width}px lead: its label fits the modal`)
  ok(full.every((l) => l.title === long), `${width}px lead: the whole URL stays in the tooltip`)
  ok(links.every((l) => l.href && l.href.length > 0), `${width}px lead: every link keeps a destination`)

  for (const tab of ['conversation', 'history']) {
    await page.getByRole('tab', { name: tab }).click()
    await check(page, `lead: ${tab}`, width)
  }
  await page.getByRole('tab', { name: 'details' }).click()
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  await check(page, 'lead: edit form', width)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)

  await nav.getByRole('button', { name: /^Sources/ }).click()
  await check(page, 'sources', width)
  if (width < 768) await page.locator('li').filter({ hasText: 'Jobs in Melbourne' }).first().click({ position: { x: 4, y: 4 } })
  else await page.locator('tr').filter({ hasText: 'Jobs in Melbourne' }).first().click({ position: { x: 4, y: 4 } })
  await page.locator('[role=dialog]').waitFor()
  await page.waitForTimeout(180)
  await check(page, 'source panel', width)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(120)

  await nav.getByRole('button', { name: 'Stats' }).click()
  await check(page, 'stats', width)

  await nav.getByRole('button', { name: /^All leads/ }).click()
  await page.waitForTimeout(120)
  await page.getByRole('button', { name: 'board', exact: true }).click()
  await check(page, 'board', width)
  await page.getByRole('button', { name: 'table', exact: true }).click()

  // A list with a very long name, opened from the sidebar, then its form.
  await nav.getByRole('button', { name: /^List x/ }).click()
  await page.waitForTimeout(180)
  await check(page, 'one list', width)
  await page.getByRole('button', { name: 'Edit list' }).click()
  await page.locator('[role=dialog]').waitFor()
  await check(page, 'list form', width)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  await page.getByRole('button', { name: /Manage/ }).click()
  await page.locator('[role=dialog]').waitFor()
  await page.waitForTimeout(400)
  await check(page, 'project settings', width)

  ok(errors.length === 0, `${width}px no console errors${errors.length ? ': ' + errors[0] : ''}`)
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
const server = spawn('npx', ['vite', '--config', here('./vite.config.ts'), '--port', String(port), '--strictPort'], { cwd: here('..'), stdio: 'ignore' })
process.on('exit', () => server.kill())

try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) {
    up = await fetch(URL_BASE).then((r) => r.ok).catch(() => false)
    if (!up) await new Promise((r) => setTimeout(r, 500))
  }
  if (!up) throw new Error(`the dev server did not start on ${URL_BASE}`)
  const browser = await chromium.launch({ executablePath: exe })
  for (const width of WIDTHS) await run(browser, width)
  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
