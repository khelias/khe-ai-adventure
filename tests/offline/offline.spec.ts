import { createHmac } from 'node:crypto'
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Route } from '@playwright/test'
import { BUILD_DIR, SERVED_DIR, TEST_SECRET } from './paths'

const SETUP_HEADING = 'Vali seikluse suund'
const OFFLINE_NOTICE = /Internetiühendus puudub/
const OTHER_APP_CACHE = 'study-shell-keep'
const PLAYERS = 3

const STORY = {
  title: 'Proovilugu',
  summary: 'Kolm mängijat jäävad jaama lõksu.',
  roles: Array.from({ length: PLAYERS }, (_, index) => ({
    name: `Roll ${index + 1}`,
    description: 'Ootab jaamas.',
    ability: 'Avab ukse.',
    abilityParameter: 'Aeg',
  })),
  parameters: [
    { name: 'Aeg', states: ['Palju', 'Vähe', 'Otsas'], archetype: 'time' },
    { name: 'Usaldus', states: ['Tugev', 'Habras', 'Kadunud'], archetype: 'bond' },
  ],
}

const TURN = {
  scene: 'Esimene stseen algab jaamas.',
  parameters: [],
  choices: [
    { text: 'Mine edasi', isAbility: false, expectedChanges: [] },
    { text: 'Jää ootama', isAbility: false, expectedChanges: [] },
  ],
  consequences: [],
  gameOver: false,
}

const ok = (data: unknown) => (route: Route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify({ data }) })
const unavailable = (route: Route) => route.fulfill({ status: 503, body: 'upstream down' })

/** Answers the proxy's calls in order. */
async function stubProxy(page: Page, answers: ((route: Route) => Promise<void>)[]): Promise<void> {
  await page.route('**/adventure/api/generate', async (route) => {
    const answer = answers.shift()
    if (!answer) throw new Error('an unexpected call to the proxy')
    await answer(route)
  })
}

async function openControlled(page: Page): Promise<void> {
  await page.goto('/adventure/?lang=et')
  await expect(page.getByRole('heading', { name: SETUP_HEADING })).toBeVisible()
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller))
}

async function chooseMock(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Täpsemad mudelivalikud' }).click()
  await page.getByRole('button', { name: 'Mock' }).click()
}

async function submitSetup(page: Page): Promise<void> {
  for (let step = 0; step < 3; step += 1) {
    await page.getByRole('button', { name: /Järgmine samm/ }).click()
  }
  await page.getByRole('checkbox', { name: /vähemalt 18-aastased/ }).check()
  await page.getByRole('button', { name: /Koosta seiklus/ }).click()
}

async function reachSecrets(page: Page): Promise<void> {
  await submitSetup(page)
  await page.getByRole('button', { name: 'Vali see lugu' }).click()
  await page.getByRole('button', { name: 'Alusta mängu' }).click()
  await expect(page.getByText(`Mängija 1 / ${PLAYERS}`)).toBeVisible()
}

async function passSecrets(page: Page): Promise<void> {
  for (let player = 1; player <= PLAYERS; player += 1) {
    await expect(page.getByText(`Mängija ${player} / ${PLAYERS}`).first()).toBeVisible()
    await page.locator('.secret-primary-action').click()
    await expect(page.locator('.secret-stamp')).toBeVisible()
    await page.locator('.secret-primary-action').click()
  }
}

const shellCaches = (page: Page) =>
  page.evaluate(async () => (await caches.keys()).filter((name) => name.startsWith('adventure-shell-')))

const addOtherAppCache = (page: Page) =>
  page.evaluate(async (name) => { await caches.open(name) }, OTHER_APP_CACHE)

const markPage = (page: Page) =>
  page.evaluate(() => { (window as unknown as { keptAlive: boolean }).keptAlive = true })

const pageWasKept = (page: Page) =>
  page.evaluate(() => (window as unknown as { keptAlive?: boolean }).keptAlive === true)

const checkForUpdate = (page: Page) =>
  page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    await registration.update().catch(() => undefined)
  })

/** Deploys the same build as a new version, with `edit` applied to its worker. */
async function deployNewWorker(page: Page, edit: (source: string) => string = (source) => source): Promise<string> {
  const [current] = await shellCaches(page)
  const version = (current ?? '').replace('adventure-shell-', '')
  const next = 'a'.repeat(version.length)
  const file = join(SERVED_DIR, 'sw.js')
  writeFileSync(file, edit(readFileSync(file, 'utf8').replaceAll(version, next)))
  return `adventure-shell-${next}`
}

test.beforeEach(async ({ context }) => {
  rmSync(SERVED_DIR, { recursive: true, force: true })
  cpSync(BUILD_DIR, SERVED_DIR, { recursive: true })
  await context.route('**/assets/analytics-consent.js', (route) =>
    route.fulfill({ contentType: 'application/javascript', body: '' }),
  )
})

test('the manifest, the icons and the product view are in place', async ({ page, request }) => {
  await page.goto('/adventure/?lang=et')
  await expect(page.locator('html')).toHaveAttribute('data-khe-view', 'product')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/adventure/manifest.webmanifest')
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/adventure/icon-180.png')

  const response = await request.get('/adventure/manifest.webmanifest')
  expect(response.headers()['content-type']).toContain('application/manifest+json')
  const manifest = (await response.json()) as {
    id: string
    scope: string
    start_url: string
    name: string
    display: string
    icons: { src: string; sizes: string; purpose: string }[]
  }
  expect(manifest).toMatchObject({
    id: '/adventure/',
    scope: '/adventure/',
    start_url: '/adventure/',
    name: 'AI Seiklus',
    display: 'standalone',
  })
  expect(manifest.icons.map((icon) => `${icon.sizes} ${icon.purpose}`)).toEqual([
    '192x192 any',
    '512x512 any',
    '512x512 maskable',
  ])
  for (const icon of manifest.icons) {
    const image = await request.get(icon.src)
    expect(image.headers()['content-type']).toBe('image/png')
  }
})

test('starts offline with a notice, and the mock provider still plays', async ({ page, context }) => {
  await openControlled(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: SETUP_HEADING })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: OFFLINE_NOTICE })).toBeVisible()

  await chooseMock(page)
  await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0)
  await reachSecrets(page)
  await passSecrets(page)
  await expect(page.locator('button.choice').first()).toBeVisible()
})

test('a consent script that never answers does not hold the app back', async ({ page }) => {
  await openControlled(page)
  await page.route('**/assets/analytics-consent.js', () => undefined)
  await page.reload({ waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: SETUP_HEADING })).toBeVisible()
})

test('the signing secret and the API stay out of the cache', async ({ page }) => {
  await openControlled(page)
  const cached = await page.evaluate(async () => {
    const urls: string[] = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      urls.push(...(await cache.keys()).map((request) => new URL(request.url).pathname))
    }
    return urls
  })
  expect(cached).toContain('/adventure/')
  expect(cached).toContain('/adventure/manifest.webmanifest')
  expect(cached.filter((path) => path.endsWith('/config.js') || path.includes('/api/'))).toEqual([])
})

test('a start without network signs its requests once the network returns', async ({ page, context }) => {
  await openControlled(page)
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: SETUP_HEADING })).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText(OFFLINE_NOTICE)).toHaveCount(0)

  const config = page.waitForResponse((response) => response.url().endsWith('/adventure/config.js'))
  const signed: { body: string; signature: string | undefined }[] = []
  await stubProxy(page, [
    (route) => {
      const request = route.request()
      signed.push({ body: request.postData() ?? '', signature: request.headers()['x-adventure-signature'] })
      return ok({ stories: [STORY] })(route)
    },
  ])
  await submitSetup(page)
  await expect(page.getByRole('button', { name: 'Vali see lugu' })).toBeVisible()

  expect((await config).fromServiceWorker()).toBe(false)
  expect(signed).toHaveLength(1)
  const [call] = signed
  expect(call?.signature).toBe(createHmac('sha256', TEST_SECRET).update(call?.body ?? '').digest('hex'))
})

test('a failed first turn can be retried, and a failed turn keeps the typed text', async ({ page }) => {
  const typed = 'Uurime tabloo tagust hooldusluuki.'
  await stubProxy(page, [ok({ stories: [STORY] }), unavailable, ok(TURN), unavailable])
  await openControlled(page)
  await reachSecrets(page)
  await passSecrets(page)

  await page.getByRole('button', { name: 'Proovi uuesti' }).click()
  await expect(page.getByText(TURN.scene)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Proovi uuesti' })).toHaveCount(0)

  await page.getByRole('button', { name: /Kirjuta oma valik/ }).click()
  await page.locator('textarea.input-page').fill(typed)
  await page.getByRole('button', { name: 'Kinnita' }).click()
  await expect(page.getByText(/AI pole praegu saadaval/)).toBeVisible()
  await expect(page.locator('textarea.input-page')).toHaveValue(typed)
})

test('leaving a game asks first, from the button and from the back gesture', async ({ page }) => {
  const dialog = page.getByRole('dialog', { name: 'Kas lõpetate mängu?' })
  await openControlled(page)
  await chooseMock(page)
  await reachSecrets(page)

  await page.goBack()
  await expect(dialog).toBeVisible()
  await expect(page.getByText(`Mängija 1 / ${PLAYERS}`)).toBeVisible()
  await dialog.getByRole('button', { name: 'Mängi edasi' }).click()
  await expect(dialog).toHaveCount(0)

  await passSecrets(page)
  await expect(page.locator('button.choice').first()).toBeVisible()

  await page.goBack()
  await expect(dialog).toBeVisible()
  await page.goBack()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('button.choice').first()).toBeVisible()

  await page.getByRole('button', { name: 'Lõpeta mäng' }).click()
  await dialog.getByRole('button', { name: 'Lõpeta mäng' }).click()
  await expect(page.getByRole('heading', { name: SETUP_HEADING })).toBeVisible()
  await expect(dialog).toHaveCount(0)
})

test('a new build waits for the game to close, then replaces only its own cache', async ({ page, context }) => {
  await openControlled(page)
  await addOtherAppCache(page)
  await markPage(page)
  const [oldCache] = await shellCaches(page)
  const newCache = await deployNewWorker(page)

  await checkForUpdate(page)
  await page.waitForFunction(async () => Boolean((await navigator.serviceWorker.ready).waiting))
  expect(await pageWasKept(page)).toBe(true)
  expect(await shellCaches(page)).toEqual(expect.arrayContaining([oldCache, newCache]))

  await page.close()
  // Watched from outside the worker's scope: a window inside it would keep the old worker in use.
  const outside = await context.newPage()
  await outside.goto('/outside-the-scope')
  await expect.poll(() => shellCaches(outside), { timeout: 15_000 }).toEqual([newCache])
  expect(await outside.evaluate(() => caches.keys())).toContain(OTHER_APP_CACHE)
})

test('an install that cannot fetch every file keeps the old worker and cache', async ({ page, context }) => {
  await openControlled(page)
  const [oldCache] = await shellCaches(page)
  await deployNewWorker(page, (source) => source.replace('icon-192.png', 'icon-gone.png'))

  await checkForUpdate(page)
  await page.waitForFunction(async () => {
    const registration = await navigator.serviceWorker.ready
    return !registration.installing && !registration.waiting
  })
  await expect.poll(() => shellCaches(page)).toEqual([oldCache])

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: SETUP_HEADING })).toBeVisible()
})

test('the kill-switch removes the worker and this app\'s caches, and keeps the game open', async ({ page }) => {
  await openControlled(page)
  await addOtherAppCache(page)
  await markPage(page)
  writeFileSync(join(SERVED_DIR, 'sw.js'), readFileSync('web/sw-kill-switch.js'))

  await checkForUpdate(page)
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0)
  await expect.poll(() => shellCaches(page)).toEqual([])
  expect(await page.evaluate(() => caches.keys())).toContain(OTHER_APP_CACHE)
  expect(await pageWasKept(page)).toBe(true)
})
