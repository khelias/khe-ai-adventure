export interface GeminiUsageMetadata {
  promptTokenCount?: number
  candidatesTokenCount?: number
  thoughtsTokenCount?: number
  cachedContentTokenCount?: number
  totalTokenCount?: number
}

export interface GeminiResponseError extends Error {
  status: number
  publicBody: { error: string }
  reason: string
}

export interface ParsedGeminiResponse {
  text: string
  usageMetadata: GeminiUsageMetadata
}

/** Throws a GeminiResponseError (status 502) for a blocked or truncated response. */
export function parseGeminiResponse(body: unknown): ParsedGeminiResponse
export const SAFETY_REASONS: ReadonlySet<string>
