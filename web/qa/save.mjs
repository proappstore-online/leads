/** Issue #42: the real lead form safely retries uncertain saves. */
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
  { cwd: here('..'), stdio: 'ignore', env: { ...process.env, QA_FIXTURES: './fixtures/actions-save.ts' } })
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
  const dialog = page.getByRole('dialog')
  const form = dialog.locator('form')
  const saves = () => page.evaluate(() => window.calls.filter(([name]) => ['save_lead_form', 'create_lead', 'update_lead'].includes(name)))
  await page.getByRole('button', { name: 'Add lead', exact: true }).click()
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Retry regression')
  await form.getByLabel('Country').selectOption('AU')
  await form.getByRole('button', { name: /^List / }).click()
  await form.getByLabel('Tags').fill('warm')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await form.getByText(/Save could not be confirmed|Simulated lost response/).waitFor()
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const create = await saves()
  ok(create.length === 2 && create.every(([name]) => name === 'save_lead_form'), '#42: the form uses one transactional action per attempt')
  ok(JSON.stringify(create[0]?.[1]) === JSON.stringify(create[1]?.[1]), '#42: new-lead retry retains the exact request key, lead ID and payload')
  ok(JSON.parse(create[0][1].payload).lists.length === 1 && JSON.parse(create[0][1].payload).tags === '["warm"]', '#42: the atomic request includes selected lists and tags')

  await page.locator('tbody tr').first().click({ position: { x: 4, y: 4 } })
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Updated retry regression')
  // The overflow fixture intentionally has an email domain invalid for HTML email inputs.
  await form.getByRole('textbox', { name: 'Email', exact: true }).fill('valid@example.com')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await form.getByText(/Save could not be confirmed|Simulated lost response/).waitFor()
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const edit = (await saves()).slice(2)
  ok(edit.length === 2 && JSON.stringify(edit[0]?.[1]) === JSON.stringify(edit[1]?.[1]), '#42: existing-lead retry retains its receipt and original conflict token')

  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
