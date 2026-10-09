import { useEffect, useRef, useState, type AnimationEvent } from 'react'
import { useGameStore } from '../store/gameStore'
import { translations } from '../i18n/translations'
import { kickFirstTurn } from '../game/actions'
import { LoadingDots } from './LoadingDots'
import { SecretSigil } from './SecretSigil'

// Pass-the-phone secret distribution. One player at a time sees their secret,
// taps "remember", passes the phone. After the last player, we kick the first
// turn and the game screen appears. No multi-device — the ritual IS the UX.

type Flip = 'idle' | 'out' | 'in'
type FlipAction = 'reveal' | 'pass'

// Keep in step with secret-flip-out/secret-flip-in in index.css.
const FLIP_MS: Record<Exclude<Flip, 'idle'>, number> = { out: 180, in: 220 }

export function SecretAssignmentScreen() {
  const language = useGameStore((s) => s.settings.language)
  const roles = useGameStore((s) => s.roles)
  const secrets = useGameStore((s) => s.secrets)
  const isLoading = useGameStore((s) => s.isLoading)
  const strings = translations[language]

  // Distribution index: how many players have ALREADY seen. Starts at 0.
  const [index, setIndex] = useState(0)
  // Whether the current player's secret is currently visible on screen.
  const [revealed, setRevealed] = useState(false)
  // Two-phase card flip: the current card turns away ('out'), the swap happens
  // while it is edge-on, then the new card turns in ('in'). The next player's
  // secret only mounts at the swap, so it is never in the DOM early.
  const [flip, setFlip] = useState<Flip>('idle')
  // Passing on turns the card back the way it came.
  const [flipBack, setFlipBack] = useState(false)
  const pendingRef = useRef<FlipAction | null>(null)
  const timeoutRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    return () => {
      window.clearTimeout(timeoutRef.current)
      pendingRef.current = null
    }
  }, [])

  const currentRole = roles[index]
  const currentSecret = secrets.find((s) => s.ownerRoleId === currentRole?.id)
  const isLast = index === roles.length - 1
  const nextButtonLabel = isLast ? strings.startGameBtn : strings.secretsRememberBtn
  const progressItems = roles.map((role, roleIndex) => ({
    id: role.id,
    label: roleIndex + 1,
    state:
      roleIndex < index
        ? 'done'
        : roleIndex === index
          ? 'active'
          : 'pending',
  }))

  // A timeout backs up animationend, which never fires when the animation is
  // removed or the element hidden, so the tap guard of the 'out' phase cannot
  // leave the screen stuck.
  const startPhase = (phase: Exclude<Flip, 'idle'>) => {
    window.clearTimeout(timeoutRef.current)
    if (phase === 'out') setFlipBack(pendingRef.current === 'pass')
    setFlip(phase)
    timeoutRef.current = window.setTimeout(
      phase === 'out' ? swap : settle,
      FLIP_MS[phase] * 2,
    )
  }

  const swap = () => {
    const action = pendingRef.current
    if (!action) return
    pendingRef.current = null
    if (action === 'reveal') {
      setRevealed(true)
    } else {
      setRevealed(false)
      setIndex((i) => i + 1)
    }
    startPhase('in')
  }

  // A tap while the card turns in waits for it to land, so the next turn
  // starts from flat instead of snapping from mid-angle.
  const settle = () => {
    window.clearTimeout(timeoutRef.current)
    if (pendingRef.current) startPhase('out')
    else setFlip('idle')
  }

  const beginFlip = (action: FlipAction) => {
    if (flip === 'out') return
    pendingRef.current = action
    if (flip === 'idle') startPhase('out')
  }

  const onFlipAnimationEnd = (event: AnimationEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    if (flip === 'out' && event.animationName === 'secret-flip-out') swap()
    else if (flip === 'in' && event.animationName === 'secret-flip-in') settle()
  }

  const onReveal = () => beginFlip('reveal')

  const onRememberAndPass = async () => {
    if (flip === 'out') return
    if (isLast) {
      // All players have seen. Kick the first turn.
      pendingRef.current = null
      settle()
      setRevealed(false)
      await kickFirstTurn()
    } else {
      beginFlip('pass')
    }
  }

  const flipClass =
    flip === 'idle' ? '' : ` secret-flip--${flip}${flipBack ? ' secret-flip--back' : ''}`

  if (!currentRole || !currentSecret) {
    // Shouldn't happen — assignSecrets runs before this screen mounts.
    return null
  }

  return (
    <section className="secret-screen">
      <div className="secret-header">
        <p className="type-caps">
          {strings.secretsKicker}
        </p>
        <h2 className="screen-title">
          {strings.secretsAssignIntro}
        </h2>
        <div className="title-rule" />
      </div>

      {!revealed ? (
        <div className={`secret-handoff${flipClass}`} onAnimationEnd={onFlipAnimationEnd}>
          <div className="secret-progress-rail" aria-hidden="true">
            {progressItems.map((item) => (
              <span
                key={item.id}
                className={`secret-progress-dot secret-progress-dot--${item.state}`}
              >
                {item.label}
              </span>
            ))}
          </div>

          <div className="secret-handoff-card">
            <div className="secret-lock-mark" aria-hidden="true">
              <span />
            </div>
            <div className="secret-handoff-copy">
              <span className="secret-progress type-caps">
                {strings.secretsHandoffMeta(index + 1, roles.length)}
              </span>
              <h3>{strings.secretsHandoffTitle(currentRole.name)}</h3>
              <p>{strings.secretsPrivacyNote}</p>
              <span className="secret-warning">
                {strings.secretsAssignWarning}
              </span>
            </div>
          </div>

          <button onClick={onReveal} className="btn-primary secret-primary-action">
            {strings.secretsRevealBtn(currentRole.name)}
          </button>
        </div>
      ) : (
        <div className={`secret-reveal${flipClass}`} onAnimationEnd={onFlipAnimationEnd}>
          <div className="secret-document-card">
            <div className="secret-document-top">
              <span className="secret-document-file">{strings.secretsDossierLabel}</span>
              <span className="secret-document-number">
                {String(index + 1).padStart(2, '0')} / {String(roles.length).padStart(2, '0')}
              </span>
            </div>

            <div className="secret-stamp">{strings.secretsDocumentStamp}</div>

            <div className="secret-document-owner">
              <SecretSigil archetype={currentSecret.archetype} />
              <div>
                <p className="secret-document-kicker type-caps">
                  {strings.secretsGoalFor(currentRole.name)}
                </p>
                <h3 className="secret-document-title">
                  {strings.secretArchetypeName(currentSecret.archetype)}
                </h3>
              </div>
            </div>

            <div className="secret-document-grid">
              <div className="secret-document-block secret-document-block--wide">
                <span>{strings.secretsGoalTypeLabel}</span>
                <p>{strings.secretDescription(currentSecret.archetype, currentSecret.paramName)}</p>
              </div>

              {currentSecret.paramName ? (
                <div className="secret-document-block">
                  <span>{strings.secretsTargetLabel}</span>
                  <strong>{currentSecret.paramName}</strong>
                </div>
              ) : null}
            </div>
          </div>

          <div className="secret-reveal-footer">
            <span className="secret-progress type-caps">
              {strings.secretsHandoffMeta(index + 1, roles.length)}
            </span>
            <button
              onClick={() => void onRememberAndPass()}
              disabled={isLoading}
              className="btn-primary secret-primary-action"
              aria-label={isLoading ? strings.loading : nextButtonLabel}
            >
              {isLoading ? <LoadingDots /> : nextButtonLabel}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
