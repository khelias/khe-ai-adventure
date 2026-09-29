import { devices, expect, test, type Page, type TestInfo } from '@playwright/test'

const STABLE_RENDER_CSS = `
  *,
  *::before,
  *::after {
    animation-delay: 0s !important;
    animation-duration: 0.001ms !important;
    animation-iteration-count: 1 !important;
    caret-color: transparent !important;
    scroll-behavior: auto !important;
    transition-delay: 0s !important;
    transition-duration: 0s !important;
  }

  .param-impact-overlay {
    display: none !important;
  }
`

function collectBrowserErrors(page: Page) {
  const errors: string[] = []

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(`console.error: ${message.text()}`)
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`pageerror: ${error.message}`)
  })

  return errors
}

function collectGenerationRequests(page: Page) {
  const requests: string[] = []

  page.on('request', (request) => {
    if (request.url().includes('/adventure/api/generate')) {
      requests.push(request.url())
    }
  })

  return requests
}

async function expectNoBrowserErrors(errors: string[], testInfo: TestInfo) {
  if (errors.length > 0) {
    await testInfo.attach('browser-errors', {
      body: errors.join('\n'),
      contentType: 'text/plain',
    })
  }

  expect(errors).toEqual([])
}

async function expectNoModelRequests(requests: string[], testInfo: TestInfo) {
  if (requests.length > 0) {
    await testInfo.attach('model-requests', {
      body: requests.join('\n'),
      contentType: 'text/plain',
    })
  }

  expect(requests).toEqual([])
}

async function gotoFreshSetup(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.clear()
    window.localStorage.setItem(
      'khe.analyticsConsent.v1',
      JSON.stringify({ value: 'denied', updatedAt: '2026-04-26T00:00:00.000Z' }),
    )
  })
  await page.goto('/?lang=et')
  await page.addStyleTag({ content: STABLE_RENDER_CSS })
  await expect(page.getByRole('heading', { name: 'Vali seikluse suund' })).toBeVisible()
}

async function chooseMockProvider(page: Page) {
  await page.getByRole('button', { name: 'Täpsemad mudelivalikud' }).click()
  await expect(page.getByRole('button', { name: 'Mock' })).toBeVisible()
  await page.getByRole('button', { name: 'Mock' }).click()
  await expect(page.getByRole('button', { name: 'Claude' })).toHaveCount(0)
}

async function completeLongSixPlayerSetup(page: Page) {
  await chooseMockProvider(page)
  await page.getByRole('button', { name: /Pikk/ }).click()
  await page.getByRole('button', { name: /Järgmine samm/ }).click()

  await expect(page.getByRole('heading', { name: 'Kes mängivad?' })).toBeVisible()
  await page.getByRole('button', { name: '6 mängijat' }).click()
  await page.getByPlaceholder(/Mart, Mari ja Jaan/).fill('Mari, Jaan, Liis, Rasmus, Kärt ja Toomas')
  await expect(page.getByText(/saadetakse loo loomiseks tehisintellekti teenusepakkujale/)).toBeVisible()
  await page.getByRole('button', { name: /Järgmine samm/ }).click()

  await expect(page.getByRole('heading', { name: 'Kus seiklus algab?' })).toBeVisible()
  await page.getByPlaceholder(/köögilaua ääres/).fill('Vanal bussijaama perroonil')
  await page.getByRole('button', { name: 'pingeline' }).click()
  await page.getByRole('button', { name: /Järgmine samm/ }).click()

  await expect(page.getByRole('heading', { name: 'Viimane detail' })).toBeVisible()
  await page.getByPlaceholder(/keegi unustas/).fill('Tablool vilgub number 13')
  const startButton = page.getByRole('button', { name: /Koosta seiklus/ })
  await expect(startButton).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Kinnitan, et kõik mängijad on vähemalt 18-aastased' }).check()
  await expect(startButton).toBeEnabled()
  await startButton.click()
}

async function verifyStoryChoice(page: Page) {
  const title = page.getByRole('heading', { name: 'Ööbuss terminalist 13' })
  await expect(title).toBeVisible()
  await expect(title).toBeInViewport()
  await expect(page.getByText('Päästeaken')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vali see lugu' })).toBeVisible()
}

async function verifyCustomStoryForm(page: Page) {
  await page.getByRole('button', { name: /Kirjuta oma algus/ }).click()
  await expect(page.getByRole('button', { name: 'Kasuta seda algust' })).toBeDisabled()
  await page.getByRole('button', { name: 'Tühista' }).click()
}

async function chooseStory(page: Page) {
  await page.getByRole('button', { name: 'Vali see lugu' }).click()
}

async function verifyRoleAssignment(page: Page) {
  const title = page.getByRole('heading', { name: 'Ööbuss terminalist 13' })
  await expect(title).toBeVisible()
  await expect(title).toBeInViewport()
  await expect(page.locator('.role-name-input')).toHaveCount(6)
  await page.getByRole('button', { name: 'Alusta mängu' }).click()
}

async function completeSecretHandoff(page: Page) {
  await expect(page.getByRole('heading', { name: 'Igaüks saab ühe salajase eesmärgi. Teised ei tohi näha.' })).toBeVisible()

  for (let playerIndex = 0; playerIndex < 6; playerIndex += 1) {
    await expect(page.getByText(`Mängija ${playerIndex + 1} / 6`)).toBeVisible()
    await page.locator('.secret-primary-action').click()
    await expect(page.locator('.secret-stamp', { hasText: 'SALAJANE' })).toBeVisible()
    await page.locator('.secret-primary-action').click()
  }

  await expect(page.getByText('Mock-öö algab')).toBeVisible()
}

async function openAbilityDrawer(page: Page) {
  await page.getByRole('button', { name: 'Kasuta erioskust' }).click()
  await expect(page.getByRole('dialog', { name: 'Erioskuste kasutamine' })).toBeVisible()
  await expect(page.locator('.ability-card')).toHaveCount(6)
}

async function submitCustomChoice(page: Page) {
  await page.getByRole('button', { name: /Kirjuta oma valik/ }).click()
  await page.locator('textarea.input-page').fill('Uurime tabloo tagust hooldusluuki.')
  await page.getByRole('button', { name: 'Kinnita' }).click()
  await expect(page.getByText('Valitud tegevus oli')).toBeVisible()
}

async function playToNarrativeEnding(page: Page) {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (await page.getByRole('heading', { name: 'Lugu jõudis lõpuni' }).isVisible()) {
      await expect(page.getByRole('heading', { name: 'Lugu jõudis lõpuni' })).toBeInViewport()
      return
    }

    await expect(page.locator('button.choice').first()).toBeVisible()
    await page.locator('button.choice').first().click()
    await expect(
      page.getByRole('heading', { name: 'Lugu jõudis lõpuni' }).or(page.locator('button.choice').first()),
    ).toBeVisible()
  }

  await expect(page.getByRole('heading', { name: 'Lugu jõudis lõpuni' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Lugu jõudis lõpuni' })).toBeInViewport()
}

test.describe('desktop setup smoke', () => {
  test.use({
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    viewport: { width: 1280, height: 900 },
  })

  test('provider panel closes cleanly and setup has a visual baseline', async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)
    const generationRequests = collectGenerationRequests(page)

    await gotoFreshSetup(page)
    await chooseMockProvider(page)
    await expect(page.getByText('18+ · Lugu kirjutab tehisintellekt')).toBeVisible()

    await expect(page).toHaveScreenshot('desktop-setup.png')
    await expectNoBrowserErrors(errors, testInfo)
    await expectNoModelRequests(generationRequests, testInfo)
  })
})

test.describe('mobile mock game smoke', () => {
  const pixel5 = devices['Pixel 5']

  test.use({
    deviceScaleFactor: pixel5.deviceScaleFactor,
    hasTouch: pixel5.hasTouch,
    isMobile: pixel5.isMobile,
    userAgent: pixel5.userAgent,
    viewport: { width: 390, height: 844 },
  })

  test('covers setup, story choice, secrets, gameplay, ending, and sequel', async ({ page }, testInfo) => {
    const errors = collectBrowserErrors(page)
    const generationRequests = collectGenerationRequests(page)

    await gotoFreshSetup(page)
    await expect(page).toHaveScreenshot('mobile-setup.png')

    await completeLongSixPlayerSetup(page)
    await verifyStoryChoice(page)
    await expect(page).toHaveScreenshot('mobile-story-choice.png')

    await verifyCustomStoryForm(page)
    await chooseStory(page)
    await verifyRoleAssignment(page)
    await expect(page).toHaveScreenshot('mobile-secret-handoff.png')

    await completeSecretHandoff(page)
    await expect(page).toHaveScreenshot('mobile-gameplay.png')

    await openAbilityDrawer(page)
    await expect(page).toHaveScreenshot('mobile-ability-drawer.png')
    await page.locator('.ability-card').first().click()
    await expect(page.getByText('Valitud tegevus oli')).toBeVisible()

    await submitCustomChoice(page)
    await playToNarrativeEnding(page)
    await expect(page.getByText('saladused paljastatud')).toBeVisible()
    await expect(page).toHaveScreenshot('mobile-game-over.png')

    await page.getByRole('button', { name: 'Näita kogu lugu' }).click()
    await expect(page.getByText('Stseen 01')).toBeVisible()
    await page.getByRole('button', { name: 'Jätka järjelooga' }).click()

    await expect(page.getByRole('heading', { name: 'Järjelugu' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Järjelugu' })).toBeInViewport()
    await expect(page.locator('.role-name-input')).toHaveCount(6)
    await expect(page).toHaveScreenshot('mobile-sequel.png')

    await expectNoBrowserErrors(errors, testInfo)
    await expectNoModelRequests(generationRequests, testInfo)
  })
})
