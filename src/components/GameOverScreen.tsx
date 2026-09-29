import { useState } from 'react'
import { useGameStore } from '../store/gameStore'
import { translations } from '../i18n/translations'
import { generateSequel } from '../game/actions'
import { LoadingDots } from './LoadingDots'
import { downloadTranscript } from '../game/transcript'
import { SecretSigil } from './SecretSigil'

export function GameOverScreen() {
  const language = useGameStore((s) => s.settings.language)
  const kind = useGameStore((s) => s.gameOverKind)
  const title = useGameStore((s) => s.gameOverTitle)
  const text = useGameStore((s) => s.gameOverText)
  const allScenes = useGameStore((s) => s.allScenes)
  const roles = useGameStore((s) => s.roles)
  const parameters = useGameStore((s) => s.parameters)
  const secrets = useGameStore((s) => s.secrets)
  const transcript = useGameStore((s) => s.transcript)
  const reset = useGameStore((s) => s.reset)
  const isLoading = useGameStore((s) => s.isLoading)
  const error = useGameStore((s) => s.error)
  const strings = translations[language]

  const [sequelText, setSequelText] = useState(text)
  const [showFullStory, setShowFullStory] = useState(false)
  const [copied, setCopied] = useState(false)

  const hasSecrets = secrets.length > 0
  const winningRoleNames = roles
    .filter((role) => secrets.find((secret) => secret.ownerRoleId === role.id)?.result === 'won')
    .map((role) => role.name)

  const fullStoryText = `${[...allScenes, text].join('\n\n—\n\n')}\n\n${strings.storyCopyCredit}`

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(fullStoryText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <section className="gameover-screen space-y-7">
      <div className="secret-header">
        <p className="type-caps">
          {strings.storyToldKicker}
        </p>
        <h2 className="screen-title screen-title--large">
          {title}
        </h2>
        <div className="title-rule" />
      </div>

      <div className="gameover-result-panel fade-in">
        <div className="gameover-result-head">
          <p className="type-caps">{strings.gameResultTitle}</p>
          <p className="gameover-result-line">
            {winningRoleNames.length > 0
              ? strings.winnersList(winningRoleNames.join(', '))
              : strings.noSecretWinners}
          </p>
        </div>
        {parameters.length > 0 && (
          <div>
            <p className="type-caps gameover-result-kicker">{strings.finalParametersTitle}</p>
            <div className="final-parameter-grid">
              {parameters.map((parameter) => (
                <div key={parameter.name} className="final-parameter">
                  <span className="final-parameter__name">{parameter.name}</span>
                  <span className="final-parameter__state">
                    {parameter.states[parameter.currentStateIndex] ?? parameter.states.at(-1) ?? ''}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {hasSecrets && (
        <div className="final-panel final-panel--secrets fade-in">
          <div className="secret-results-header">
            <p className="type-caps">{strings.secretsRevealKicker}</p>
            <h3 className="final-panel-title">{strings.secretsRevealIntro}</h3>
          </div>
          <div className="secret-results-grid">
            {roles.map((r) => {
              const s = secrets.find((x) => x.ownerRoleId === r.id)
              if (!s) return null
              const won = s.result === 'won'

              return (
                <div
                  key={r.id}
                  className={`secret-result-card ${won ? 'secret-result-card--won' : 'secret-result-card--lost'}`}
                >
                  <div className="secret-result-card__head">
                    <div className="secret-result-card__identity">
                      <SecretSigil archetype={s.archetype} />
                      <div>
                        <span className="secret-result-card__name">{r.name}</span>
                        <span className="secret-result-card__role">
                          {strings.secretArchetypeName(s.archetype)}
                        </span>
                      </div>
                    </div>
                    <span className={`type-caps secret-result-card__result ${won ? 'won' : 'lost'}`}>
                      {won ? strings.secretsResultWon : strings.secretsResultLost}
                    </span>
                  </div>
                  <div className="secret-result-card__desc">
                    {strings.secretDescription(s.archetype, s.paramName)}
                  </div>
                  {s.paramName ? (
                    <div className="secret-result-card__target">
                      <span>{strings.secretsTargetLabel}</span>
                      <strong>{s.paramName}</strong>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className="ending-story-panel text-left space-y-4">
        <p className="type-caps">{strings.endingStoryTitle}</p>
        {text.split('\n').filter(Boolean).map((p, i) => (
          <p key={i} className="scene-prose">
            {p}
          </p>
        ))}
      </div>

      {/* Full story toggle */}
      {allScenes.length > 0 && (
        <div className="text-left space-y-3">
          <div className="story-tools">
            <button
              type="button"
              onClick={() => setShowFullStory((v) => !v)}
              className="btn-ghost btn-ghost--caps"
            >
              {showFullStory ? strings.hideFullStoryBtn : strings.showFullStoryBtn}
            </button>
            <div className="story-tools__rule" />
            <button
              type="button"
              onClick={() => void copyToClipboard()}
              className={`btn-ghost btn-ghost--caps ${copied ? 'is-copied' : ''}`}
            >
              {copied ? strings.copiedMsg : strings.copyStoryBtn}
            </button>
            {transcript ? (
              <button
                type="button"
                onClick={() => downloadTranscript(transcript)}
                className="btn-ghost btn-ghost--caps"
              >
                {strings.downloadTranscriptBtn}
              </button>
            ) : null}
          </div>

          {showFullStory && (
            <div className="space-y-6">
              {allScenes.map((scene, i) => (
                <div key={i}>
                  <div className="ornament-rule type-caps" style={{ marginBottom: '0.75rem', fontSize: '0.6rem' }}>
                    {strings.sceneLabel} {String(i + 1).padStart(2, '0')}
                  </div>
                  {scene.split('\n').filter(Boolean).map((p, j) => (
                    <p key={j} className="full-story-prose">{p}</p>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Sequel */}
      {kind === 'narrative' ? (
        <div className="space-y-3 text-left" style={{ borderTop: '1px solid var(--line)', paddingTop: '1.25rem' }}>
          <label className="type-caps" style={{ display: 'block' }} htmlFor="sequel-input">{strings.sequelLabel}</label>
          <p className="setup-hint" style={{ margin: '0 0 0.5rem 0' }}>{strings.sequelHint}</p>
          <textarea
            id="sequel-input"
            value={sequelText}
            onChange={(e) => setSequelText(e.target.value)}
            rows={4}
            className="input-page resize-none"
          />
          <button
            onClick={() => void generateSequel(sequelText)}
            disabled={isLoading || !sequelText.trim()}
            className="btn-primary"
            aria-label={isLoading ? strings.loading : strings.continueSequelBtn}
          >
            {isLoading ? <LoadingDots /> : strings.continueSequelBtn}
          </button>
        </div>
      ) : null}

      <div className="text-center" style={{ color: 'var(--text-faint)', letterSpacing: '0.4em', fontSize: '0.75rem' }}>
        · · ·
      </div>

      <button onClick={reset} className="btn-secondary w-full">
        {strings.restartBtn}
      </button>

      {error ? (
        <p style={{ color: 'var(--state-failing)', fontSize: '0.85rem' }}>{error}</p>
      ) : null}
    </section>
  )
}
