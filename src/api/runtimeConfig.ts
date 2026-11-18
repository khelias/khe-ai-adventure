// The web image writes config.js at container start, so one image serves every
// environment and the HMAC key is not baked into a public image. `npm run dev`
// has no such file content and keeps using VITE_API_SECRET.
export function resolveApiSecret(
  runtime: AdventureRuntimeConfig | undefined,
  buildTime: string | undefined,
): string {
  return runtime?.apiSecret || buildTime || ''
}

// The app can start offline from the worker's cache, where config.js is never kept, so the
// secret is fetched when the first request needs it. A failed load is not remembered: the next
// request tries again once the network is back.
export function secretLoader(
  read: () => string,
  load: () => Promise<void>,
): () => Promise<string> {
  return async () => {
    if (!read()) await load()
    return read()
  }
}

export function loadConfigScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = src
    script.onload = () => {
      script.remove()
      resolve()
    }
    script.onerror = () => {
      script.remove()
      reject(new Error(`Could not load ${src}`))
    }
    document.head.append(script)
  })
}
