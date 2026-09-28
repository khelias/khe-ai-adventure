import type { Language, Provider } from '../game/types'
import { callMockAI } from './mockAdventure'
import { resolveApiSecret } from './runtimeConfig'

const API_URL = '/adventure/api/generate'

// Opaque JSON schema shape — the proxy forwards it to whichever provider is
// selected. We keep it untyped deliberately; canonical schemas live in
// src/game/prompts/schemas.ts.
export type JsonSchema = Record<string, unknown>

const secret = resolveApiSecret(window.__ADVENTURE_CONFIG__, import.meta.env.VITE_API_SECRET)

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function errorMessageFromPayload(value: unknown): string | null {
  if (!isRecord(value) || typeof value.error !== 'string') return null
  return value.error
}

async function generateSignature(payloadStr: string): Promise<string> {
  if (!secret) return ''
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payloadStr))
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function callAI<T = unknown>(
  prompt: string,
  schema: JsonSchema,
  provider: Provider,
  systemPrompt?: string,
  language?: Language,
): Promise<T> {
  if (provider === 'mock') {
    return callMockAI<T>({ prompt, schema, systemPrompt, language })
  }

  const body: Record<string, unknown> = { prompt, schema, provider }
  if (systemPrompt) body.systemPrompt = systemPrompt
  if (language) body.language = language

  const payloadStr = JSON.stringify(body)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  const sig = await generateSignature(payloadStr)
  if (sig) {
    headers['x-adventure-signature'] = sig
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers,
    body: payloadStr,
  })

  if (!response.ok) {
    const errorData: unknown = await response
      .json()
      .catch(() => ({ error: 'Invalid JSON response from server' }))
    throw new Error(errorMessageFromPayload(errorData) ?? `Request failed with status ${response.status}`)
  }

  const result: unknown = await response.json()
  if (!isRecord(result) || !isRecord(result.data)) {
    throw new Error('Proxy returned an invalid or empty response structure.')
  }
  return result.data as T
}
