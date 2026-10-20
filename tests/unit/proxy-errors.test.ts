/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { errorFromResponse, fetchProxy, ProxyUnavailableError } from '../../src/api/proxyErrors'

const edgePage = '<!DOCTYPE html><html><body>error code: 1033</body></html>'

describe('a proxy that is down', () => {
  const cases: Record<string, () => Promise<Error>> = {
    'a thrown fetch': () =>
      fetchProxy('/adventure/api/generate', {}, () => Promise.reject(new TypeError('Failed to fetch'))).then(
        () => new Error('fetch resolved'),
        (err: Error) => err,
      ),
    'a 502': () => errorFromResponse(new Response(edgePage, { status: 502 })),
    'a 530': () => errorFromResponse(new Response(edgePage, { status: 530 })),
    'a non-JSON 500': () => errorFromResponse(new Response(edgePage, { status: 500 })),
    'a 503 with no JSON error': () => errorFromResponse(new Response('{}', { status: 503 })),
  }

  for (const [name, failure] of Object.entries(cases)) {
    it(`${name} is ProxyUnavailableError, not a parse error`, async () => {
      const err = await failure()
      assert.ok(err instanceof ProxyUnavailableError)
      assert.doesNotMatch(err.message, /Invalid JSON response from server/)
    })
  }
})

describe('a proxy that answers with an error', () => {
  it('a JSON 500 keeps its message', async () => {
    const response = new Response(JSON.stringify({ error: 'Provider quota exceeded' }), { status: 500 })
    const err = await errorFromResponse(response)
    assert.ok(!(err instanceof ProxyUnavailableError))
    assert.equal(err.message, 'Provider quota exceeded')
  })

  it("the proxy's own JSON 504 keeps its message", async () => {
    const err = await errorFromResponse(new Response(JSON.stringify({ error: 'Upstream timeout' }), { status: 504 }))
    assert.ok(!(err instanceof ProxyUnavailableError))
    assert.equal(err.message, 'Upstream timeout')
  })

  it('a JSON 401 without an error field names the status', async () => {
    const err = await errorFromResponse(new Response('{}', { status: 401 }))
    assert.ok(!(err instanceof ProxyUnavailableError))
    assert.equal(err.message, 'Request failed with status 401')
  })
})
