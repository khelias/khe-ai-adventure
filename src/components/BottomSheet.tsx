import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'
import {
  isSettled,
  prefersReducedMotion,
  releaseVelocity,
  rubberband,
  shouldDismiss,
  springStep,
  type DragSample,
} from './sheetMotion'

type Phase = 'closed' | 'open' | 'closing'
type Motion = 'none' | 'settle' | 'exit'

interface DragState {
  pointerId: number
  startY: number
  startOffset: number
  active: boolean
  samples: DragSample[]
}

const SPRING_RESPONSE = 0.3
const DRAG_SLOP_PX = 4
const REDUCED_FADE_MS = 160
const MAX_SAMPLES = 24
// The exit aims past the edge so the panel shadow clears it, and ends once the
// panel is out of view instead of waiting out the spring's slow tail.
const EXIT_OVERSHOOT_PX = 32

// Bottom sheet with drag-to-dismiss. The grab region is any `.sheet-grab`
// inside the children. Motion runs outside React state: the offset lives in a
// ref and is written straight to the panel transform and the scrim opacity.
export function BottomSheet({
  open,
  onClose,
  ariaLabel,
  children,
}: {
  open: boolean
  onClose: () => void
  ariaLabel: string
  children: ReactNode
}) {
  const [phase, setPhase] = useState<Phase>(open ? 'open' : 'closed')
  const [prevOpen, setPrevOpen] = useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) setPhase('open')
    else if (phase === 'open') setPhase('closing')
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scrimRef = useRef<HTMLDivElement>(null)
  const offsetRef = useRef(0)
  const velocityRef = useRef(0)
  const frameRef = useRef(0)
  const motionRef = useRef<Motion>('none')
  const detachDragRef = useRef<(() => void) | null>(null)

  const exitDistance = () => {
    const panel = panelRef.current
    const container = containerRef.current
    if (!panel || !container) return 1
    return Math.max(1, container.clientHeight - panel.offsetTop)
  }

  // Callers in per-frame paths pass the distance measured once at the start,
  // so a frame does not read layout right after writing the transform.
  const apply = (offset: number, distance = exitDistance()) => {
    offsetRef.current = offset
    const panel = panelRef.current
    const scrim = scrimRef.current
    if (panel) panel.style.transform = offset === 0 ? '' : `translate3d(0, ${offset}px, 0)`
    if (scrim) scrim.style.opacity = String(Math.min(1, Math.max(0, 1 - offset / distance)))
  }

  const stopMotion = () => {
    cancelAnimationFrame(frameRef.current)
    frameRef.current = 0
    motionRef.current = 'none'
  }

  // The enter animation is CSS and overrides inline styles while it runs, so
  // the first interaction reads where it got to and takes over from there.
  const takeOverFromCss = () => {
    const panel = panelRef.current
    if (!panel || panel.style.animation === 'none') return
    const computed = getComputedStyle(panel)
    const transform = computed.transform
    offsetRef.current = transform && transform !== 'none' ? new DOMMatrixReadOnly(transform).m42 : 0
    // Under reduced motion the enter is a fade; keep its current opacity.
    if (computed.opacity !== '1') panel.style.opacity = computed.opacity
    panel.style.animation = 'none'
    if (scrimRef.current) scrimRef.current.style.animation = 'none'
    apply(offsetRef.current)
  }

  const animate = (
    target: number,
    velocity: number,
    kind: Motion,
    done?: () => void,
    finishAt?: number,
  ) => {
    cancelAnimationFrame(frameRef.current)
    motionRef.current = kind
    const distance = exitDistance()
    let state = { value: offsetRef.current, velocity }
    let last = performance.now()
    const tick = (now: number) => {
      if (!panelRef.current) {
        frameRef.current = 0
        return
      }
      state = springStep(state, target, (now - last) / 1000, SPRING_RESPONSE)
      last = now
      velocityRef.current = state.velocity
      if (isSettled(state, target) || (finishAt !== undefined && state.value >= finishAt)) {
        apply(target, distance)
        velocityRef.current = 0
        frameRef.current = 0
        motionRef.current = 'none'
        done?.()
        return
      }
      apply(state.value, distance)
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  const finishExit = () => {
    offsetRef.current = 0
    velocityRef.current = 0
    motionRef.current = 'none'
    setPhase('closed')
  }

  const fadeOut = () => {
    cancelAnimationFrame(frameRef.current)
    motionRef.current = 'exit'
    const from = panelRef.current ? Number(getComputedStyle(panelRef.current).opacity) : 1
    const start = performance.now()
    const tick = (now: number) => {
      const panel = panelRef.current
      if (!panel) {
        frameRef.current = 0
        return
      }
      const opacity = String(from * (1 - Math.min(1, (now - start) / REDUCED_FADE_MS)))
      panel.style.opacity = opacity
      if (scrimRef.current) scrimRef.current.style.opacity = opacity
      if (opacity === '0') {
        frameRef.current = 0
        finishExit()
        return
      }
      frameRef.current = requestAnimationFrame(tick)
    }
    frameRef.current = requestAnimationFrame(tick)
  }

  const startExit = (velocity: number) => {
    detachDragRef.current?.()
    takeOverFromCss()
    if (prefersReducedMotion()) fadeOut()
    else {
      const distance = exitDistance()
      animate(distance + EXIT_OVERSHOOT_PX, velocity, 'exit', finishExit, distance)
    }
  }

  const settleBack = (velocity: number) => {
    takeOverFromCss()
    if (panelRef.current) panelRef.current.style.opacity = ''
    if (prefersReducedMotion()) {
      stopMotion()
      apply(0)
    } else {
      animate(0, velocity, 'settle')
    }
  }

  const onPhaseChange = useEffectEvent((next: Phase) => {
    if (next === 'closing' && motionRef.current !== 'exit') startExit(0)
    else if (next === 'open' && motionRef.current === 'exit') settleBack(velocityRef.current)
  })

  useEffect(() => {
    onPhaseChange(phase)
  }, [phase])

  useEffect(() => {
    if (phase !== 'open') return undefined
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [phase, onClose])

  useEffect(() => {
    return () => {
      cancelAnimationFrame(frameRef.current)
      detachDragRef.current?.()
    }
  }, [])

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (phase !== 'open' || event.button !== 0 || !event.isPrimary) return
    const target = event.target as Element
    if (!target.closest('.sheet-grab') || target.closest('button')) return

    detachDragRef.current?.()
    takeOverFromCss()
    stopMotion()

    const panel = event.currentTarget
    const distance = exitDistance()
    const drag: DragState = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startOffset: offsetRef.current,
      active: false,
      samples: [],
    }

    const rawOffset = (clientY: number) => drag.startOffset + clientY - drag.startY

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.pointerId) return
      if (!drag.active) {
        if (Math.abs(ev.clientY - drag.startY) < DRAG_SLOP_PX) return
        drag.active = true
        drag.startY = ev.clientY
        panel.setPointerCapture(ev.pointerId)
      }
      const raw = rawOffset(ev.clientY)
      apply(raw < 0 ? rubberband(raw, panel.offsetHeight) : raw, distance)
      drag.samples.push({ y: raw, t: ev.timeStamp })
      if (drag.samples.length > MAX_SAMPLES) drag.samples.shift()
    }

    const finish = (velocity: number | null) => {
      detach()
      if (velocity === null) {
        if (offsetRef.current !== 0) settleBack(0)
        return
      }
      if (shouldDismiss({ offset: offsetRef.current, velocity, height: panel.offsetHeight })) {
        startExit(velocity)
        onClose()
      } else {
        settleBack(velocity)
      }
    }

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.pointerId) return
      if (!drag.active) {
        finish(null)
        return
      }
      drag.samples.push({ y: rawOffset(ev.clientY), t: ev.timeStamp })
      finish(releaseVelocity(drag.samples))
    }

    const onCancel = (ev: PointerEvent) => {
      if (ev.pointerId !== drag.pointerId) return
      finish(drag.active ? 0 : null)
    }

    const detach = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onCancel)
      panel.removeEventListener('lostpointercapture', onCancel)
      if (panel.hasPointerCapture(drag.pointerId)) panel.releasePointerCapture(drag.pointerId)
      if (detachDragRef.current === detach) detachDragRef.current = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onCancel)
    panel.addEventListener('lostpointercapture', onCancel)
    detachDragRef.current = detach
  }

  const onScrimClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (phase === 'open' && event.target === event.currentTarget) onClose()
  }

  if (phase === 'closed') return null

  return (
    <div ref={containerRef} className="sheet" data-phase={phase}>
      <div ref={scrimRef} className="sheet-scrim" onClick={onScrimClick} />
      <div
        ref={panelRef}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
      >
        {children}
      </div>
    </div>
  )
}
