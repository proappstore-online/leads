import { initPro } from '@proappstore/sdk'

export const app = initPro({
  appId: 'leads',
  authMode: 'platform-cookie',
  // deploy.yml supplies this at build time, so platform error logs identify the
  // exact production build that emitted them.
  monitoring: { build: { sha: import.meta.env.VITE_COMMIT_SHA ?? 'local' } },
})
