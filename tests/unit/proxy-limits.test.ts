/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { clientUsageKey, createUsageLimiter, type UsageBudgetError, type UsageRequest } from '../../proxy/limits'

function requestFrom(headers: Record<string, string>, ip?: string): UsageRequest {
  return {
    get: (name) => headers[name.toLowerCase()],
    ip,
  }
}

const HIGH_CLIENT_LIMITS = {
  requestsPerHour: 1_000,
  tokensPerHour: 1_000_000,
  tokensPerDay: 1_000_000,
}

describe('clientUsageKey', () => {
  it('keys a full IPv6 address on its /64', () => {
    assert.equal(
      clientUsageKey(requestFrom({ 'cf-connecting-ip': '2001:0db8:0a0b:12f0:0000:0000:0000:0001' })),
      'cf:2001:db8:a0b:12f0::/64',
    )
    assert.equal(
      clientUsageKey(requestFrom({ 'cf-connecting-ip': '2001:db8:a0b:12f0:ffff:1:2:3' })),
      clientUsageKey(requestFrom({ 'cf-connecting-ip': '2001:db8:a0b:12f0::9' })),
    )
  })

  it('expands :: shorthand before keeping four hextets', () => {
    assert.equal(clientUsageKey(requestFrom({ 'cf-connecting-ip': '2001:db8::1' })), 'cf:2001:db8:0:0::/64')
    assert.equal(clientUsageKey(requestFrom({ 'x-forwarded-for': '::1' })), 'xff:0:0:0:0::/64')
    assert.notEqual(
      clientUsageKey(requestFrom({ 'cf-connecting-ip': '2001:db8:1::1' })),
      clientUsageKey(requestFrom({ 'cf-connecting-ip': '2001:db8:2::1' })),
    )
  })

  it('passes IPv4 through unchanged', () => {
    assert.equal(clientUsageKey(requestFrom({ 'cf-connecting-ip': '203.0.113.7' })), 'cf:203.0.113.7')
    assert.equal(clientUsageKey(requestFrom({ 'x-forwarded-for': '198.51.100.1, 10.0.0.1' })), 'xff:198.51.100.1')
    assert.equal(clientUsageKey(requestFrom({}, '::ffff:192.0.2.1')), 'socket:192.0.2.1')
  })
})

describe('createUsageLimiter', () => {
  it('rejects with 429 at the global cap while the client limits are set high', () => {
    const limiter = createUsageLimiter({ ...HIGH_CLIENT_LIMITS, globalTokensPerDay: 10_000 })
    limiter.reserveClientBudget(requestFrom({ 'cf-connecting-ip': '203.0.113.1' }), 6_000)

    assert.throws(
      () => limiter.reserveClientBudget(requestFrom({ 'cf-connecting-ip': '203.0.113.2' }), 6_000),
      (err: UsageBudgetError) => {
        assert.equal(err.status, 429)
        assert.deepEqual(err.publicBody.details, ['globalTokensPerDay'])
        return true
      },
    )
    assert.equal(limiter.clientUsage('cf:203.0.113.2')?.dayTokens, 0)
    assert.equal(limiter.globalUsage().dayTokens, 6_000)
  })

  it('counts actual usage against the global day after a reservation', () => {
    const limiter = createUsageLimiter({ ...HIGH_CLIENT_LIMITS, globalTokensPerDay: 10_000 })
    const reservation = limiter.reserveClientBudget(requestFrom({ 'cf-connecting-ip': '203.0.113.1' }), 2_000)
    limiter.adjustClientBudget(reservation, 9_000)

    assert.equal(limiter.globalUsage().dayTokens, 9_000)
    assert.equal(limiter.hasGlobalRoom(2_000), false)
  })

  it('leaves the client bucket unchanged on a global-only adjust', () => {
    const limiter = createUsageLimiter({ ...HIGH_CLIENT_LIMITS, globalTokensPerDay: 100_000 })
    const reservation = limiter.reserveClientBudget(requestFrom({ 'cf-connecting-ip': '203.0.113.1' }), 1_000)
    const before = limiter.clientUsage(reservation.key)

    limiter.adjustGlobalBudget(5_000)

    assert.deepEqual(limiter.clientUsage(reservation.key), before)
    assert.equal(limiter.globalUsage().dayTokens, 6_000)
  })
})
