import type { RequestListener } from 'node:http'

import type { UsageLimits } from './limits'

export interface ProxyConfig {
  GEMINI_API_KEY: string
  ANTHROPIC_API_KEY: string
  API_SECRET: string
  GEMINI_MODEL: string
  CLAUDE_MODEL: string
  DEFAULT_PROVIDER: string
  PORT: number
  USAGE_LIMITS: UsageLimits
}

export interface AnthropicLike {
  messages: {
    create(params: Record<string, unknown>, options?: { signal?: AbortSignal }): Promise<unknown>
  }
}

export interface ProxyDeps {
  fetch?: typeof fetch
  anthropic?: AnthropicLike
}

export function readConfig(env: Record<string, string | undefined>): ProxyConfig
export function createApp(config: ProxyConfig, deps?: ProxyDeps): RequestListener
