# Leads

Lead management on [ProAppStore](https://proappstore.online): one database of all your leads (contacts) with phone, email, website and social profiles, organised into lists — one list per purpose or role. A lead can be in many lists.

- Live: https://leads.proappstore.online
- Dev: `pnpm install && pnpm dev`
- Deploy: `git push origin main`

## Data retention and deletion

Leads holds personal data about third parties (the people you record as leads), so
what is kept, for how long, and how it is removed is stated here.

| Data | Where | Kept for | Removed by |
|---|---|---|---|
| Leads, messages, tags, custom fields, list memberships | this app's own D1 database | until you delete them — no automatic expiry | `delete_lead` / `delete_message` per row, or **Delete my data** for everything |
| Lists, sources, projects, project invites and memberships | this app's own D1 database | until you delete them | `delete_list` / `delete_source` / `delete_project` / `leave_project`, or **Delete my data** |
| Runtime error logs | platform (`app.logs`) | 30 days, then pruned by the platform | — |
| Usage heartbeats | platform (`app.usage`) | 90 days, then pruned by the platform | — |
| Cookieless page analytics | Cloudflare Web Analytics, aggregate only | Cloudflare's retention; no per-person record exists | — |

**Delete my data** — profile menu → *Delete my data…* (or the registered action
`delete_my_data` with `confirm: "DELETE MY DATA"`) removes, in one transaction: your
leads with every message on them and their list memberships, your lists, your sources,
the projects you own with their invites and memberships, your memberships in other
people's projects, and invites you created. Other members' leads that were assigned to
you are unassigned and their lists attached to a project you owned are detached — never
deleted. Any other confirmation text changes nothing. There is no undo, and no rows for
your user id remain in any table afterwards (`qa/actions.mjs` proves this on every
test run).

**What this app cannot delete** — your ProAppStore account itself (platform identity),
and the platform's telemetry aggregates. The SDK's `deleteAccount()` only clears your
per-app KV keys and signs you out; it is not offered here as account deletion. For
platform account deletion, contact support@proappstore.online.

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

