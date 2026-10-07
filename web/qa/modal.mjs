/** Issue #44: modal tab order contains only visible controls and stays in the top modal. */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
const freePort = () => new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, () => { const { port } = probe.address(); probe.close(() => resolve(port)) })
})
function findChromium() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH
  for (const dir of [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')]) {
    if (!existsSync(dir)) continue
    for (const build of readdirSync(dir).filter((d) => d.startsWith('chromium')).sort().reverse()) {
      for (const rel of ['chrome-headless-shell-mac-x64/chrome-headless-shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-headless-shell-linux/chrome-headless-shell', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const exe = join(dir, build, rel)
        if (existsSync(exe)) return exe
      }
    }
  }
  return null
}
let failures = 0
const ok = (pass, what) => { console.log(`${pass ? 'PASS' : 'FAIL'}  ${what}`); if (!pass) failures++ }
const exe = findChromium()
if (!exe) { console.error('No Chromium found. Run `npx playwright install chromium`, or set CHROMIUM_PATH.'); process.exit(2) }
const { chromium } = await import('playwright-core')
const port = await freePort()
const base = `http://localhost:${port}/`
const server = spawn('npx', ['vite', '--config', here('./vite.config.ts'), '--port', String(port), '--strictPort'], { cwd: here('..'), stdio: 'ignore', env: { ...process.env, QA_FIXTURES: './fixtures/actions-stats.ts' } })
process.on('exit', () => server.kill())
try {
  let up = false
  for (let i = 0; i < 60 && !up; i++) { up = await fetch(base).then((r) => r.ok).catch(() => false); if (!up) await new Promise((r) => setTimeout(r, 500)) }
  if (!up) throw new Error(`the dev server did not start on ${base}`)
  const browser = await chromium.launch({ executablePath: exe })
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } })
  page.on('pageerror', (e) => ok(false, `console error: ${e.message}`))
  await page.goto(base)
  await page.waitForSelector('main')
  const dialog = page.getByRole('dialog')
  await page.locator('tbody tr').first().click({ position: { x: 4, y: 4 } })
  await dialog.waitFor()
  const form = dialog.locator('form')
  ok(await form.isHidden(), 'read-only Details keeps the edit form hidden')
  const visibleTabbables = () => page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].at(-1)
    return [...d.querySelectorAll('button, [href], input, select, textarea, [tabindex]')].filter((el) => {
      const s = getComputedStyle(el)
      return !el.matches(':disabled') && el.tabIndex >= 0 && !el.closest('[hidden], [inert], [aria-hidden="true"]') && s.visibility !== 'hidden' && s.visibility !== 'collapse' && el.getClientRects().length > 0
    }).map((el) => el.getAttribute('aria-label') || el.textContent.trim())
  })
  const controls = await visibleTabbables()
  ok(!controls.some((name) => name === 'Save' || name === 'Cancel'), 'hidden Save and Cancel controls are absent from the visible tab order')
  await dialog.getByRole('button', { name: 'Edit', exact: true }).focus()
  await page.keyboard.press('Tab')
  ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null), 'Tab from Edit stays inside read-only Details')
  await page.keyboard.press('Shift+Tab')
  const last = await page.evaluate(() => {
      const d = [...document.querySelectorAll('[role="dialog"]')].at(-1)
      return [...d.querySelectorAll('button, [href], input, select, textarea, [tabindex]')].filter((el) => {
        const s = getComputedStyle(el)
        return !el.matches(':disabled') && el.tabIndex >= 0 && !el.closest('[hidden], [inert], [aria-hidden="true"]') && s.visibility !== 'hidden' && s.visibility !== 'collapse' && el.getClientRects().length > 0
      }).at(-1) === document.activeElement
    })
  ok(last, 'Shift+Tab from the first visible control wraps to the last visible control')
  // Include hidden, disabled and negative-tab-index traps to ensure each is excluded.
  await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].at(-1)
    const hidden = document.createElement('button'); hidden.textContent = 'Injected hidden'; hidden.hidden = true; d.append(hidden)
    const disabled = document.createElement('button'); disabled.textContent = 'Injected disabled'; disabled.disabled = true; d.append(disabled)
    const negative = document.createElement('button'); negative.textContent = 'Injected negative'; negative.tabIndex = -1; d.append(negative)
  })
  ok(!(await visibleTabbables()).some((name) => name.startsWith('Injected')), 'hidden, disabled and negative-tab-index controls are excluded')
  // A Stats popup with a lead on top checks that the underlying dialog does not steal Tab.
  await page.keyboard.press('Escape')
  await page.locator('nav').getByRole('button', { name: 'Stats' }).click()
  await page.getByRole('button', { name: /^Pipeline, all leads: / }).click()
  await page.getByRole('dialog').last().waitFor()
  await page.getByRole('dialog').last().locator('tbody tr').first().click()
  await page.waitForFunction(() => document.querySelectorAll('[role="dialog"]').length === 2)
  for (let i = 0; i < 20; i++) {
    await page.keyboard.press('Tab')
    if (i === 0 || i === 19) ok(await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') === [...document.querySelectorAll('[role="dialog"]')].at(-1)), `stacked modal Tab ${i + 1} stays in the top dialog`)
  }
  await browser.close()
} finally { server.kill() }
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
