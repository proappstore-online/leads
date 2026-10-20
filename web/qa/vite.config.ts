import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Which fixture set to render against (QA_FIXTURES), so one config serves every check. */
const fixtures = here(process.env.QA_FIXTURES ?? './fixtures/actions.ts')

/** The real app, with the platform SDK and every action replaced by fixtures. */
export default defineConfig({
  root: here('..'),
  // One dependency cache per fixture set (#72). Each set's alias changes the config hash, so a
  // shared cache was re-optimized on every start, and a server starting while another check ran
  // rewrote the dependencies that check's page was loading.
  cacheDir: here(`../node_modules/.vite/qa-${basename(fixtures, '.ts')}`),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@proappstore\/sdk(\/hooks)?$/, replacement: here('./fixtures/sdk.tsx') },
      { find: /^.*\/lib\/actions$/, replacement: fixtures },
    ],
  },
})
