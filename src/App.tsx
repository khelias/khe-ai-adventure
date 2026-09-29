import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { LangToggle } from './components/LangToggle'
import { translations } from './i18n/translations'
import { hrefWithLanguage, persistLanguagePreference } from './i18n/language'
import { SetupScreen } from './components/SetupScreen'
import { StoryChoiceScreen } from './components/StoryChoiceScreen'
import { RoleAssignmentScreen } from './components/RoleAssignmentScreen'
import { SecretAssignmentScreen } from './components/SecretAssignmentScreen'
import { GameScreen } from './components/GameScreen'
import { GameOverScreen } from './components/GameOverScreen'

export default function App() {
  const screen = useGameStore((s) => s.screen)
  const language = useGameStore((s) => s.settings.language)
  const strings = translations[language]
  const contentClassName =
    screen === 'game' || screen === 'gameOver'
      ? 'app-content app-content--play'
      : 'app-content'
  const gamesHomeHref = hrefWithLanguage('/', language)
  const privacyHref = hrefWithLanguage('/privacy', language)

  useEffect(() => {
    persistLanguagePreference(language, { syncUrl: false })
    document.title = strings.appTitle
  }, [language, strings.appTitle])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [screen])

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__inner">
          <div className="app-header__left">
            <a
              href={gamesHomeHref}
              className="app-brand-link"
              aria-label={strings.kheHomeAria}
            >
              <span>KHE</span>
              <span className="app-brand-link__suffix">.ee</span>
            </a>
            <div className="app-header__context" aria-current="page">
              <span>KHE Games</span>
              <strong>{strings.appHeaderTitle}</strong>
            </div>
          </div>
          <div className="app-header__actions">
            <LangToggle />
          </div>
        </div>
      </header>

      <main className={screen === 'setup' ? 'app-main app-main--setup' : 'app-main'}>
        {screen === 'setup' ? (
          <SetupScreen />
        ) : (
          <div className={contentClassName}>
            {screen === 'storyChoice' && <StoryChoiceScreen />}
            {screen === 'roleAssignment' && <RoleAssignmentScreen />}
            {screen === 'secretAssignment' && <SecretAssignmentScreen />}
            {screen === 'game' && <GameScreen />}
            {screen === 'gameOver' && <GameOverScreen />}
          </div>
        )}
      </main>

      <footer className="adventure-footer">
        <nav aria-label={strings.footerLinksLabel}>
          <a href="https://github.com/khelias/khe-ai-adventure">GitHub</a>
          <span aria-hidden="true">·</span>
          <a href="https://www.linkedin.com/in/kaido-henrik-elias/">LinkedIn</a>
          <span aria-hidden="true">·</span>
          <a href={privacyHref}>{strings.footerPrivacyLink}</a>
        </nav>
        <span>{strings.footerAiDisclosure}</span>
        <span>{strings.footerHosting}</span>
      </footer>
    </div>
  )
}
