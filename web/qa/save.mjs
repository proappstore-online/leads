/** Issues #42 and #70: the real lead, list and project forms safely retry uncertain saves. */
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

  // #41: a concurrent server change must travel with the new conflict token.
  await page.locator('tbody tr').first().click({ position: { x: 4, y: 4 } })
  await page.evaluate(() => { window.enriched = true })
  await dialog.locator('select').first().selectOption('me')
  await dialog.getByText('New Role · New Company', { exact: true }).waitFor()
  ok(await dialog.locator('p').filter({ hasText: /^Agent notes$/ }).isVisible(), '#41: read-only details use the refreshed server snapshot')
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  ok(await form.getByLabel('Company', { exact: true }).inputValue() === 'New Company', '#41: editing starts with refreshed company')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await form.getByText(/Save could not be confirmed/).waitFor()
  const fresh = JSON.parse((await saves()).at(-1)[1].payload)
  ok(fresh.if_unchanged_since === 3 && fresh.company === 'New Company' && fresh.status === 'qualified' && fresh.email === 'fresh@example.com' && fresh.notes === 'Agent notes' && fresh.country === 'NZ' && fresh.title === 'New Role', '#41: latest token is paired with fresh detail fields')
  ok(fresh.tags === '["fresh"]' && fresh.fields === '{"Agent":"new"}' && fresh.lists.length === 0, '#41: tags, custom fields and memberships refresh too')
  await form.getByRole('button', { name: 'Cancel', exact: true }).click()
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  ok(await form.getByLabel('Company', { exact: true }).inputValue() === 'New Company', '#41: cancel restores the latest snapshot')
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()

  await page.evaluate(() => { window.enriched = false })
  await page.locator('tbody tr').first().click({ position: { x: 4, y: 4 } })
  await dialog.getByRole('button', { name: 'Edit', exact: true }).click()
  await form.getByLabel('Company', { exact: true }).fill('My unsaved company')
  await page.evaluate(() => { window.enriched = true })
  await dialog.locator('select').first().selectOption('me')
  await form.getByLabel('Email', { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelector('input[type="email"]')?.value === 'fresh@example.com')
  ok(await form.getByLabel('Company', { exact: true }).inputValue() === 'My unsaved company', '#41: in-place writes preserve dirty edits')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  const dirty = JSON.parse((await saves()).at(-1)[1].payload)
  ok(dirty.if_unchanged_since !== 3 && dirty.company === 'My unsaved company', '#41: retained edits keep their original conflict token')

  // #70: a new list in a new project, retried after a lost response, is the same request.
  // Let the last lead save settle, then close the form if it is still open.
  await Promise.race([dialog.waitFor({ state: 'detached' }), dialog.getByText(/Save could not be confirmed/).waitFor()])
  if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const listSaves = () => page.evaluate(() => window.calls.filter(([name]) => ['save_list_form', 'create_project', 'create_list'].includes(name)))
  await page.getByRole('button', { name: '+ New list', exact: true }).click()
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Retry list')
  // The label wraps the select, so its accessible name includes the selected project.
  await form.locator('select').selectOption('__new')
  await form.getByLabel('New project name').fill('Retry project')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await form.getByText(/Save could not be confirmed/).waitFor()
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const listCalls = await listSaves()
  ok(listCalls.length === 2 && listCalls.every(([name]) => name === 'save_list_form'), '#70: a new list and project are one transactional action per attempt')
  ok(JSON.stringify(listCalls[0]?.[1]) === JSON.stringify(listCalls[1]?.[1]), '#70: the retry replays the same request id, list id and project id')
  const listPayload = JSON.parse(listCalls[0][1].payload)
  ok(listPayload.name === 'Retry list' && listPayload.new_project?.name === 'Retry project' && listPayload.project_id && listPayload.id, '#70: the request carries the list and its new project')

  // The project form keeps its id, so a retry replays the same project instead of adding another.
  await page.getByLabel('Current project').selectOption('__new')
  await form.getByRole('textbox', { name: 'Name', exact: true }).fill('Retry project form')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.getByText(/Simulated lost response/).waitFor() // the project form shows errors below its form
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await dialog.waitFor({ state: 'detached' })
  const projectCalls = (await listSaves()).slice(2)
  ok(projectCalls.length === 2 && projectCalls.every(([name]) => name === 'create_project') && JSON.stringify(projectCalls[0][1]) === JSON.stringify(projectCalls[1][1]), '#70: the project form retries with the same project id')

  await browser.close()
} finally {
  server.kill()
}

console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed')
process.exit(failures ? 1 : 0)
