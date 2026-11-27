import { useEffect, useState } from 'react'
import { useGameStore } from './store/gameStore'
import { SiteFooter } from '@khelias/ui/react'
import { translations } from './i18n/translations'
import { hrefWithLanguage, keepUrlLanguage } from './i18n/language'
import { ROOMS, roomHref } from '@khelias/ui/rooms'
import { exitGame } from './game/actions'
import { useBackGuard } from './useBackGuard'
import { useOnline } from './useOnline'
import { AppSiteHeader } from './components/AppSiteHeader'
import { SetupScreen } from './components/SetupScreen'
import { StoryChoiceScreen } from './components/StoryChoiceScreen'
import { RoleAssignmentScreen } from './components/RoleAssignmentScreen'
import { SecretAssignmentScreen } from './components/SecretAssignmentScreen'
import { GameScreen } from './components/GameScreen'
import { GameOverScreen } from './components/GameOverScreen'
import { ExitGameSheet } from './components/ExitGameSheet'

const gamesRoom = ROOMS.find((room) => room.id === 'games')

export default function App() {
  const screen = useGameStore((s) => s.screen)
  const language = useGameStore((s) => s.settings.language)
  const provider = useGameStore((s) => s.settings.provider)
  const setSetting = useGameStore((s) => s.setSetting)
  const strings = translations[language]
  const online = useOnline()
  const [exitOpen, setExitOpen] = useState(false)
  const gameRunning = screen === 'secretAssignment' || screen === 'game'
  if (exitOpen && !gameRunning) setExitOpen(false)
  useBackGuard(gameRunning, () => setExitOpen(true))
  const contentClassName =
    screen === 'game' || screen === 'gameOver'
      ? 'app-content app-content--play'
      : 'app-content'
  const privacyHref = hrefWithLanguage('/privacy', language)

  useEffect(() => {
    document.title = `${strings.appHeaderTitle} | KHE Games`
  }, [strings.appHeaderTitle])

  useEffect(() => {
    const onPopState = () => keepUrlLanguage(language)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [language])

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' })
  }, [screen])

  return (
    <div className="app-shell">
      <AppSiteHeader language={language} onLanguageChange={(next) => setSetting('language', next)} />

      {!online && provider !== 'mock' ? (
        <p className="offline-notice" role="status">{strings.offlineNotice}</p>
      ) : null}

      <main className={screen === 'setup' ? 'app-main app-main--setup' : 'app-main'}>
        {screen === 'setup' ? (
          <SetupScreen />
        ) : (
          <div className={contentClassName}>
            {gameRunning ? (
              <div className="game-exit">
                <button type="button" className="btn-ghost" onClick={() => setExitOpen(true)}>
                  {strings.exitGameBtn}
                </button>
              </div>
            ) : null}
            {screen === 'storyChoice' && <StoryChoiceScreen />}
            {screen === 'roleAssignment' && <RoleAssignmentScreen />}
            {screen === 'secretAssignment' && <SecretAssignmentScreen />}
            {screen === 'game' && <GameScreen />}
            {screen === 'gameOver' && <GameOverScreen />}
          </div>
        )}
      </main>

      <ExitGameSheet
        open={exitOpen}
        strings={strings}
        onClose={() => setExitOpen(false)}
        onConfirm={() => {
          setExitOpen(false)
          exitGame()
        }}
      />

      <SiteFooter
        label={strings.footerLinksLabel}
        home={{ label: 'KHE.ee', href: roomHref('home', language) }}
        links={[
          { label: gamesRoom?.name[language] ?? 'KHE Games', href: roomHref('games', language) },
          { label: 'GitHub', href: 'https://github.com/khelias/khe-ai-adventure', icon: 'github' },
          { label: 'LinkedIn', href: 'https://www.linkedin.com/in/kaido-henrik-elias/', icon: 'linkedin' },
          { label: strings.footerPrivacyLink, href: privacyHref },
        ]}
        lines={[{ text: strings.footerAiDisclosure }, { text: strings.footerHosting }]}
      />
    </div>
  )
}
