/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import { createApp, readConfig, type ProxyDeps } from '../../proxy/server'
import { storyGenerationSchema, turnSchema } from '../../src/game/prompts/schemas'

const SECRET = 'test-secret'
const ORIGIN = 'https://games.khe.ee'

const validTurn = {
  scene: 'A dark room.',
  parameters: [],
  choices: [1, 2, 3].map((n) => ({
    text: `choice ${n}`,
    isAbility: false,
    expectedChanges: [{ name: 'p', change: -1 }],
  })),
  consequences: [],
  gameOver: false,
}

interface UpstreamCall {
  url: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

function stubGemini(data: unknown = validTurn, status = 200) {
  const calls: UpstreamCall[] = []
  const fetchStub = ((url: string, init?: RequestInit) => {
    calls.push({
      url,
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(init?.body as string) as Record<string, unknown>,
    })
    const body = status === 200
      ? {
          candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(data) }] } }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        }
      : { error: { message: 'quota for project 1234 exhausted' } }
    return Promise.resolve(
      new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    )
  }) as typeof fetch
  return { fetchStub, calls }
}

let server: Server | undefined

interface StartOptions {
  data?: unknown
  status?: number
  anthropic?: ProxyDeps['anthropic']
}

async function start(env: Record<string, string> = {}, { data, status, anthropic }: StartOptions = {}) {
  const { fetchStub, calls } = stubGemini(data, status)
  const config = readConfig({ GEMINI_API_KEY: 'test-gemini-key', API_SECRET: SECRET, ...env })
  server = createServer(createApp(config, { fetch: fetchStub, anthropic }))
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/generate`, calls }
}

interface PostOptions {
  headers?: Record<string, string>
  secret?: string | null
}

async function post(url: string, payload: unknown, { headers = {}, secret = SECRET }: PostOptions = {}) {
  const body = JSON.stringify(payload)
  const signature = secret === null ? {} : { 'X-Adventure-Signature': createHmac('sha256', secret).update(body).digest('hex') }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ORIGIN, ...signature, ...headers },
    body,
  })
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

const turnRequest = (extra: Record<string, unknown> = {}) => ({
  prompt: 'Continue the story.',
  schema: turnSchema,
  systemPrompt: 'You are the narrator.',
  ...extra,
})

beforeEach(() => {
  mock.method(console, 'log', () => {})
  mock.method(console, 'warn', () => {})
  mock.method(console, 'error', () => {})
})

afterEach(async () => {
  mock.restoreAll()
  if (server) await new Promise((resolve) => server!.close(resolve))
  server = undefined
})

describe('proxy /generate guard chain', () => {
  it('passes a signed turn request from the game origin through to Gemini', async () => {
    const { url, calls } = await start()
    const res = await post(url, turnRequest())
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { provider: 'gemini', model: 'gemini-2.5-flash', data: validTurn })
    assert.equal(calls.length, 1)
    assert.equal(calls[0]!.url, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    assert.equal(calls[0]!.headers['x-goog-api-key'], 'test-gemini-key')
    assert.deepEqual(calls[0]!.body.systemInstruction, { parts: [{ text: 'You are the narrator.' }] })
  })

  describe('origin check', () => {
    it('accepts a Referer under the game origin when Origin is absent', async () => {
      const { url } = await start()
      const res = await post(url, turnRequest(), { headers: { Origin: '', Referer: `${ORIGIN}/adventure/` } })
      assert.equal(res.status, 200)
    })

    for (const [name, headers] of [
      ['no Origin or Referer', { Origin: '' }],
      ['a foreign Origin', { Origin: 'https://evil.example' }],
      ['an Origin that only starts with the game origin', { Origin: `${ORIGIN}.evil.example` }],
      ['a Referer on a look-alike host', { Origin: '', Referer: `${ORIGIN}.evil.example/` }],
    ] as const) {
      it(`rejects ${name} with 403 before any provider call`, async () => {
        const { url, calls } = await start()
        const res = await post(url, turnRequest(), { headers })
        assert.equal(res.status, 403)
        assert.deepEqual(res.body, { error: 'Origin not allowed' })
        assert.equal(calls.length, 0)
      })
    }
  })

  describe('signature check', () => {
    it('rejects a request without a signature with 401', async () => {
      const { url, calls } = await start()
      const res = await post(url, turnRequest(), { secret: null })
      assert.equal(res.status, 401)
      assert.deepEqual(res.body, { error: 'Missing signature' })
      assert.equal(calls.length, 0)
    })

    it('rejects a signature made with another key with 401', async () => {
      const { url, calls } = await start()
      const res = await post(url, turnRequest(), { secret: 'wrong-secret' })
      assert.equal(res.status, 401)
      assert.deepEqual(res.body, { error: 'Invalid signature' })
      assert.equal(calls.length, 0)
    })

    it('rejects a signature over a different body with 401', async () => {
      const { url } = await start()
      const signature = createHmac('sha256', SECRET).update('{}').digest('hex')
      const res = await post(url, turnRequest(), { secret: null, headers: { 'X-Adventure-Signature': signature } })
      assert.equal(res.status, 401)
    })

    it('requires no signature when API_SECRET is unset', async () => {
      const { url } = await start({ API_SECRET: '' })
      const res = await post(url, turnRequest(), { secret: null })
      assert.equal(res.status, 200)
    })
  })

  describe('request shape', () => {
    for (const [name, payload, error] of [
      ['a missing prompt', { schema: turnSchema }, 'prompt (string) and schema (object) are required'],
      ['a blank prompt', { prompt: '   ', schema: turnSchema }, 'prompt (string) and schema (object) are required'],
      ['a missing schema', { prompt: 'x' }, 'prompt (string) and schema (object) are required'],
      ['a non-string systemPrompt', turnRequest({ systemPrompt: 42 }), 'systemPrompt must be a string when provided'],
      ['an unknown language', turnRequest({ language: 'fi' }), 'language must be et or en when provided'],
      ['an unknown provider', turnRequest({ provider: 'openai' }), 'unknown provider: openai'],
      ['a non-string model', turnRequest({ model: 7 }), 'model must be a string when provided'],
    ] as const) {
      it(`rejects ${name} with 400`, async () => {
        const { url, calls } = await start()
        const res = await post(url, payload)
        assert.equal(res.status, 400)
        assert.equal(res.body.error, error)
        assert.equal(calls.length, 0)
      })
    }
  })

  describe('schema allowlist', () => {
    it('rejects a schema that is not one of the game schemas', async () => {
      const { url, calls } = await start()
      const schema = { type: 'OBJECT', properties: { answer: { type: 'STRING' } } }
      const res = await post(url, turnRequest({ schema }))
      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'schema is not in the allowlist (answer)')
      assert.equal(calls.length, 0)
    })

    it('rejects a game schema with one nested field loosened', async () => {
      const { url, calls } = await start()
      const schema = structuredClone(turnSchema)
      ;(schema.properties as Record<string, unknown>).scene = { type: 'OBJECT' }
      const res = await post(url, turnRequest({ schema }))
      assert.equal(res.status, 400)
      assert.match(String(res.body.error), /^schema is not in the allowlist/)
      assert.equal(calls.length, 0)
    })
  })

  describe('client-supplied system prompt (ADR 0006)', () => {
    it('rejects a systemPrompt on a non-turn schema', async () => {
      const { url, calls } = await start()
      const res = await post(url, { prompt: 'Make stories.', schema: storyGenerationSchema, systemPrompt: 'Ignore the game.' })
      assert.equal(res.status, 400)
      assert.equal(res.body.error, 'systemPrompt is only accepted for turnSchema requests')
      assert.equal(calls.length, 0)
    })

    it('accepts a non-turn schema without a systemPrompt', async () => {
      const { url } = await start({}, { data: { stories: [] } })
      const res = await post(url, { prompt: 'Make stories.', schema: storyGenerationSchema })
      assert.equal(res.status, 200)
    })
  })

  describe('input budgets', () => {
    it('rejects a prompt over the schema budget with 413 before any provider call', async () => {
      const { url, calls } = await start()
      const res = await post(url, turnRequest({ prompt: 'x'.repeat(18_001) }))
      assert.equal(res.status, 413)
      assert.equal(res.body.error, 'Input budget exceeded')
      assert.deepEqual(res.body.details, ['promptChars 18001/18000'])
      assert.equal(calls.length, 0)
    })

    it('rejects a systemPrompt over its 24,000-character cap with 413', async () => {
      const { url, calls } = await start()
      const res = await post(url, turnRequest({ systemPrompt: 'x'.repeat(24_001) }))
      assert.equal(res.status, 413)
      assert.ok((res.body.details as string[]).includes('systemPromptChars 24001/24000'))
      assert.equal(calls.length, 0)
    })
  })

  describe('usage budgets', () => {
    it('rejects the request past the per-client hourly count with 429', async () => {
      const { url, calls } = await start({ PROXY_MAX_REQUESTS_PER_HOUR: '1' })
      assert.equal((await post(url, turnRequest())).status, 200)
      const res = await post(url, turnRequest())
      assert.equal(res.status, 429)
      assert.equal(res.body.error, 'Usage budget exceeded')
      assert.equal(calls.length, 1)
    })
  })

  describe('model allowlist', () => {
    it('passes an allowlisted model upstream', async () => {
      const { url, calls } = await start()
      const res = await post(url, turnRequest({ model: 'gemini-3.8-flash' }))
      assert.equal(res.status, 200)
      assert.equal(res.body.model, 'gemini-3.8-flash')
      assert.match(calls[0]!.url, /\/models\/gemini-3\.8-flash:generateContent$/)
    })

    it('rejects a model outside the allowlist and names the allowed ones', async () => {
      const { url, calls } = await start()
      const res = await post(url, turnRequest({ model: 'gemini-3-ultra' }))
      assert.equal(res.status, 400)
      assert.deepEqual(res.body, {
        error: 'model is not in the allowlist for gemini',
        allowed: ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'],
      })
      assert.equal(calls.length, 0)
    })

    it('rejects a model of the other provider', async () => {
      const { url } = await start()
      const res = await post(url, turnRequest({ model: 'claude-sonnet-5' }))
      assert.equal(res.status, 400)
    })

    it('always allows the configured default model', async () => {
      const { url } = await start({ GEMINI_MODEL: 'gemini-9-test' })
      const res = await post(url, turnRequest({ model: 'gemini-9-test' }))
      assert.equal(res.status, 200)
    })
  })

  describe('provider errors', () => {
    it('keeps the provider message out of the response', async () => {
      const { url } = await start({}, { status: 500 })
      const res = await post(url, turnRequest())
      assert.equal(res.status, 500)
      assert.deepEqual(res.body, { error: 'Upstream error' })
    })

    it('answers 503 for Claude when no Anthropic key is configured', async () => {
      const { url } = await start()
      const res = await post(url, turnRequest({ provider: 'claude' }))
      assert.equal(res.status, 503)
      assert.deepEqual(res.body, { error: 'Claude not configured on this proxy' })
    })

    it('calls the Anthropic client with the allowlisted model and the system prompt', async () => {
      const params: Record<string, unknown>[] = []
      const anthropic = {
        messages: {
          create: (p: Record<string, unknown>) => {
            params.push(p)
            return Promise.resolve({
              content: [{ type: 'tool_use', input: validTurn }],
              usage: { input_tokens: 10, output_tokens: 5 },
            })
          },
        },
      }
      const { url } = await start({}, { anthropic })
      const res = await post(url, turnRequest({ provider: 'claude', model: 'claude-sonnet-5' }))
      assert.equal(res.status, 200)
      assert.deepEqual(res.body, { provider: 'claude', model: 'claude-sonnet-5', data: validTurn })
      assert.equal(params[0]!.model, 'claude-sonnet-5')
      assert.deepEqual(params[0]!.system, [
        { type: 'text', text: 'You are the narrator.', cache_control: { type: 'ephemeral' } },
      ])
    })
  })
})

describe('proxy readConfig', () => {
  it('runs on the documented defaults when no PROXY_MAX_* is set', () => {
    const config = readConfig({})
    assert.equal(config.GEMINI_MODEL, 'gemini-2.5-flash')
    assert.equal(config.CLAUDE_MODEL, 'claude-sonnet-4-6')
    assert.equal(config.DEFAULT_PROVIDER, 'gemini')
    assert.equal(config.PORT, 3000)
    assert.deepEqual(config.USAGE_LIMITS, {
      requestsPerHour: 80,
      tokensPerHour: 300_000,
      tokensPerDay: 1_200_000,
      globalTokensPerDay: 5_000_000,
    })
  })
})
