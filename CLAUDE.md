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
  `facebook`, `tiktok`, `youtube`, `github`) are stored as typed: a full URL or a bare
  handle. `web/src/lib/socials.ts` turns either into a link.
- `lists` — a named category of leads with a `purpose`.
- `lead_lists` — many-to-many membership. Deleting a list never deletes its leads.
- `messages` — the recorded conversation with a lead, one row per message: `platform`,
  `direction` (`out` = sent by the user, `in` = sent by the lead), full `body`, and
  `occurred_at` — the exact time it was sent, epoch ms (not `created_at`, which is when
  it was logged). Deleted with the lead.

Every row carries `user_id`; each signed-in user sees only their own database.

## Data access

All reads and writes go through the registered actions in `mcp.json`
(`web/src/lib/actions.ts` → `app.actions.call`). No raw browser SQL. Every statement is
scoped with `user_id = :__user_id` — that guard is the security boundary, keep it on any
new action. `add_lead_to_list` derives both ids from rows the caller owns rather than
trusting the params; `add_message` does the same for its lead.

Schema changes: add a new entry to `migrations.json` (additive only, never edit an
applied one), and keep `mcp.json` columns in step with it.

The same actions are exposed to MCP clients as `leads/<action>`, so an agent can add or
look up leads and record or read their conversations directly.
