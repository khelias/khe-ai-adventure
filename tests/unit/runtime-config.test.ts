/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveApiSecret, secretLoader } from '../../src/api/runtimeConfig'

describe('resolveApiSecret', () => {
  it('prefers the runtime config written by the web image', () => {
    assert.equal(resolveApiSecret({ apiSecret: 'runtime' }, 'build'), 'runtime')
  })

  it('falls back to the build-time value when the runtime config is empty', () => {
    assert.equal(resolveApiSecret({}, 'build'), 'build')
    assert.equal(resolveApiSecret({ apiSecret: '' }, 'build'), 'build')
    assert.equal(resolveApiSecret(undefined, 'build'), 'build')
  })

  it('returns an empty string when neither is set', () => {
    assert.equal(resolveApiSecret(undefined, undefined), '')
  })
})

describe('secretLoader', () => {
  it('does not load when the secret is already known', async () => {
    let loads = 0
    const secret = secretLoader(() => 'known', () => {
      loads += 1
      return Promise.resolve()
    })
    assert.equal(await secret(), 'known')
    assert.equal(loads, 0)
  })

  it('reads the secret the load provided', async () => {
    let value = ''
    const secret = secretLoader(() => value, async () => {
      await Promise.resolve()
      value = 'loaded'
    })
    assert.equal(await secret(), 'loaded')
  })

  it('tries again after a failed load, as when the app started offline', async () => {
    let value = ''
    let online = false
    const secret = secretLoader(() => value, () => {
      if (!online) return Promise.reject(new Error('offline'))
      value = 'loaded'
      return Promise.resolve()
    })
    await assert.rejects(secret(), /offline/)
    online = true
    assert.equal(await secret(), 'loaded')
  })
})
