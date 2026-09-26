# Deployed verification

What proves the live app works after a deploy, what a person still has to check, and where each
record lives. Standard: [ProAppStore Recommended Application Standard v1.5](https://docs.proappstore.online/standard/).

## Automated on every deploy

`deploy.yml` runs, in order: migrations → tool registration → upload → the `e2e/` Playwright
suite against `https://leads.proappstore.online`, on a desktop and a phone profile. A failing spec
fails the deploy run (PAS-OPS-010).

| Spec | What it proves | Clauses |
|---|---|---|
| `e2e/tests/smoke.spec.ts` › boots to the sign-in gate | the live app loads without page errors; `/.pas/auth/me` is 401 when signed out | OPS-010 |
| `e2e/tests/smoke.spec.ts` › Continue with GitHub / Google | each provider button goes through the host's `/.pas/auth/start` to the platform's own OAuth start for `leads`, with the callback on the app's origin | OPS-003 |
| `e2e/tests/smoke.spec.ts` › actions refuse a caller without a session | the mediated actions route answers 401 with no cookie | OPS-003 |
| `e2e/tests/signed-in.spec.ts` | signed in: the lead list loads with no error; adding a lead through the form shows it in search; deleting it through the form removes it; Sign out in the profile menu returns to the gate and `/.pas/auth/me` is 401 again | OPS-003, OPS-010 |

The signed-in spec sets the host's `__Host-pas_session` cookie, exactly what `/.pas/auth/callback`
sets after OAuth. The app itself has no test path: the SDK hydrates from that cookie through
`/.pas/auth/me` as it does for every user. It creates one lead named `E2E smoke <sha> <project> <time>`
and deletes it, including on failure.

### The signed-in spec needs a session - human gate

Without one, the spec is **skipped**, and the deploy log says
`No e2e session … the signed-in smoke is SKIPPED, so PAS-OPS-010 is not met`. To enable it, a
platform admin grants this repo a throwaway e2e account once. After that, every run exchanges its
GitHub OIDC token for a four-hour session, and nothing is stored in the repo:

```
POST https://api.proappstore.online/v1/admin/oidc-session-grants
{ "repository": "proappstore-online/leads", "workflow": ".github/workflows/deploy.yml", "user_id": "gh:<e2e account>" }
```

Use a dedicated account, never the owner's: the spec writes to that account's data. A
`PAS_E2E_SESSION_TOKEN` repo secret also works, as a fallback.

Run it locally against the live app with `cd e2e && npm install && npx playwright test`. Set
`E2E_SESSION_TOKEN` to include the signed-in spec.

## Evidence for each deploy (PAS-OPS-005, PAS-OPS-020)

`scripts/deploy-evidence.sh [sha]` prints the bundle for a deployed commit from its Actions runs:
- the CI, compliance and deploy run URLs, and CI's `pas check` line;
- the `Applied migration(s)`, `Registered N app tool(s)` and `Deployed apps/leads from <sha>` lines;
- whether the smoke ran signed in, and its pass/skip counts;
- the repo's secret names.

The owner adds the items only they can read: `schema-status`, and the build SHA on a fresh
`app.logs` entry. Paste the bundle into the audit report or the deploy's issue.

## Human checklists

An automated auditor records these as `manual-review`, never as passed. Record each run in the
table at the end, with the date, hostname and who ran it.

### PAS-AUTH-020: sign-in, sign-out and roles on the live app

Leads offers GitHub and Google sign-in, has no custom domain, and has no app roles. Project
membership is by invite, so the role items below are checked as project membership.

```text
[ ] GitHub sign-in → app.auth.user set; cookie __Host-pas_session present, HttpOnly
[ ] Google sign-in
[ ] Reload while signed in → no sign-in flash, no redirect loop
[ ] Deep link → sign-in → returns to the same path
[ ] Sign-out → /.pas/auth/me is 401; no identity in storage
[ ] Profile menu › Recover session… (/.pas/auth/recover) → lands on /?recovered=1 signed out
[ ] Invite account B to a project, assign B a lead in one of its lists → B sees it in Assigned to me
    and can change its status; remove B from the project → the lead is unassigned and B no longer sees it
```

### PAS-UI-006 / PAS-UI-023: the rendered app, desktop and phone, light and dark

`web/qa` already covers some of these in CI (`pnpm test`): no sideways scroll and ≥ 44 px targets
at 360 px and 640 px, links shortened without losing the URL, sort controls, and activity times.

```text
[ ] axe DevTools: no critical/serious issues on the main routes, light and dark
[ ] Keyboard walk: every control reachable; focus visible; dialog opens/Escape closes/focus returns
[ ] Landmarks + one h1 per route in the accessibility tree; title changes per route
[ ] 360 px: no horizontal scroll; long URL wraps; targets ≥ 44 px (also asserted by qa:mobile)
[ ] 200 % zoom and text size lg: nothing clipped; pinch-zoom works on a phone
[ ] Contrast of custom colour pairs measured, both schemes (--series-1/--series-2, status chips, attention row)
[ ] Install (Android + iOS): standalone launch, correct icon; opens offline to the shell
[ ] Sign-out then Cache Storage: no /.pas/ or API entries
[ ] No CSP violations in the console
```

### PAS-OPS-019: production operations

```text
[ ] Deploy evidence bundle for the last deploy is complete (scripts/deploy-evidence.sh + owner items)
[ ] gh secret list / gh variable list show no infrastructure tokens; pas secret list matches the README
[ ] Sign-in per provider and sign-out on the live URL
[ ] Post-deploy smoke ran signed in and passed; no two failed deploy smokes in a row
[ ] Owner has reviewed error logs this week (PAS-OPS-012); entries carry the current build SHA
[ ] Export → import rehearsal done in the last 6 months; README recovery + retention sections current
[ ] delete_my_data run for a test user leaves nothing behind
[ ] pnpm audit --prod clean; Dependabot PRs triaged
[ ] Last incident record (if any) has every field
```

### Runs

| Date | Checklist | Hostname | Operator | Result |
|---|---|---|---|---|
| — | none run yet | | | |
