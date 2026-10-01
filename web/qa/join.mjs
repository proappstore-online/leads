/** Issue #51: join success requires verified project access. */
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
  { cwd: here('..'), stdio: 'ignore', env: { ...process.env, QA_FIXTURES: './fixtures/actions-join.ts' } })
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
  for (const scenario of ['revoked', 'consumed', 'expired', 'read-error', 'valid', 'existing']) {
    await page.evaluate(() => localStorage.clear()).catch(() => {})
    await page.goto(`${URL_BASE}?join=invite-code&scenario=${scenario}`)
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Join project', exact: true }).click()
    if (['valid', 'existing'].includes(scenario)) {
      await dialog.waitFor({ state: 'detached' })
      ok(await page.evaluate(() => localStorage.getItem('leads.project')) === 'invited', `${scenario}: switches to verified project`)
      ok(await page.evaluate(() => localStorage.getItem('leads.join')) === null, `${scenario}: clears invite after verified success`)
    } else {
      await page.waitForTimeout(300)
      ok(await dialog.count() === 1, `${scenario}: keeps dialog open`)
      ok(await page.evaluate(() => localStorage.getItem('leads.join')) === 'invite-code', `${scenario}: retains saved invite`)
      ok(await dialog.getByText(scenario === 'read-error' ? 'Leads could not reach the service. Check your connection and try again.' : /used, cancelled or has expired/).count() === 1, `${scenario}: explains failed join`)
      ok(scenario === 'read-error' ? await dialog.getByRole('button', { name: 'Join project', exact: true }).isEnabled() : await dialog.getByRole('button', { name: 'Join project', exact: true }).count() === 0, `${scenario}: offers only appropriate actions`)
    }
  }

  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
