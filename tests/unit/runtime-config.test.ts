/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { resolveApiSecret } from '../../src/api/runtimeConfig'

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
