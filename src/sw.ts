/// <reference lib="webworker" />
// The service worker (estate ADR-041): the shell starts without a network. It decides by URL
// alone. config.js carries the signing secret and api/ is the game's backend, so both go to
// the network as if there were no worker. A new worker waits for every window to close: it
// never takes over or reloads a game in progress.
// build/sw.ts compiles this file once per build with the constants below filled in.

declare const self: ServiceWorkerGlobalScope
declare const __SW_VERSION__: string
declare const __SW_BASE__: string
declare const __SW_PRECACHE__: readonly string[]

const CACHE_PREFIX = 'adventure-shell-'
const BASE = __SW_BASE__
const SHELL = `${CACHE_PREFIX}${__SW_VERSION__}`
const PRECACHE = new Set(__SW_PRECACHE__)
const NAVIGATION_TIMEOUT_MS = 3000

const keepable = (response: Response) =>
  response.ok && response.type === 'basic' && !response.redirected

// nginx answers an unknown path under the base with index.html, status 200.
const isExpected = (path: string, response: Response) =>
  path === '' || !(response.headers.get('content-type') ?? '').includes('text/html')

// Hashed assets never change under their name, so the HTTP cache may answer them; the rest is
// asked of the server. A deploy deletes old hashed files, so one missing file fails the whole
// install and the previous worker keeps its complete cache.
async function precache(): Promise<void> {
  // A rollback can reinstall the version that is running, whose cache must survive a failure.
  const reinstall = await caches.has(SHELL)
  const cache = await caches.open(SHELL)
  try {
    await Promise.all(
      [...PRECACHE].map(async (path) => {
        const url = BASE + path
        const mode: RequestCache = path.startsWith('assets/') ? 'default' : 'reload'
        const response = await fetch(url, { cache: mode })
        if (!keepable(response) || !isExpected(path, response)) {
          throw new Error(`precache: ${url} answered ${response.status} ${response.type}`)
        }
        await cache.put(url, response)
      }),
    )
    // An older worker that activates during this install prunes this cache.
    if (!(await caches.has(SHELL))) throw new Error(`precache: ${SHELL} was removed during install`)
  } catch (error) {
    if (!reinstall) await caches.delete(SHELL)
    throw error
  }
}

// Only this app's own prefix: /study/ shares the origin's Cache Storage.
async function prune(): Promise<void> {
  for (const name of await caches.keys()) {
    if (name.startsWith(CACHE_PREFIX) && name !== SHELL) await caches.delete(name)
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache())
})

self.addEventListener('activate', (event) => {
  event.waitUntil(prune().then(() => self.clients.claim()))
})

// Network first, so a deploy shows at once. The answer is not stored: the saved page must stay
// the one whose hashed files are in this cache.
async function navigate(request: Request): Promise<Response> {
  const network = fetch(request)
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), NAVIGATION_TIMEOUT_MS)
  })
  try {
    const response = await Promise.race([network, timeout])
    if (response.ok) return response
    return (await caches.match(BASE, { cacheName: SHELL })) ?? response
  } catch {
    return (await caches.match(BASE, { cacheName: SHELL })) ?? network
  } finally {
    clearTimeout(timer)
  }
}

async function shell(request: Request, url: string): Promise<Response> {
  return (await caches.match(url, { cacheName: SHELL })) ?? fetch(request)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return
  const path = url.pathname.slice(BASE.length)
  if (path === 'config.js' || path.startsWith('api/')) return
  if (request.mode === 'navigate') event.respondWith(navigate(request))
  else if (PRECACHE.has(path)) event.respondWith(shell(request, url.pathname))
})
