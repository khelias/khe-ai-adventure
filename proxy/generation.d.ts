import type { TokenUsage } from './limits'

export interface Deadline {
  signal: AbortSignal
  remaining(): number
  clear(): void
}

export interface ProviderResult {
  model?: string
  data: Record<string, unknown> & { scene?: unknown; choices?: unknown; gameOver?: unknown; gameOverText?: unknown }
  cacheHit?: string | null
  tokens?: TokenUsage
}

export interface EditorPassResult {
  applied: boolean
  tokens: number
}

export interface RetryContractOptions<R> {
  /** Names the contract in the skip log line. */
  name: string
  result: R
  reminders: readonly string[]
  violationsOf(result: R): string[]
  promptFor(reminder: string, violations: string[]): string
  call(extraPrompt: string): Promise<R>
  deadline: Pick<Deadline, 'remaining'>
  minRetryMs: number
  onRetry(attempt: number, violations: string[]): void
  onFailure(attempt: number, error: unknown): void
}

export interface RunGenerationOptions {
  callOnce(extraPrompt: string, signal: AbortSignal): Promise<ProviderResult>
  editTurn(data: ProviderResult['data'], signal: AbortSignal): Promise<EditorPassResult>
  editStructured(data: ProviderResult['data'], signal: AbortSignal): Promise<EditorPassResult>
  editorEnabled: boolean
  language?: 'et' | 'en'
  provider: string
  deadline: Deadline
  minRetryMs: number
}

export interface GenerationOutcome {
  result: ProviderResult
  retried: number
  costRetried: number
  coercedGameOver: boolean
  editorApplied: boolean
  editorMs: number
  editorTokens: number | null
}

export function createDeadline(totalMs: number, options?: { now?: () => number }): Deadline
/** Rejects with an AbortError once `signal` aborts, whether or not `promise` honours it. */
export function withSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T>
/** Coerces non-array `choices` of a turn-shaped result to []; returns the original typeof, or null when untouched. */
export function normalizeTurnChoices(result: unknown): string | null
export function retryContract<R>(options: RetryContractOptions<R>): Promise<{ result: R; attempts: number }>
/** Throws an AbortError when the deadline expires before the provider answers. */
export function runGeneration(options: RunGenerationOptions): Promise<GenerationOutcome>
