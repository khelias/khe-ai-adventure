// A proxy that is down reaches the browser as a thrown fetch or as an edge
// error page (Cloudflare's 502 or 530, HTML, not JSON). Both become
// ProxyUnavailableError, so the game says the AI is unavailable instead of
// showing a parse error. The proxy's own JSON errors keep their message,
// whatever the status: its 502 and 504 say why a turn failed.
export class ProxyUnavailableError extends Error {
  constructor(options?: { cause?: unknown }) {
    super('The adventure proxy is unavailable', options)
    this.name = 'ProxyUnavailableError'
  }
}

const UNAVAILABLE_STATUSES = new Set([502, 503, 504, 530])

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function errorMessageFromPayload(value: unknown): string | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null
  return value.error
}

export async function fetchProxy(
  input: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  try {
    return await fetchImpl(input, init)
  } catch (err) {
    throw new ProxyUnavailableError({ cause: err })
  }
}

export async function errorFromResponse(response: Response): Promise<Error> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    return new ProxyUnavailableError()
  }
  const message = errorMessageFromPayload(payload)
  if (message) return new Error(message)
  if (UNAVAILABLE_STATUSES.has(response.status)) return new ProxyUnavailableError()
  return new Error(`Request failed with status ${response.status}`)
}
