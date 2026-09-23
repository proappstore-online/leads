import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

/** Which fixture set to render against (QA_FIXTURES), so one config serves every check. */
const fixtures = here(process.env.QA_FIXTURES ?? './fixtures/actions.ts')

/** The real app, with the platform SDK and every action replaced by fixtures. */
export default defineConfig({
  root: here('..'),
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: /^@proappstore\/sdk(\/hooks)?$/, replacement: here('./fixtures/sdk.tsx') },
      { find: /^.*\/lib\/actions$/, replacement: fixtures },
    ],
  },
})
