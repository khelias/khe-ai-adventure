/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_SECRET?: string
}

interface AdventureRuntimeConfig {
  readonly apiSecret?: string
}

interface Window {
  __ADVENTURE_CONFIG__?: AdventureRuntimeConfig
}
