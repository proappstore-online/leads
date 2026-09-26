import type { Page } from '@playwright/test'
import { test, expect, hasSession, signIn, open, me } from '../fixtures'

// PAS-OPS-003 / PAS-OPS-010: sign in, one read, one write, sign out - on the live URL, through the
// SDK's real session path. Skipped (and reported as skipped) when deploy.yml had no session.

/** Deletes every lead with this name in the e2e account, through the same mediated actions route the app uses. */
async function removeLeads(page: Page, name: string) {
  await page.evaluate(async (name) => {
    const call = (action: string, params: Record<string, unknown>) => fetch(`/.pas/api/v1/apps/leads/actions/${action}`, {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ params }),
    }).then((r) => r.json())
    const { rows = [] } = await call('list_leads', { q: name, limit: 50 })
    for (const lead of rows as { id: string; name: string }[]) if (lead.name === name) await call('delete_lead', { id: lead.id })
  }, name)
}

test('signed in: read, write and sign out on the live app', async ({ page, context, baseURL, pageErrors }, info) => {
  test.skip(!hasSession, 'no e2e session: deploy.yml found neither an OIDC session grant nor PAS_E2E_SESSION_TOKEN')
  const name = `E2E smoke ${process.env.GITHUB_SHA?.slice(0, 7) ?? 'local'} ${info.project.name} ${Date.now()}`

  await signIn(context, baseURL!)
  await open(page)

  // Signed in: the host resolves the cookie to a user and the app renders past the gate.
  const session = await me(page)
  expect(session.status).toBe(200)
  const addLead = page.getByRole('button', { name: 'Add lead' }).first()
  await expect(addLead).toBeVisible({ timeout: 30_000 })

  try {
    // Read: the lead list loads - rows or the empty state, never an error.
    await expect(page.getByRole('searchbox', { name: 'Search leads' })).toBeVisible()
    await expect(page.getByRole('status').filter({ hasText: /^Loading/ })).toHaveCount(0, { timeout: 30_000 })
    await expect(page.getByRole('alert')).toHaveCount(0)

    // Write: add a lead through the form, then find it through search.
    await addLead.click()
    const form = page.getByRole('dialog')
    await form.getByLabel('Name', { exact: true }).fill(name)
    await form.getByLabel(/^Country/).selectOption('AU')
    await form.getByRole('button', { name: 'Save' }).click()
    await expect(form).toBeHidden({ timeout: 15_000 })
    await page.getByRole('searchbox', { name: 'Search leads' }).fill(name)
    // The table (desktop) and the card list (phone) both render; only one is visible.
    const row = page.getByText(name).filter({ visible: true }).first()
    await expect(row).toBeVisible({ timeout: 15_000 })

    // And delete it again through the UI, so the account is left as it was found.
    await row.click()
    const lead = page.getByRole('dialog')
    await lead.getByRole('button', { name: 'Edit', exact: true }).click()
    page.once('dialog', (d) => d.accept())
    await lead.getByRole('button', { name: 'Delete lead' }).click()
    await expect(lead).toBeHidden({ timeout: 15_000 })
    await expect(page.getByText(name).filter({ visible: true })).toHaveCount(0, { timeout: 15_000 })
  } finally {
    await removeLeads(page, name)
  }

  // Sign out through the platform profile menu: back to the gate, and the host no longer knows us.
  await page.getByRole('banner').getByRole('button').last().click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible({ timeout: 15_000 })
  expect((await me(page)).status).toBe(401)
  expect(pageErrors).toEqual([])
})
