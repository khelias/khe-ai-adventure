import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { SiteHeader } from '@khelias/ui/react'
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
  const setSetting = useGameStore((s) => s.setSetting)
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
      <SiteHeader
        brand={{ href: gamesHomeHref, label: strings.kheHomeAria }}
        context={{ kicker: 'KHE Games', title: strings.appHeaderTitle }}
        locales={[
          { code: 'et', label: 'ET', attrs: { title: strings.languageEstonian } },
          { code: 'en', label: 'EN', attrs: { title: strings.languageEnglish } },
        ]}
        activeLocale={language}
        languageLabel={strings.languageToggleLabel}
        onLocaleChange={(next) => setSetting('language', next)}
      />

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
