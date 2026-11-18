import { defineConfig } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:5173'
const shouldStartServer = !process.env.PLAYWRIGHT_BASE_URL
const browserChannel = process.env.PLAYWRIGHT_BROWSER_CHANNEL

export default defineConfig({
  testDir: './tests',
  testIgnore: 'offline/**',
  timeout: 90_000,
  retries: process.env.CI ? 1 : 0,
  expect: {
    timeout: 7_500,
    toHaveScreenshot: {
      animations: 'disabled',
      maxDiffPixelRatio: 0.02,
      threshold: 0.18,
    },
  },
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    ...(browserChannel ? { channel: browserChannel } : {}),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: shouldStartServer
    ? {
        command: 'npm run dev -- --host 127.0.0.1 --port 5173 --strictPort',
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        url: baseURL,
      }
    : undefined,
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
      },
    },
  ],
})
