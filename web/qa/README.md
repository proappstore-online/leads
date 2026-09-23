# Browser checks

The real app, rendered against fixtures (`fixtures/`) instead of the platform API, driven by a
headless Chromium.

```bash
pnpm qa:overflow      # from web/, or `pnpm --filter @leads/web qa:overflow` from the repo root
```

`overflow.mjs` covers issue #10: no page or modal scrolls sideways at 320px and 375px when leads,
sources, notes and messages hold extreme URLs, and every link still points at the whole URL.

It needs a Chromium for Playwright. If it reports none, install one with
`npx playwright install chromium`, or point `CHROMIUM_PATH` at a browser binary. It is not part of
`pnpm build` or CI, which have no browser.
