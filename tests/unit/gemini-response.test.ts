/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseGeminiResponse, type GeminiResponseError } from '../../proxy/gemini-response'

function candidate(text: string, finishReason: string) {
  return { content: { role: 'model', parts: [{ text }] }, finishReason }
}

function rejectsWith(status: number, error: string, reason: string) {
  return (err: GeminiResponseError) => {
    assert.equal(err.status, status)
    assert.deepEqual(err.publicBody, { error })
    assert.equal(err.reason, reason)
    assert.match(err.message, new RegExp(reason))
    return true
  }
}

describe('parseGeminiResponse', () => {
  it('returns the text and usage of a normal response', () => {
    const usageMetadata = { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 }
    const parsed = parseGeminiResponse({ candidates: [candidate('{"ok":true}', 'STOP')], usageMetadata })
    assert.equal(parsed.text, '{"ok":true}')
    assert.deepEqual(parsed.usageMetadata, usageMetadata)
  })

  it('throws a safety error when finishReason is SAFETY', () => {
    assert.throws(
      () => parseGeminiResponse({ candidates: [{ finishReason: 'SAFETY', safetyRatings: [] }] }),
      rejectsWith(502, 'Response blocked by safety filter', 'SAFETY'),
    )
  })

  it('throws a safety error when the prompt itself is blocked', () => {
    assert.throws(
      () => parseGeminiResponse({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }),
      rejectsWith(502, 'Response blocked by safety filter', 'PROHIBITED_CONTENT'),
    )
  })

  it('throws instead of passing on text truncated at MAX_TOKENS', () => {
    assert.throws(
      () => parseGeminiResponse({ candidates: [candidate('{"scene":"The door creaks op', 'MAX_TOKENS')] }),
      rejectsWith(502, 'Response too long', 'MAX_TOKENS'),
    )
  })

  it('throws a generic upstream error for any other finishReason', () => {
    assert.throws(
      () => parseGeminiResponse({ candidates: [candidate('text', 'RECITATION')] }),
      rejectsWith(502, 'Upstream error', 'RECITATION'),
    )
  })
})
