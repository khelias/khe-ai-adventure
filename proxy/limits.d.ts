export interface UsageLimits {
  requestsPerHour: number
  tokensPerHour: number
  tokensPerDay: number
  globalTokensPerDay: number
}

export interface UsageRequest {
  get(name: string): string | undefined
  ip?: string
  socket?: { remoteAddress?: string }
}

export interface UsageReservation {
  key: string
  estimatedTokens: number
}

export interface ClientUsage {
  hourResetAt: number
  dayResetAt: number
  hourRequests: number
  dayRequests: number
  hourTokens: number
  dayTokens: number
}

export interface GlobalUsage {
  dayResetAt: number
  dayTokens: number
}

export interface UsageBudgetError extends Error {
  status: number
  publicBody: { error: string; details: string[]; limits: Omit<UsageLimits, 'globalTokensPerDay'> }
}

export interface UsageLimiter {
  limits: UsageLimits
  /** Throws a UsageBudgetError (status 429) when any client or global limit would be exceeded. */
  reserveClientBudget(req: UsageRequest, estimatedTokens: number): UsageReservation
  adjustClientBudget(reservation: UsageReservation | null | undefined, actualTokens: number): void
  adjustGlobalBudget(actualTokens: number): void
  hasGlobalRoom(estimatedTokens?: number): boolean
  clientUsage(key: string): ClientUsage | null
  globalUsage(): GlobalUsage
}

export interface TokenUsage {
  in?: number
  out?: number
  thoughts?: number
  total?: number
}

export const HOUR_MS: number
export const DAY_MS: number
export function parsePositiveInt(value: string | undefined, fallback: number): number
export function clientUsageKey(req: UsageRequest): string
export function tokenCountFromUsage(tokens: TokenUsage | null | undefined): number
export function createUsageLimiter(limits: UsageLimits, options?: { now?: () => number }): UsageLimiter
