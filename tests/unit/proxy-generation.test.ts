/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { afterEach, beforeEach, describe, it, mock } from 'node:test'

import {
  createDeadline,
  normalizeTurnChoices,
  retryContract,
  runGeneration,
  withSignal,
  type EditorPassResult,
  type ProviderResult,
  type RunGenerationOptions,
} from '../../proxy/generation'

const costly = (text: string) => ({ text, expectedChanges: [{ parameter: 'p', change: -1 }] })
const free = (text: string) => ({ text, expectedChanges: [{ parameter: 'p', change: 1 }] })

function turn(data: Record<string, unknown> = {}): ProviderResult {
  return {
    model: 'test-model',
    data: { scene: 'A dark room.', choices: [costly('a'), costly('b'), costly('c')], gameOver: false, ...data },
  }
}

const never = () => new Promise<ProviderResult>(() => {})

function abortError() {
  return Object.assign(new Error('aborted'), { name: 'AbortError' })
}

// Answers after `ms` unless the signal aborts first, the way fetch behaves.
function slowUpstream(ms: number, value: ProviderResult) {
  return (_extraPrompt: string, signal: AbortSignal) =>
    new Promise<ProviderResult>((resolve, reject) => {
      const timer = setTimeout(() => resolve(value), ms)
      signal.addEventListener('abort', () => { clearTimeout(timer); reject(abortError()) }, { once: true })
    })
}

const noEdit = () => Promise.resolve<EditorPassResult>({ applied: true, tokens: 0 })

function options(overrides: Partial<RunGenerationOptions> & Pick<RunGenerationOptions, 'callOnce' | 'deadline'>): RunGenerationOptions {
  return {
    editTurn: noEdit,
    editStructured: noEdit,
    editorEnabled: false,
    language: 'en',
    provider: 'gemini',
    minRetryMs: 0,
    ...overrides,
  }
}

const isAbort = (err: Error) => err.name === 'AbortError'

let warnings: string[] = []

beforeEach(() => {
  warnings = []
  mock.method(console, 'warn', (message: string) => { warnings.push(message) })
})

afterEach(() => {
  mock.restoreAll()
})

describe('createDeadline', () => {
  it('counts the remaining budget down from the injected clock', () => {
    let t = 1_000
    const deadline = createDeadline(500, { now: () => t })
    assert.equal(deadline.remaining(), 500)
    t += 200
    assert.equal(deadline.remaining(), 300)
    t += 1_000
    assert.equal(deadline.remaining(), 0)
    deadline.clear()
  })

  it('aborts its signal when the budget runs out, and not after clear()', async () => {
    const expiring = createDeadline(10)
    const cleared = createDeadline(10)
    cleared.clear()
    await new Promise((resolve) => setTimeout(resolve, 30))
    assert.equal(expiring.signal.aborted, true)
    assert.equal(cleared.signal.aborted, false)
  })
})

describe('withSignal', () => {
  it('rejects at the abort even when the wrapped promise never settles', async () => {
    const controller = new AbortController()
    const pending = withSignal(never(), controller.signal)
    controller.abort()
    await assert.rejects(pending, isAbort)
  })

  it('rejects at once on an aborted signal and handles the late rejection of the abandoned call', async () => {
    const controller = new AbortController()
    controller.abort()
    let rejectLate: (err: Error) => void = () => {}
    const late = new Promise<never>((_resolve, reject) => { rejectLate = reject })
    await assert.rejects(withSignal(late, controller.signal), isAbort)
    // An unhandled rejection here would fail the run.
    rejectLate(new Error('late'))
    await new Promise((resolve) => setImmediate(resolve))
  })

  it('passes the value through when it settles first', async () => {
    assert.equal(await withSignal(Promise.resolve(7), new AbortController().signal), 7)
  })
})

describe('normalizeTurnChoices', () => {
  for (const choices of [{}, null, 'three choices', undefined]) {
    it(`coerces ${JSON.stringify(choices) ?? 'undefined'} choices on a turn to []`, () => {
      const result = { data: { scene: 'x', choices } }
      assert.equal(normalizeTurnChoices(result), typeof choices)
      assert.deepEqual(result.data.choices, [])
    })
  }

  it('leaves array choices and non-turn data alone', () => {
    const arrayTurn = { data: { scene: 'x', choices: [1] } }
    const story = { data: { stories: [], choices: {} } }
    assert.equal(normalizeTurnChoices(arrayTurn), null)
    assert.equal(normalizeTurnChoices(story), null)
    assert.deepEqual(story.data.choices, {})
    assert.equal(normalizeTurnChoices(undefined), null)
  })
})

describe('retryContract', () => {
  const roomy = { remaining: () => 60_000 }
  const base = {
    name: 'test',
    reminders: ['R1', 'R2'],
    promptFor: (reminder: string, violations: string[]) => `${reminder}:${violations.join(',')}`,
    deadline: roomy,
    minRetryMs: 1_000,
    onRetry: () => {},
    onFailure: () => {},
  }
  const violationsOf = (r: ProviderResult) => (r.data.ok === true ? [] : ['not ok'])

  it('makes no call when the result already satisfies the contract', async () => {
    const call = mock.fn(() => Promise.resolve(turn()))
    const out = await retryContract({ ...base, result: turn({ ok: true }), violationsOf, call })
    assert.equal(out.attempts, 0)
    assert.equal(call.mock.callCount(), 0)
  })

  it('stops after the first retry that fixes the violation and passes the violations into the prompt', async () => {
    const fixed = turn({ ok: true })
    const call = mock.fn<(prompt: string) => Promise<ProviderResult>>(() => Promise.resolve(fixed))
    const out = await retryContract({ ...base, result: turn(), violationsOf, call })
    assert.equal(out.attempts, 1)
    assert.equal(out.result, fixed)
    assert.deepEqual(call.mock.calls.map((c) => c.arguments[0]), ['R1:not ok'])
  })

  it('keeps the previous result when a retry fails and uses every reminder', async () => {
    const original = turn()
    const failures: number[] = []
    const call = mock.fn(() => Promise.reject(new Error('upstream down')))
    const out = await retryContract({
      ...base,
      result: original,
      violationsOf,
      call,
      onFailure: (attempt: number) => { failures.push(attempt) },
    })
    assert.equal(out.result, original)
    assert.equal(out.attempts, 2)
    assert.deepEqual(failures, [1, 2])
  })

  it('normalizes non-array choices of a retry result', async () => {
    const call = () => Promise.resolve<ProviderResult>({ data: { scene: 'x', choices: 'oops', ok: true } })
    const out = await retryContract({ ...base, result: turn(), violationsOf, call })
    assert.deepEqual(out.result.data.choices, [])
  })

  it('does not start a retry when less than minRetryMs is left', async () => {
    const call = mock.fn(() => Promise.resolve(turn({ ok: true })))
    const out = await retryContract({ ...base, deadline: { remaining: () => 999 }, result: turn(), violationsOf, call })
    assert.equal(out.attempts, 0)
    assert.equal(call.mock.callCount(), 0)
  })
})

describe('runGeneration deadline', () => {
  // The mocked upstream would take seconds; the deadline is 100 ms. The slack
  // only absorbs scheduler noise.
  const DEADLINE_MS = 100
  const SLACK_MS = 900

  it('rejects with AbortError at the deadline when the upstream never answers', async () => {
    const deadline = createDeadline(DEADLINE_MS)
    const started = Date.now()
    await assert.rejects(runGeneration(options({ callOnce: never, deadline })), isAbort)
    assert.ok(Date.now() - started < DEADLINE_MS + SLACK_MS)
    deadline.clear()
  })

  it('rejects at the deadline when a slow upstream honours the signal', async () => {
    const deadline = createDeadline(DEADLINE_MS)
    const started = Date.now()
    await assert.rejects(runGeneration(options({ callOnce: slowUpstream(5_000, turn()), deadline })), isAbort)
    assert.ok(Date.now() - started < DEADLINE_MS + SLACK_MS)
    deadline.clear()
  })

  it('answers with the first result when a slow retry runs into the deadline, and skips the editor', async () => {
    const first = turn({ choices: [free('a'), costly('b'), costly('c')] })
    const callOnce = mock.fn((extraPrompt: string, signal: AbortSignal) =>
      extraPrompt === '' ? Promise.resolve(first) : slowUpstream(5_000, turn())(extraPrompt, signal))
    const editTurn = mock.fn(noEdit)
    const deadline = createDeadline(DEADLINE_MS)
    const started = Date.now()
    const out = await runGeneration(options({ callOnce, deadline, editTurn, editorEnabled: true, language: 'et', minRetryMs: 50 }))
    assert.ok(Date.now() - started < DEADLINE_MS + SLACK_MS)
    assert.equal(out.result, first)
    // The first cost retry starts and is aborted; the second is skipped.
    assert.equal(out.costRetried, 1)
    assert.equal(callOnce.mock.callCount(), 2)
    assert.equal(editTurn.mock.callCount(), 0)
    assert.ok(warnings.some((w) => w.startsWith('choice-cost retry 1 failed:')))
    assert.ok(warnings.some((w) => w.startsWith('choice-cost retry skipped:')))
    assert.ok(warnings.includes('editor-pass skipped: request deadline reached'))
    deadline.clear()
  })

  it('times out instead of ending the game when the deadline leaves no room for an empty-choices retry', async () => {
    const callOnce = mock.fn(() => Promise.resolve(turn({ choices: [] })))
    const deadline = createDeadline(1_000)
    await assert.rejects(runGeneration(options({ callOnce, deadline, minRetryMs: 5_000 })), isAbort)
    assert.equal(callOnce.mock.callCount(), 1)
    deadline.clear()
  })

  it('times out when an empty-choices retry is aborted by the deadline', async () => {
    const callOnce = mock.fn((extraPrompt: string, signal: AbortSignal) =>
      extraPrompt === '' ? Promise.resolve(turn({ choices: [] })) : slowUpstream(5_000, turn())(extraPrompt, signal))
    const deadline = createDeadline(DEADLINE_MS)
    await assert.rejects(runGeneration(options({ callOnce, deadline })), isAbort)
    assert.equal(callOnce.mock.callCount(), 2)
    deadline.clear()
  })

  it('returns the turn unchanged when the deadline leaves no room for a choice-cost retry', async () => {
    const first = turn({ choices: [free('a'), costly('b'), costly('c')] })
    const callOnce = mock.fn(() => Promise.resolve(first))
    const deadline = createDeadline(1_000)
    const out = await runGeneration(options({ callOnce, deadline, minRetryMs: 5_000 }))
    assert.equal(callOnce.mock.callCount(), 1)
    assert.equal(out.result, first)
    assert.equal(out.costRetried, 0)
    deadline.clear()
  })

  it('gives the editor the deadline signal', async () => {
    const deadline = createDeadline(1_000)
    const editTurn = mock.fn<RunGenerationOptions['editTurn']>(() => Promise.resolve({ applied: true, tokens: 12 }))
    const editStructured = mock.fn(noEdit)
    const out = await runGeneration(options({
      callOnce: () => Promise.resolve(turn()),
      deadline,
      editTurn,
      editStructured,
      editorEnabled: true,
      language: 'et',
    }))
    assert.equal(editTurn.mock.calls[0]?.arguments[1], deadline.signal)
    assert.equal(editStructured.mock.callCount(), 0)
    assert.equal(out.editorApplied, true)
    assert.equal(out.editorTokens, 12)
    deadline.clear()
  })
})

describe('runGeneration contracts', () => {
  it('sends non-turn data to the structured editor', async () => {
    const deadline = createDeadline(1_000)
    const editTurn = mock.fn(noEdit)
    const editStructured = mock.fn(noEdit)
    await runGeneration(options({
      callOnce: () => Promise.resolve({ data: { stories: [] } }),
      deadline,
      editTurn,
      editStructured,
      editorEnabled: true,
      language: 'et',
    }))
    assert.equal(editTurn.mock.callCount(), 0)
    assert.equal(editStructured.mock.callCount(), 1)
    deadline.clear()
  })

  it('retries empty choices twice, then coerces gameOver with the Estonian fallback text', async () => {
    const deadline = createDeadline(1_000)
    const callOnce = mock.fn(() => Promise.resolve(turn({ choices: {} })))
    const out = await runGeneration(options({ callOnce, deadline, language: 'et' }))
    assert.equal(callOnce.mock.callCount(), 3)
    assert.equal(out.retried, 2)
    assert.equal(out.coercedGameOver, true)
    assert.deepEqual(out.result.data.choices, [])
    assert.match(String(out.result.data.gameOverText), /^A dark room\.\n\nLugu katkeb siin/)
    assert.ok(warnings.includes('coercing gameOver=true after 2 retries failed (provider=gemini)'))
    deadline.clear()
  })

  it('uses the English fallback text, and keeps a gameOverText the model already wrote', async () => {
    const deadline = createDeadline(1_000)
    const english = await runGeneration(options({ callOnce: () => Promise.resolve(turn({ choices: [] })), deadline }))
    assert.match(String(english.result.data.gameOverText), /^A dark room\.\n\nThe story breaks off here/)
    const ending = 'The lights go out and the house finally falls silent around them.'
    const kept = await runGeneration(options({ callOnce: () => Promise.resolve(turn({ choices: [], gameOverText: ending })), deadline }))
    assert.equal(kept.result.data.gameOverText, ending)
    assert.equal(kept.result.data.gameOver, true)
    deadline.clear()
  })

  it('accepts an empty-choice retry that fixes the turn, then checks choice costs on it', async () => {
    const deadline = createDeadline(1_000)
    const responses = [turn({ choices: [] }), turn({ choices: [free('a'), free('b'), free('c')] }), turn()]
    const callOnce = mock.fn(() => Promise.resolve(responses.shift() ?? turn()))
    const out = await runGeneration(options({ callOnce, deadline }))
    assert.equal(out.retried, 1)
    assert.equal(out.costRetried, 1)
    assert.equal(out.coercedGameOver, false)
    assert.match(String(callOnce.mock.calls[2]?.arguments[0]), /CHOICE COST CONTRACT[\s\S]*Violations to fix:\n- choice\[0\]/)
    deadline.clear()
  })
})
