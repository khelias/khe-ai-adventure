#!/usr/bin/env tsx
// Minimal signed smoke test for the Adventure proxy. It exercises the same
// /generate contract as the app without playing a full game.

import { createHmac } from 'node:crypto'
import { parseArgs } from 'node:util'

import { storyGenerationPrompt, storyGenerationSchema } from '../src/game/prompts'
import type { ContextInput, Duration, Genre, Language, Provider, Story } from '../src/game/types'

const { values } = parseArgs({
  options: {
    endpoint: { type: 'string', default: 'https://games.khe.ee/adventure/api/generate' },
    provider: { type: 'string', default: 'gemini' },
    language: { type: 'string', default: 'et' },
    genre: { type: 'string', default: 'Thriller' },
    duration: { type: 'string', default: 'Short' },
    players: { type: 'string', default: '3' },
    origin: { type: 'string', default: 'https://games.khe.ee' },
    location: { type: 'string', default: 'praeguses toas laua ümber' },
    help: { type: 'boolean', default: false, short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: API_SECRET=... npm run proxy:smoke -- [options]

  --endpoint=<url>       Default: https://games.khe.ee/adventure/api/generate
  --provider=<provider>  gemini | claude. Default: gemini
  --language=<lang>      et | en. Default: et
  --genre=<genre>        Default: Thriller
  --duration=<duration>  Short | Medium | Long. Default: Short
  --players=<count>      Default: 3
  --origin=<origin>      Default: https://games.khe.ee
  --location=<text>      Optional context location
`)
  process.exit(0)
}

const endpoint = values.endpoint
const provider = values.provider as Provider
const language = values.language as Language
const genre = values.genre as Genre
const duration = values.duration as Duration
const players = Number(values.players)
const origin = values.origin
const apiSecret = process.env.API_SECRET || process.env.VITE_API_SECRET || ''

if (!Number.isInteger(players) || players < 1 || players > 6) {
  throw new Error('--players must be an integer from 1 to 6')
}
if (provider !== 'gemini' && provider !== 'claude') {
  throw new Error('--provider must be gemini or claude')
}
if (language !== 'et' && language !== 'en') {
  throw new Error('--language must be et or en')
}

const context: ContextInput = {
  location: values.location ?? '',
  playersDesc: '',
  vibe: 'tense',
  insideJoke: '',
}

const body = {
  prompt: storyGenerationPrompt({ players, genre, duration, language, context }),
  schema: storyGenerationSchema,
  provider,
  language,
}
const payload = JSON.stringify(body)
const headers: Record<string, string> = {
  'Content-Type': 'application/json',
  Origin: origin,
}

if (apiSecret) {
  headers['x-adventure-signature'] = createHmac('sha256', apiSecret)
    .update(payload)
    .digest('hex')
}

const startedAt = Date.now()
const response = await fetch(endpoint, {
  method: 'POST',
  headers,
  body: payload,
})
const rawText = await response.text()
let parsed: { provider?: string; model?: string; data?: { stories?: Story[] }; error?: string } | null
try {
  parsed = rawText ? parseProxySmokeResponse(JSON.parse(rawText) as unknown) : null
} catch {
  parsed = null
}

if (!response.ok) {
  const errorText = parsed?.error || rawText.slice(0, 400) || response.statusText
  throw new Error(`HTTP ${response.status}: ${errorText}`)
}

const story = parsed?.data?.stories?.[0]
if (!story) {
  throw new Error('Proxy returned success, but no story payload was present')
}

console.log([
  `HTTP ${response.status} in ${Date.now() - startedAt}ms`,
  `provider=${parsed?.provider ?? provider}`,
  `model=${parsed?.model ?? 'unknown'}`,
  `title=${story.title}`,
  `roles=${story.roles.length}`,
  `parameters=${story.parameters.length}`,
].join('\n'))

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function parseProxySmokeResponse(
  value: unknown,
): { provider?: string; model?: string; data?: { stories?: Story[] }; error?: string } | null {
  if (!isRecord(value)) return null

  const stories = isRecord(value.data) && Array.isArray(value.data.stories)
    ? value.data.stories as Story[]
    : undefined

  return {
    provider: typeof value.provider === 'string' ? value.provider : undefined,
    model: typeof value.model === 'string' ? value.model : undefined,
    data: stories ? { stories } : undefined,
    error: typeof value.error === 'string' ? value.error : undefined,
  }
}
