import type { Language } from '../game/types'

export const DEFAULT_LANGUAGE: Language = 'en'
export const LANGUAGE_STORAGE_KEY = 'app_locale'
export const LANGUAGE_QUERY_PARAM = 'lang'

export function isLanguage(value: string | null | undefined): value is Language {
  return value === 'et' || value === 'en'
}

function readUrlLanguage(): Language | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const lang = params.get(LANGUAGE_QUERY_PARAM)
  const legacyLocale = params.get('locale')
  if (isLanguage(lang)) return lang
  if (isLanguage(legacyLocale)) return legacyLocale
  return null
}

function readStoredLanguage(): Language | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  return isLanguage(stored) ? stored : null
}

function syncDocumentLanguage(language: Language): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = language
}

function syncUrlLanguage(language: Language): void {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  url.searchParams.set(LANGUAGE_QUERY_PARAM, language)
  url.searchParams.delete('locale')
  window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

export function persistLanguagePreference(language: Language): void {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language)
    syncUrlLanguage(language)
  }
  syncDocumentLanguage(language)
}

// The home-screen name is Estonian, and iOS starts an installed app with storage of its own.
function isInstalledApp(): boolean {
  if (typeof window === 'undefined') return false
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
  return standalone || window.matchMedia('(display-mode: standalone)').matches
}

// Only a press on the switcher is stored: app_locale is shared across games.khe.ee, where an
// installed app on Android shares the browser's storage, and every room link and the launcher's
// links carry a ?lang, chosen or not.
export function loadInitialLanguage(): Language {
  const language =
    readUrlLanguage() ?? readStoredLanguage() ?? (isInstalledApp() ? 'et' : DEFAULT_LANGUAGE)
  syncDocumentLanguage(language)
  return language
}

// Going back can land on a history entry from before a language change, and its ?lang would
// outrank the stored choice on the next load.
export function keepUrlLanguage(language: Language): void {
  const fromUrl = readUrlLanguage()
  if (fromUrl && fromUrl !== language) syncUrlLanguage(language)
}

export function hrefWithLanguage(href: string, language: Language): string {
  const base = typeof window === 'undefined' ? 'https://games.khe.ee' : window.location.origin
  const url = new URL(href, base)
  url.searchParams.set(LANGUAGE_QUERY_PARAM, language)
  return `${url.pathname}${url.search}${url.hash}`
}
