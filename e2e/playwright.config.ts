import { defineConfig, devices } from '@playwright/test'

// Drives the LIVE deployed app. deploy.yml sets E2E_BASE_URL to https://<repo>.proappstore.online.
const baseURL = process.env.E2E_BASE_URL || 'https://leads.proappstore.online'

export default defineConfig({
  testDir: './tests',
  // The signed-in smoke writes and deletes a lead in one account - keep runs sequential.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // deploy.yml's "Publish test results" step reads ./results.json.
  reporter: [['json', { outputFile: 'results.json' }], ['list']],
  use: { baseURL, trace: 'on-first-retry' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
})
