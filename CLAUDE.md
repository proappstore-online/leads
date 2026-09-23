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
- `leads.country` — confirmed country, ISO 3166 alpha-2. Required by `create_lead` (the platform
  rejects a call without it); `update_lead` can change it but never clear it (`COALESCE`), so
  leads from before 0007 stay editable. The 249 codes live in `mcp.json` and
  `web/src/lib/countries.ts` — keep them in step.
- `messages.seq` keeps thread order when several messages share a timestamp.
- `projects` group lists. Every list is in a project, and every action that takes a `list_id` also
  requires that list's `project_id` - a mismatch changes/returns nothing. Lists from before
  projects have `project_id` null (migrations cannot UPDATE) and are addressed with `'none'` until
  moved into one; new lists always get a project. `project_members` join through
  single-use invite codes (`project_invites`, link `?join=<code>`, 7 days). `leads.assigned_to_user_id`
  is the owner or a member of a project that one of the lead's lists belongs to (`assign_lead`
  checks it; actions that remove that path unassign).

The app works in one project at a time: the top-bar switcher (`App.tsx`, remembered under
`leads.project`) sets it, and every query passes it as `project_id` - `list_lists`, `count_leads`,
`list_leads`, `list_tags`, `list_sources`, `get_source`, `list_assigned_leads`, the stats tools and
`recent_activity`. These `project_id` params are optional, so agents that omit them still see
everything. "All projects" sends none, and is where lists from before projects are shown. `Home` is
remounted on a switch (`key`), so no filter survives into a project where it does not exist.

Every row carries `user_id`; each signed-in user sees only their own database. One exception: a
project member reaches a lead assigned to them while it is in a list of a project they belong to -
`get_lead`, `list_assigned_leads`, `set_lead_status`, `flag_needs_attention` and the message
read/add actions (their messages are stored under the owner's `user_id`). Every other action stays
owner-only.

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

Reporting (`stats_timeline`, `stats_pipeline`) is derived from row timestamps. `recent_activity`
reads each event's own time (#12): changes and notes come one per `leads.history` entry with its
`at`, never the lead's `updated_at`; an entry written without one falls back to the lead's
`created_at` and says so through `at_known` 0, so nothing looks more recent than it was. The
row-level `flagged` branch only carries flags from before history existed. Per-lead history is
`leads.history`: a JSON array (capped at 300) appended by the same `UPDATE` that makes the change -
triggers are rejected and a second statement would turn the action into a batch, whose result has
no top-level `changes`. Any new lead write must append to it like the existing ones, and lead reads
list their columns instead of `l.*` so history stays out of them. Tags (`leads.tags`, JSON array),
custom fields (`leads.custom_fields`, JSON object) and the follow-up (`next_action_at`,
`next_action`) are set by their own actions, never by `update_lead`. The Stats page (`web/src/components/StatsPage.tsx`)
builds local-time buckets client-side and passes them as JSON `[start, end)` pairs. Chart series
colours are `--series-1` / `--series-2` in `index.css`, validated for CVD and contrast in both
themes - keep them if you add a chart.

## Long values in the UI

A pasted URL must never widen a card, row or modal (#10). Links go through
`web/src/components/ExternalLink.tsx`, which cuts the label with an ellipsis while `href` and the
tooltip keep the whole URL; free text that can hold one (notes, an attention reason, a follow-up,
a list purpose) carries `wrapAnywhere` from `components/styles.ts`. A chip or flex item also needs
`min-w-0`, and a `<fieldset>` needs it too - it defaults to `min-width: min-content`.
`node qa/actions.mjs` (part of `pnpm test`) runs the real actions against a SQLite built from
`migrations.json` - no browser, no dependencies - and is the place for action regressions.
`pnpm --filter @leads/web qa:overflow` renders the app against fixtures full of extreme URLs and
fails if any page or modal scrolls sideways at 320px or 375px (`web/qa/`, needs a local Chromium;
not part of CI). `qa:sorting` does the same for the sort controls (#11): both views that used to
pin their own order - Assigned to me and Follow-ups due - now open on a sensible sort and then
follow the controls, so `list_assigned_leads` takes `sort`/`dir` like `list_leads`. `qa:activity`
covers the feed's event times.

Agent-facing conventions live in the `how_to_use` action — update it when a rule changes.
Every action must bind at least one param (hence its `WHERE :__user_id IS NOT NULL`): the data
worker calls `.bind()` even with none, which D1 answers with a 500.
`update_lead` is a full replace for the form; agents use `enrich_lead` / `set_lead_status`.
`add_messages` takes a JSON thread, is all-or-nothing, and skips messages already stored.

Schema changes: add a new entry to `migrations.json` (additive only, never edit an
applied one), and keep `mcp.json` columns in step with it.

The same actions are exposed to MCP clients as `leads/<action>`, so an agent can add or
look up leads and record or read their conversations directly.
