import { test, expect, open, me } from '../fixtures'

// Signed out: runs after every deploy with no session at all.

test('the live app boots to the sign-in gate without page errors', async ({ page, pageErrors }) => {
  await open(page)
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Continue with GitHub' })).toBeVisible()
  expect((await me(page)).status).toBe(401)
  expect(pageErrors).toEqual([])
})

for (const [button, provider] of [['Continue with GitHub', 'github'], ['Continue with Google', 'google']] as const) {
  test(`${button} starts the platform's real ${provider} sign-in`, async ({ page, request }) => {
    await open(page)
    // Stop at the host so the run never reaches the provider's login page.
    let started = ''
    await page.route('**/.pas/auth/start**', (route) => { started = route.request().url(); return route.abort() })
    await page.getByRole('button', { name: button }).click()
    await expect.poll(() => started).not.toBe('')
    expect(new URL(started).searchParams.get('provider')).toBe(provider)

    // The host hands off to the platform API for this app, with a callback on the app's own origin.
    const res = await request.get(started, { maxRedirects: 0 })
    expect(res.status()).toBe(302)
    const location = new URL(res.headers()['location'])
    expect(location.origin + location.pathname).toBe(`https://api.proappstore.online/v1/auth/${provider}/start`)
    expect(location.searchParams.get('app_id')).toBe('leads')
    expect(new URL(location.searchParams.get('return_to')!).origin).toBe(new URL(started).origin)
  })
}

test('actions refuse a caller without a session', async ({ page }) => {
  await open(page)
  const status = await page.evaluate(async () => (await fetch('/.pas/api/v1/apps/leads/actions/create_lead', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ params: { id: 'e2e-unauthenticated', name: 'nobody', country: 'AU' } }),
  })).status)
  expect(status).toBe(401)
})
