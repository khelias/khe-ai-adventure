import { useEffect } from 'react'
import { useGameStore } from './store/gameStore'
import { SiteFooter } from '@khelias/ui/react'
import { translations } from './i18n/translations'
import { hrefWithLanguage, persistLanguagePreference } from './i18n/language'
import { AppSiteHeader } from './components/AppSiteHeader'
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
      <AppSiteHeader language={language} onLanguageChange={(next) => setSetting('language', next)} />

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

      <SiteFooter
        label={strings.footerLinksLabel}
        links={[
          { label: 'GitHub', href: 'https://github.com/khelias/khe-ai-adventure', icon: 'github' },
          { label: 'LinkedIn', href: 'https://www.linkedin.com/in/kaido-henrik-elias/', icon: 'linkedin' },
          { label: strings.footerPrivacyLink, href: privacyHref },
        ]}
        lines={[{ text: strings.footerAiDisclosure }, { text: strings.footerHosting }]}
      />
    </div>
  )
}
