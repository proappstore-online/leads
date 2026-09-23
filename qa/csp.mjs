/**
 * The per-app Content-Security-Policy, kept from rotting (PAS-UI-013; platform#188).
 *
 *   node qa/csp.mjs          (also part of `pnpm test`)
 *
 * web/index.html carries a <meta http-equiv="Content-Security-Policy"> that is stricter than the
 * platform header for scripts: no 'unsafe-inline', no 'unsafe-eval', the one inline theme
 * bootstrap allowed by its SHA-256. This recomputes that hash from the script's exact text and
 * asserts the directives, so a bootstrap edit or a loosened policy fails `pnpm test` rather than
 * flashing the wrong theme or quietly re-admitting inline script. It also holds the invariant the
 * CSP backs up: no HTML-injection sink in web/src.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const here = (p) => fileURLToPath(new URL(p, import.meta.url))
// Comments are stripped first: the policy's own explanatory comment must not read as markup.
const html = readFileSync(here('../web/index.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, '')

let failures = 0
const ok = (pass, what) => {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${what}`)
  if (!pass) failures++
}

const metaMatch = html.match(/<meta http-equiv="Content-Security-Policy"\s+content="([^"]+)"\s*\/?>/)
ok(!!metaMatch, 'index.html carries a Content-Security-Policy meta')
const csp = metaMatch?.[1] ?? ''
/** Directive → sources. */
const directives = Object.fromEntries(
  csp.split(';').map((d) => d.trim()).filter(Boolean).map((d) => {
    const [name, ...sources] = d.split(/\s+/)
    return [name, sources]
  }),
)

// --- The meta precedes every script, or the browser applies it too late -------------------------
const metaAt = html.indexOf('http-equiv="Content-Security-Policy"')
const firstScript = html.indexOf('<script')
ok(metaAt > -1 && metaAt < firstScript, 'the CSP meta comes before the first <script>')

// --- The directives an injection would exploit -------------------------------------------------
for (const d of ['script-src', 'object-src', 'base-uri', 'form-action']) ok(d in directives, `sets ${d}`)
ok(JSON.stringify(directives['object-src']) === JSON.stringify(["'none'"]), "object-src is 'none'")
ok(JSON.stringify(directives['base-uri']) === JSON.stringify(["'self'"]), "base-uri is 'self'")
ok(JSON.stringify(directives['form-action']) === JSON.stringify(["'self'"]), "form-action is 'self'")
ok(!(directives['script-src'] ?? []).includes("'unsafe-inline'"), "script-src has no 'unsafe-inline'")
ok(!csp.includes("'unsafe-eval'"), "no 'unsafe-eval' anywhere")
ok((directives['script-src'] ?? []).includes("'self'"), "script-src allows 'self' (the bundle)")

// --- Exactly one inline script, allowed by the hash of its exact text ----------------------------
const inline = [...html.matchAll(/<script>(.*?)<\/script>/gs)].map((m) => m[1])
ok(inline.length === 1, `exactly one inline script, the theme bootstrap (${inline.length} found)`)
const hash = `'sha256-${createHash('sha256').update(inline[0] ?? '').digest('base64')}'`
ok((directives['script-src'] ?? []).includes(hash),
  `script-src carries the bootstrap's current hash ${hash} — if the bootstrap changed, update the meta`)
ok(!/<script[^>]*>[^<]*<\/script>/.test(html.replace(/<script>[\s\S]*?<\/script>/, '').replace(/<script[^>]*\bsrc=/g, '')) ,
  'no other inline script sneaks in (event handlers and javascript: URLs count too)')
ok(!/\son[a-z]+="/i.test(html) && !/javascript:/i.test(html), 'no inline event handlers or javascript: URLs in index.html')

// --- Every external script index.html loads is allowed ------------------------------------------
for (const [, origin] of html.matchAll(/<script[^>]*\bsrc="(https:\/\/[^/"]+)/g)) {
  ok((directives['script-src'] ?? []).includes(origin), `external script origin ${origin} is allowed by script-src`)
}
// analytics.js injects the Cloudflare Web Analytics beacon at run time; it is not in index.html.
ok((directives['script-src'] ?? []).includes('https://static.cloudflareinsights.com'), 'the Cloudflare beacon analytics.js injects is allowed')

// --- The built page ships the same policy and the same bootstrap, byte for byte -----------------
const dist = here('../web/dist/index.html')
if (existsSync(dist)) {
  const built = readFileSync(dist, 'utf8').replace(/<!--[\s\S]*?-->/g, '')
  ok(built.includes(csp), 'the built index.html carries the same CSP')
  ok(built.includes(`<script>${inline[0]}</script>`), 'the built index.html keeps the bootstrap text unchanged (the hash still matches)')
  const builtInline = [...built.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  ok(builtInline.length === 1, `the build adds no inline script of its own (${builtInline.length} inline)`)
} else {
  console.log('SKIP  web/dist/index.html not built here — the built-page checks run after `pnpm build`')
}

// --- The invariant the CSP backs up: no HTML-injection sink in web/src --------------------------
const SINKS = /dangerouslySetInnerHTML|\.innerHTML\s*=|\.outerHTML\s*=|document\.write\(|\beval\(|new Function\(|insertAdjacentHTML\(/
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(p)
  }
  return out
}
const sinks = walk(here('../web/src')).filter((f) => SINKS.test(readFileSync(f, 'utf8')))
ok(sinks.length === 0, `no HTML-injection sink in web/src${sinks.length ? ` (${sinks.join(', ')})` : ''}`)

console.log(failures ? `\n${failures} CSP check(s) failed` : `\nall CSP checks passed`)
process.exit(failures ? 1 : 0)
