import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'

// A real, revocable platform session for a throwaway e2e account. deploy.yml mints it keylessly
// (GitHub OIDC -> POST /v1/auth/exchange/oidc) once a platform admin has granted this repo, or
// falls back to the PAS_E2E_SESSION_TOKEN secret. Without one, only the signed-out specs run.
const SESSION_TOKEN = process.env.E2E_SESSION_TOKEN || ''
export const hasSession = SESSION_TOKEN.length > 0

/**
 * The app uses authMode 'platform-cookie': the SDK never reads a token, it hydrates from the host's
 * HttpOnly __Host-pas_session cookie through /.pas/auth/me. Setting exactly the cookie the host's
 * /.pas/auth/callback sets after OAuth is the sign-in path - no test bypass in the app.
 */
export async function signIn(context: BrowserContext, baseURL: string) {
  await context.addCookies([{
    name: '__Host-pas_session',
    value: SESSION_TOKEN,
    url: new URL('/', baseURL).toString(),
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
  }])
}

/** Retries so a deploy that is still propagating does not read as a failure. */
export async function open(page: Page, path = '/') {
  let lastErr: unknown
  for (let i = 0; i < 10; i++) {
    try {
      const res = await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 20_000 })
      if (res && res.status() < 500) return
      lastErr = new Error('HTTP ' + (res ? res.status() : 'no response'))
    } catch (e) { lastErr = e }
    await page.waitForTimeout(6_000)
  }
  throw lastErr
}

/** GET /.pas/auth/me from inside the page, so it carries exactly the cookies the app has. */
export const me = (page: Page) => page.evaluate(async () => {
  const res = await fetch('/.pas/auth/me', { credentials: 'same-origin' })
  return { status: res.status, body: res.ok ? await res.json() : null }
})

export const test = base.extend<{ pageErrors: string[] }>({
  pageErrors: async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(String(e)))
    await use(errors)
  },
})

export { expect }
