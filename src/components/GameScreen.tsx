import { useEffect, useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { translations } from '../i18n/translations'
import { handlePlayerChoice } from '../game/actions'
import { formatAbilityForDisplay } from '../game/abilityText'
import type {
  Choice,
  Parameter,
  ParameterArchetype,
  ParameterEvent,
  Role,
} from '../game/types'
import { LoadingWithHint } from './LoadingDots'
import { BottomSheet } from './BottomSheet'
import { prefersReducedMotion } from './sheetMotion'

function ParameterIcon({ archetype }: { archetype?: ParameterArchetype }) {
  const kind = archetype ?? 'pressure'
  return (
    <svg
      className={`parameter-icon parameter-icon--${kind}`}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {kind === 'resource' || kind === 'hunger' ? (
        <>
          <path d="M7 19h10" />
          <path d="M8 19l1-12h6l1 12" />
          <path d="M9 10h6" />
        </>
      ) : kind === 'bond' || kind === 'promise' ? (
        <>
          <path d="M7.5 12.5 12 17l4.5-4.5" />
          <path d="M7.5 12.5a3 3 0 0 1 0-4.2 3 3 0 0 1 4.5.4 3 3 0 0 1 4.5-.4 3 3 0 0 1 0 4.2" />
        </>
      ) : kind === 'time' ? (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 8v4l3 2" />
        </>
      ) : kind === 'proof' || kind === 'secret' ? (
        <>
          <path d="M5 12c2-3.5 4.3-5.2 7-5.2S17 8.5 19 12c-2 3.5-4.3 5.2-7 5.2S7 15.5 5 12Z" />
          <circle cx="12" cy="12" r="2.2" />
        </>
      ) : kind === 'guilt' || kind === 'debt' ? (
        <>
          <path d="M12 4v16" />
          <path d="M7 8h10" />
          <path d="M8 8l-3 6h6l-3-6Z" />
          <path d="M16 8l-3 6h6l-3-6Z" />
        </>
      ) : (
        <>
          <path d="M12 3 20 18H4L12 3Z" />
          <path d="M12 8v4" />
          <path d="M12 16h.01" />
        </>
      )}
    </svg>
  )
}

function ParameterBoard({
  parameters,
  strings,
}: {
  parameters: Parameter[]
  strings: typeof translations.et
}) {
  return (
    <div className="parameter-board" role="status" aria-label={strings.parametersTitle}>
      {parameters.map((p) => {
        const atWorst = p.currentStateIndex === p.states.length - 1
        const progress = 1 - p.currentStateIndex / Math.max(1, p.states.length - 1)
        const currentState = p.states[p.currentStateIndex] ?? p.states.at(-1) ?? ''

        let statusClass = 'param-good'
        if (progress <= 0.33) statusClass = 'param-bad'
        else if (progress <= 0.66) statusClass = 'param-warn'

        return (
          <div
            key={p.name}
            className={`parameter-card ${p.justMoved ? 'param-pulse' : ''} ${atWorst ? 'param-shake' : ''}`}
            aria-label={strings.parameterStatusAria(p.name, currentState)}
          >
            <div className={`parameter-meter ${statusClass}`}>
              <ParameterIcon archetype={p.archetype} />
            </div>
            <div className="param-copy">
              <div className="param-header">
                <span className="param-name">{p.name}</span>
                <span className={`param-state-text ${statusClass}`}>
                  {currentState}
                </span>
              </div>
              <div className="param-bar-wrap" aria-hidden="true">
                <div
                  className={`param-bar-fill ${statusClass}`}
                  style={{ width: `${Math.max(5, progress * 100)}%` }}
                />
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ParameterToast({
  events,
  strings,
}: {
  events: ParameterEvent[]
  strings: typeof translations.et
}) {
  const [activeEvents, setActiveEvents] = useState<ParameterEvent[]>([])

  useEffect(() => {
    if (events.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveEvents(events)
      const timer = setTimeout(() => setActiveEvents([]), 5600)
      return () => clearTimeout(timer)
    }
    return undefined
  }, [events])

  if (activeEvents.length === 0) return null

  return (
    <div className="param-impact-overlay" aria-live="polite">
      {activeEvents.map((event) => (
        <div
          key={`${event.parameterName}-${event.toState}-${event.text}`}
          className={`param-impact-card impact-${event.severity}`}
        >
          <div className="param-impact-mark" aria-hidden="true">
            {event.direction === 'improved' ? '↑' : '↓'}
          </div>
          <div className="param-impact-content">
            <span className="param-impact-kicker">{strings.parameterEventKicker}</span>
            <h3>{event.text}</h3>
            <div className="param-impact-meta">
              <span>{strings.parameterEventTitle(event.parameterName)}</span>
              <span className={`param-impact-direction ${event.direction}`}>
                {event.direction === 'improved'
                  ? strings.parameterEventImproved
                  : strings.parameterEventWorsened}
              </span>
              <span>{strings.parameterStateChange(event.fromState, event.toState)}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

export function GameScreen() {
  const language = useGameStore((s) => s.settings.language)
  const currentTurn = useGameStore((s) => s.currentTurn)
  const maxTurns = useGameStore((s) => s.maxTurns)
  const parameters = useGameStore((s) => s.parameters)
  const parameterEvents = useGameStore((s) => s.parameterEvents)
  const roles = useGameStore((s) => s.roles)
  const sceneText = useGameStore((s) => s.sceneText)
  const choices = useGameStore((s) => s.choices)
  const isLoading = useGameStore((s) => s.isLoading)
  const error = useGameStore((s) => s.error)
  const strings = translations[language]

  const [showCustomInput, setShowCustomInput] = useState(false)
  const [showAbilityPanel, setShowAbilityPanel] = useState(false)
  const [customText, setCustomText] = useState('')

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [currentTurn])

  const onChoice = (choice: Choice) => {
    setShowCustomInput(false)
    setShowAbilityPanel(false)
    setCustomText('')
    if (choice.isAbility && typeof choice.actor === 'number') {
      const role = roles[choice.actor]
      if (!role || role.used) return
      void handlePlayerChoice(choice.text, { chosenChoice: choice })
    } else {
      void handlePlayerChoice(choice.text, { chosenChoice: choice })
    }
  }

  const onAbilityChoice = (role: Role) => {
    if (role.used) return
    setShowCustomInput(false)
    setShowAbilityPanel(false)
    setCustomText('')
    void handlePlayerChoice(role.ability, {
      chosenChoice: {
        text: role.ability,
        isAbility: true,
        actor: role.id,
        expectedChanges: [],
      },
    })
  }

  const onCustomSubmit = () => {
    const text = customText.trim()
    if (!text) return
    setShowCustomInput(false)
    setShowAbilityPanel(false)
    setCustomText('')
    void handlePlayerChoice(text, { isFreeText: true })
  }

  const paragraphs = sceneText.split('\n').filter(Boolean)
  const waitingForScene = isLoading && sceneText.length > 0
  const unusedAbilities = roles.filter((role) => !role.used)
  const abilitySheetOpen =
    showAbilityPanel && choices.length > 0 && !waitingForScene && !isLoading

  return (
    <section>
      <ParameterToast events={parameterEvents} strings={strings} />

      {/* Top bar: turn counter only — parameters have moved into the scene slug */}
      <div className="topbar">
        <div className="topbar__turn">
          <span className="topbar__turn-num">
            {String(currentTurn).padStart(2, '0')}
          </span>
          <span>/ {String(maxTurns).padStart(2, '0')}</span>
        </div>
      </div>

      {/* Parameter Board */}
      {parameters.length > 0 && <ParameterBoard parameters={parameters} strings={strings} />}

      {/* Scene text */}
      <div key={currentTurn} className="space-y-0">
        {isLoading && !sceneText ? (
          <div className="py-10 text-center">
            <LoadingWithHint />
          </div>
        ) : waitingForScene ? (
          <div className="scene-waiting">
            <LoadingWithHint />
          </div>
        ) : (
          paragraphs.map((paragraph, i) => (
            <p key={i} className="scene-prose" style={{ marginBottom: i < paragraphs.length - 1 ? '0.85em' : 0 }}>
              {paragraph}
            </p>
          ))
        )}
      </div>

      {/* Choices / turn loading */}
      {choices.length > 0 && !waitingForScene ? (
        <div className="mt-8">
          {isLoading ? (
            <div className="turn-loading">
              <LoadingWithHint />
            </div>
          ) : (
            <>
              <div className="ornament-rule type-caps mb-4" style={{ fontSize: '0.6875rem' }}>
                {strings.choiceTitle}
              </div>

              <div>
                {choices.map((choice, i) => {
                  const actorRole =
                    typeof choice.actor === 'number' ? roles[choice.actor] : null
                  const isUsed = choice.isAbility && actorRole ? actorRole.used : false
                  return (
                    <button
                      key={i}
                      onClick={() => onChoice(choice)}
                      disabled={isUsed}
                      className="choice"
                    >
                      <span className="choice__num">{String(i + 1).padStart(2, '0')}</span>
                      <span className="choice__body">
                        <span className="choice__text">
                          {choice.text}{isUsed ? ` — ${strings.usedLabel}` : ''}
                        </span>
                        {choice.isAbility && actorRole ? (
                          <span className="choice__actor" title={actorRole.ability}>
                            {strings.abilityChoiceMeta(actorRole.name)}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="choice-tools">
                <button
                  type="button"
                  onClick={() => {
                    setShowAbilityPanel((v) => !v)
                    setShowCustomInput(false)
                  }}
                  className="btn-secondary ability-toggle"
                  disabled={unusedAbilities.length === 0}
                  aria-expanded={showAbilityPanel}
                >
                  {unusedAbilities.length > 0 ? strings.abilityActionBtn : strings.abilityUsedAll}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomInput(true)
                    setShowAbilityPanel(false)
                  }}
                  className="btn-ghost"
                >
                  {strings.customChoiceLink}…
                </button>
              </div>

              {/* Custom input */}
              <div className="mt-4">
                {showCustomInput ? (
                  <div className="space-y-2">
                    <textarea
                      value={customText}
                      onChange={(e) => setCustomText(e.target.value)}
                      placeholder={strings.customChoicePlaceholder}
                      rows={2}
                      className="input-page resize-none"
                      autoFocus
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          onCustomSubmit()
                        } else if (e.key === 'Escape') {
                          e.preventDefault()
                          setShowCustomInput(false)
                          setCustomText('')
                        }
                      }}
                    />
                    <div className="custom-choice-actions">
                      <button onClick={onCustomSubmit} disabled={!customText.trim()} className="btn-primary custom-choice-submit">
                        {strings.customChoiceSubmit}
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCustomInput(false); setCustomText('') }}
                        className="btn-ghost"
                      >
                        {strings.customChoiceCancel}
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      ) : null}

      <BottomSheet
        open={abilitySheetOpen}
        onClose={() => setShowAbilityPanel(false)}
        ariaLabel={strings.abilityPanelTitle}
      >
        <div className="sheet-grab">
          <div className="sheet-handle" aria-hidden="true" />
          <div className="ability-panel__head">
            <div>
              <span className="ability-panel__title">{strings.abilityPanelTitle}</span>
              <span className="ability-panel__hint">{strings.abilityPanelHint}</span>
            </div>
            <button
              type="button"
              className="ability-panel__close"
              onClick={() => setShowAbilityPanel(false)}
            >
              {strings.customChoiceCancel}
            </button>
          </div>
        </div>
        <div className="ability-list">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              className={`ability-card${role.used ? ' is-used' : ''}`}
              disabled={role.used}
              onClick={() => onAbilityChoice(role)}
            >
              <span className="ability-card__owner">{role.name}</span>
              <span className="ability-card__text">{formatAbilityForDisplay(role)}</span>
              <span className="ability-card__action">
                {role.used ? strings.usedLabel : strings.abilityUseBtn}
              </span>
            </button>
          ))}
        </div>
      </BottomSheet>

      {error ? (
        <p style={{ color: 'var(--state-failing)', fontSize: '0.85rem', marginTop: '1rem' }} className="type-caps">
          {error}
        </p>
      ) : null}
    </section>
  )
}
