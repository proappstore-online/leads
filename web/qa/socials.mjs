/** Exercise the real UI validator for every supported social domain. */
import { readFileSync } from 'node:fs'
import ts from 'typescript'
import assert from 'node:assert/strict'
const { outputText } = ts.transpileModule(readFileSync(new URL('../src/lib/socials.ts', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } })
const { SOCIALS, isProfileLink } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`)
for (const { domains } of SOCIALS) for (const domain of domains) {
  for (const value of [`https://evil.example\\foo.${domain}/profile`, `https://evil.example?foo.${domain}/profile`, `https://evil.example#foo.${domain}/profile`, `https://user@www.${domain}/profile`, `https://www.${domain}/pro\\file`, `https://www.${domain}/pro\tfile`, `https://www.${domain}/pro\nfile`, `https://www.${domain}/pro\u0000file`, `https://${domain}/`, `http://${domain}/profile`]) {
    assert.equal(isProfileLink(domains, value), false, value)
  }
  for (const value of [`https://${domain}/profile`, `HTTPS://WWW.${domain.toUpperCase()}/profile?tab=1#about`]) assert.equal(isProfileLink(domains, value), true, value)
  console.log(`PASS  #46: ${domain} UI rejects ambiguous URLs and accepts valid profiles`)
}
