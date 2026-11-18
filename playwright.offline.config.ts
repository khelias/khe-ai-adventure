import { defineConfig, devices } from '@playwright/test'

// The production build under its worker, served as the web image serves it. The specs change
// the served files, so they run one at a time, each against a fresh copy of the build.
const PORT = 4251

export default defineConfig({
  testDir: './tests/offline',
  globalSetup: './tests/offline/global-setup.ts',
  workers: 1,
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  outputDir: 'test-results/offline',
  use: {
    ...devices['Pixel 5'],
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npx tsx tests/offline/server.ts',
    port: PORT,
    env: { PORT: String(PORT) },
  },
})
