# Leads

Lead management on [ProAppStore](https://proappstore.online): one database of all your leads (contacts) with phone, email, website and social profiles, organised into lists — one list per purpose or role. A lead can be in many lists.

- Live: https://leads.proappstore.online
- Dev: `pnpm install && pnpm dev`
- Deploy: `git push origin main`

## Telemetry

Leads takes part in the ProAppStore platform's first-party telemetry, all of it on
by default through the SDK (`initPro({ appId: 'leads', authMode: 'platform-cookie' })`,
`usage` and `monitoring` at their defaults):

- **Usage heartbeat** (`app.usage`) — while a tab is visible, a ping every 60 seconds
  (and one on page close) reporting visible seconds for this app, per signed-in user,
  per day. It drives creator payout attribution; nothing else is in it.
- **Runtime error logs** (`app.logs`) — `window.onerror` and unhandled promise
  rejections, batched to the platform where the app owner reads them. Messages are
  redacted client-side (bearer tokens, passwords, keys, cookies), and anonymous reports
  carry a rotating per-install client id rather than a name or email.
- **Cookieless page analytics** — Cloudflare Web Analytics, loaded through the
  platform's `/v1/analytics.js`: page views without cookies, without the full IP,
  user agent or referrer.

No other telemetry exists: no third-party trackers, no advertising or session-replay
scripts (the platform's compliance check *No tracking SDKs* fails a build that adds
one, and the app's Content-Security-Policy only allows scripts from the app itself,
the platform API and `static.cloudflareinsights.com`). Lead data you enter stays in
this app's own database and is never part of telemetry.

