# Leads

Lead management on [ProAppStore](https://proappstore.online): one database of all your leads (contacts) with phone, email, website and social profiles, organised into lists — one list per purpose or role. A lead can be in many lists.

- Live: https://leads.proappstore.online
- Dev: `pnpm install && pnpm dev`
- Deploy: `git push origin main` - then `e2e/` smoke-tests the live app; see [VERIFICATION.md](VERIFICATION.md) for the deploy evidence and the human checklists

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

## Recovery export and import

`export_my_data` is the owner-scoped recovery export. It produces the
`leads-export/v1` JSONL format: each result row has `format`, `section`, `total`,
and a JSON `data` record. It is intentionally paged (1–200 records per call), so
it is safe to use for a single owner without returning another owner's data or an
unbounded database dump. The export includes caller-owned leads, lists, messages,
sources, projects and relationship state, plus members and invites of projects the
caller owns. It does not include a membership in somebody else's project or any
other owner’s records. Treat the file as sensitive: it includes lead content,
project member names and invite codes.

To make an export, call the action as the owner for every section below, starting
at `offset: 0` with (for example) `limit: 200`. Append every returned result row
as one line of a protected `export.jsonl` file. The action’s `total` is the count
for that section; repeat with `offset` increased by the number of non-null `data`
rows until it reaches `total`. An empty section returns one row with `data: null`.

```text
leads, lists, memberships, messages, sources, projects,
project_memberships, project_invites, join_table_backfills,
legacy_lead_lists, legacy_project_members
```

To rehearse or recover, start with a *new, empty* D1 database that has the current
`migrations.json` schema. Never use this importer to merge into a live database:
it deliberately emits plain `INSERT`s and stops on a conflict. Build a transaction
from the saved file, inspect it, then have a platform operator apply it to the
empty recovery database:

```sh
node recovery/import.mjs < export.jsonl > recovery.sql
npx wrangler d1 execute RECOVERY_DATABASE --remote --file recovery.sql
```

Confirm the imported owner can read their expected leads, messages, lists and
project state with the registered actions before deciding how to resume service.
`pnpm test` includes this same complete, multi-page export → empty-database import
rehearsal and checks both lossless recovery and tenant isolation.

### D1 production restore boundary

A Cloudflare D1 Time Travel restore is **database-wide**, destructive, and occurs
in place — it is not a way to restore one Leads owner. It cancels in-flight queries
and overwrites newer data. Use it only for a whole-database incident, after a
platform owner has chosen the restore point and warned affected users; retain the
reported previous bookmark so the restore can be undone. It requires D1's
production storage backend. The recovery window is currently up to 30 days on a
Workers Paid plan and 7 days on Workers Free; it cannot recover older data and D1
does not yet support cloning/forking a database for this workflow. See Cloudflare’s
[Time Travel and backups documentation](https://developers.cloudflare.com/d1/reference/time-travel/)
for the current commands and limits.

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
