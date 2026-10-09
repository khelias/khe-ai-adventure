// Pure motion math for BottomSheet, kept apart from the DOM so it can be unit
// tested. Offsets are in px (positive = down), velocities in px/s.

export interface SpringState {
  value: number
  velocity: number
}

export interface DragSample {
  y: number
  t: number
}

const VELOCITY_WINDOW_MS = 100
const MAX_SPRING_DT = 1 / 30

export function rubberband(overshoot: number, dimension: number, c = 0.55): number {
  if (dimension <= 0) return 0
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot))
}

// Distance a flick would travel while decelerating at rate `d` per ms.
export function projectDistance(velocity: number, d = 0.998): number {
  return ((velocity / 1000) * d) / (1 - d)
}

export function releaseVelocity(samples: readonly DragSample[]): number {
  const last = samples.at(-1)
  if (!last || samples.length < 2) return 0
  let first = last
  for (let i = samples.length - 2; i >= 0; i--) {
    first = samples[i] ?? first
    if (last.t - first.t >= VELOCITY_WINDOW_MS) break
  }
  const dt = last.t - first.t
  if (dt <= 0) return 0
  return ((last.y - first.y) / dt) * 1000
}

// Exact critically damped solution, so a large dt cannot overshoot or diverge.
export function springStep(
  state: SpringState,
  target: number,
  dt: number,
  response: number,
): SpringState {
  const step = Math.min(Math.max(dt, 0), MAX_SPRING_DT)
  const omega = (2 * Math.PI) / response
  const x0 = state.value - target
  const v0 = state.velocity
  const decay = Math.exp(-omega * step)
  const b = v0 + omega * x0
  const x = (x0 + b * step) * decay
  const v = (b - omega * (x0 + b * step)) * decay
  return { value: target + x, velocity: v }
}

export function isSettled(state: SpringState, target: number): boolean {
  return Math.abs(state.value - target) < 0.5 && Math.abs(state.velocity) < 5
}

export function shouldDismiss({
  offset,
  velocity,
  height,
}: {
  offset: number
  velocity: number
  height: number
}): boolean {
  return offset + projectDistance(velocity) > height / 2
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
