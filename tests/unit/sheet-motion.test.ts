/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isSettled,
  projectDistance,
  releaseVelocity,
  rubberband,
  shouldDismiss,
  springStep,
  type SpringState,
} from '../../src/components/sheetMotion'

function runSpring(start: SpringState, target: number, dt: number, steps: number, response = 0.3) {
  const values: number[] = []
  let state = start
  for (let i = 0; i < steps; i++) {
    state = springStep(state, target, dt, response)
    values.push(state.value)
  }
  return { state, values }
}

describe('rubberband', () => {
  it('stays below the input, starts at slope c and is bounded by dimension', () => {
    for (const overshoot of [1, 10, 100, 1000]) {
      const out = rubberband(overshoot, 600)
      assert.ok(out > 0 && out < overshoot, `overshoot ${overshoot} gave ${out}`)
    }
    assert.ok(Math.abs(rubberband(0.01, 600) / 0.01 - 0.55) < 1e-3)
    const far = rubberband(1e9, 600)
    assert.ok(far < 600 && far > 599)
  })

  it('keeps the sign of the overshoot', () => {
    assert.ok(rubberband(-50, 600) < 0)
    assert.equal(rubberband(0, 600), 0)
  })
})

describe('projectDistance', () => {
  it('follows the sign and scales with velocity', () => {
    assert.ok(projectDistance(1000) > 0)
    assert.ok(projectDistance(-1000) < 0)
    assert.equal(projectDistance(0), 0)
    assert.ok(Math.abs(projectDistance(1000) - 499) < 1)
    assert.ok(Math.abs(projectDistance(2000) - 2 * projectDistance(1000)) < 1e-9)
  })
})

describe('releaseVelocity', () => {
  it('measures px/s over the recent samples', () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 0, t: 400 },
      { y: 50, t: 450 },
      { y: 100, t: 500 },
    ]
    assert.ok(Math.abs(releaseVelocity(samples) - 1000) < 1e-9)
  })

  it('is 0 with fewer than two samples', () => {
    assert.equal(releaseVelocity([]), 0)
    assert.equal(releaseVelocity([{ y: 10, t: 5 }]), 0)
  })

  it('is 0 when the samples share a timestamp', () => {
    assert.equal(releaseVelocity([{ y: 0, t: 5 }, { y: 10, t: 5 }]), 0)
  })
})

describe('springStep', () => {
  it('converges from rest without overshoot', () => {
    const { state, values } = runSpring({ value: 300, velocity: 0 }, 0, 1 / 60, 120)
    assert.ok(values.every((v) => v >= 0))
    assert.ok(values.every((v, i) => i === 0 || v <= values[i - 1]))
    assert.ok(isSettled(state, 0))
  })

  it('converges without overshoot with a moderate velocity toward the target', () => {
    const omega = (2 * Math.PI) / 0.3
    const { state, values } = runSpring({ value: 300, velocity: -0.5 * omega * 300 }, 0, 1 / 60, 120)
    assert.ok(values.every((v) => v >= 0))
    assert.ok(isSettled(state, 0))
  })

  it('stays finite for a 10 s frame', () => {
    const next = springStep({ value: 300, velocity: 5000 }, 0, 10, 0.3)
    assert.ok(Number.isFinite(next.value) && Number.isFinite(next.velocity))
    assert.ok(Math.abs(next.value) < 1000)
  })
})

describe('shouldDismiss', () => {
  it('dismisses past half the height', () => {
    assert.equal(shouldDismiss({ offset: 260, velocity: 0, height: 500 }), true)
  })

  it('dismisses on a flick', () => {
    assert.equal(shouldDismiss({ offset: 40, velocity: 1200, height: 500 }), true)
  })

  it('does not dismiss a slow small drag', () => {
    assert.equal(shouldDismiss({ offset: 60, velocity: 50, height: 500 }), false)
  })
})
