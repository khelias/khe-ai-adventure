// The web image writes config.js at container start, so one image serves every
// environment and the HMAC key is not baked into a public image. `npm run dev`
// has no such file content and keeps using VITE_API_SECRET.
export function resolveApiSecret(
  runtime: AdventureRuntimeConfig | undefined,
  buildTime: string | undefined,
): string {
  return runtime?.apiSecret || buildTime || ''
}
