# Browser checks

The real app, rendered against fixtures (`fixtures/`) instead of the platform API, driven by a
headless Chromium.

```bash
pnpm qa:mobile        # from web/, or `pnpm --filter @leads/web qa:mobile` from the repo root
```

`mobile.mjs` (implemented by `overflow.mjs`) covers issue #19: no page or modal scrolls sideways at
360px and 640px, and every visible button, input, select and textarea is at least 44×44px when
leads, sources, notes and messages hold extreme URLs. It also keeps the issue #10 assertion that
every shortened link still points at the whole URL.

It needs a Chromium for Playwright. If it reports none, install one with
`npx playwright install chromium`, or point `CHROMIUM_PATH` at a browser binary. It runs in CI.
