# leads (Pro)

Lead management: one database of leads (contacts) with contact details and social
profiles, browsed through lists — one list per purpose or role.

- Subdomain: `leads.proappstore.online`
- Dev: `pnpm install && pnpm dev`
- Build: `pnpm build` (runs platform compliance check via prebuild)
- Deploy: `git push origin main` (auto-deploys via GitHub Actions → R2)

Platform conventions: https://proappstore.online/skills.md

## Data model (`migrations.json`)

- `leads` — one row per contact. Social profiles (`linkedin`, `twitter`, `instagram`,
  `facebook`, `tiktok`, `youtube`, `github`) hold LINKS only: the full `https://` profile URL on
  that platform's domain, or null. Enforced in SQL by `create_lead` / `update_lead` (a bad value
  makes the write affect 0 rows), explained to agents by `check_lead_links`, and mirrored in the
  form by `web/src/lib/socials.ts` — keep the domain lists in step. Rows saved before this rule
  may still hold names; the table flags them as "no link".
  `source` is where the lead was found (a Facebook group, a community, an event) — not
  their employer, which is `company`.
- `lists` — a named category of leads with a `purpose`.
- `lead_lists` — many-to-many membership. Deleting a list never deletes its leads.
- `messages` — the recorded conversation with a lead, one row per message: `platform`,
  `direction` (`out` = sent by the user, `in` = sent by the lead), full `body`, and
  `occurred_at` — the exact time it was sent, epoch ms (not `created_at`, which is when
  it was logged). Deleted with the lead.

- `sources` — places leads are found (Facebook group/page, event…): `name` (unique per user,
  case-insensitive), `kind` (fixed list), `url`, `notes`. `leads.source_id` points to one; a lead
  has one source, the place first found. `list_sources` returns per-source stats (leads,
  contacted, replied, reply rate, qualified, won, high fit). `leads.source` is the legacy free
  text from before 0006 — no action writes it; the UI shows it only while `source_id` is empty.
- `leads.fit` (`high`/`med`/`low`), `leads.source_url` (link to the exact post the lead was
  found in), `leads.found_at` (epoch ms). `company` is the lead's employer, never the group.
- `leads.needs_attention` (0/1) + `attention_reason` + `attention_at` — a flag for the owner,
  raised by agents (`flag_needs_attention`) or by hand, separate from `status`. Flagged leads are
  always listed first by `list_leads`, highlighted in the table, and have their own sidebar view.
  No lead write other than `clear_needs_attention` resets it.
- `messages.seq` keeps thread order when several messages share a timestamp.

Every row carries `user_id`; each signed-in user sees only their own database.

## Data access

All reads and writes go through the registered actions in `mcp.json`
(`web/src/lib/actions.ts` → `app.actions.call`). No raw browser SQL. Every statement is
scoped with `user_id = :__user_id` — that guard is the security boundary, keep it on any
new action. `add_lead_to_list` derives both ids from rows the caller owns rather than
trusting the params; `add_message` does the same for its lead.

### Validation lives in the action SQL

The platform reports every SQL error as "internal server error" and its migration lint rejects
triggers, so rules are enforced by making the write match zero rows instead: a refused write
returns `"changes": 0`. Every lead write checks links-only socials, `status`/`fit` vocabulary and
no duplicate email / profile URL; message writes check `platform`/`direction`. The descriptions
tell agents what `changes: 0` means and which tool explains it (`check_lead_links`, `find_lead`).
Params are bound once through a `FROM (SELECT :x AS x, …) AS p` subquery — D1 allows 100 binds.

Reporting (`stats_timeline`, `stats_pipeline`, `recent_activity`) is derived from row
timestamps - there is no event log. `recent_activity` can therefore only show a lead's latest
edit, and a cleared flag disappears from it. The Stats page (`web/src/components/StatsPage.tsx`)
builds local-time buckets client-side and passes them as JSON `[start, end)` pairs. Chart series
colours are `--series-1` / `--series-2` in `index.css`, validated for CVD and contrast in both
themes - keep them if you add a chart.

Agent-facing conventions live in the `how_to_use` action — update it when a rule changes.
Every action must bind at least one param (hence its `WHERE :__user_id IS NOT NULL`): the data
worker calls `.bind()` even with none, which D1 answers with a 500.
`update_lead` is a full replace for the form; agents use `enrich_lead` / `set_lead_status`.
`add_messages` takes a JSON thread, is all-or-nothing, and skips messages already stored.

Schema changes: add a new entry to `migrations.json` (additive only, never edit an
applied one), and keep `mcp.json` columns in step with it.

The same actions are exposed to MCP clients as `leads/<action>`, so an agent can add or
look up leads and record or read their conversations directly.
