import { SiteHeader } from '@khelias/ui/react'
import { roomHref } from '@khelias/ui/rooms'
import type { Language } from '../game/types'
import { translations } from '../i18n/translations'

interface AppSiteHeaderProps {
  language: Language
  onLanguageChange: (next: Language) => void
}

// The KHE site header: the mark to the khe.ee front page, the rooms menu with
// Games current and the game's name after the slash (estate ADR-021). Opened
// directly or installed, only the game's name and the language show (estate ADR-030).
export function AppSiteHeader({ language, onLanguageChange }: AppSiteHeaderProps) {
  const strings = translations[language]
  return (
    <SiteHeader
      brand={{ href: roomHref('home', language), label: strings.kheHomeAria }}
      rooms={{ current: 'games', locale: language }}
      context={{ title: strings.appHeaderTitle }}
      product={{ root: '/adventure/' }}
      locales={[
        { code: 'et', label: 'ET', attrs: { title: strings.languageEstonian } },
        { code: 'en', label: 'EN', attrs: { title: strings.languageEnglish } },
      ]}
      activeLocale={language}
      languageLabel={strings.languageToggleLabel}
      onLocaleChange={onLanguageChange}
    />
  )
}
