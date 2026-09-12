// Full game transcript — captured opportunistically during play and exported
// as a single JSON document. Used to analyze playtests after the fact
// ("why did the loop feel boring", "did parameters actually move", "did the
// AI honor expectedChanges").
//
// The transcript is intentionally lossless: it captures both what the
// engine applied (authoritative) AND what the AI claimed (often differs),
// so we can spot drift between the two. It also captures the choices
// players DID NOT pick — useful to see which forks the AI offered.
//
// Two persistence channels:
//   - localStorage (last N started games) — loaded by analysis tooling later.
//   - download button on GameOverScreen — for sharing a single transcript
//     out of band (e.g. paste into a Claude chat for postmortem).

import type {
  Choice,
  ContextInput,
  Duration,
  GameOverKind,
  Genre,
  Language,
  Parameter,
  ParameterCost,
  Provider,
  Role,
  Secret,
} from './types'
import type { StoryPhase } from './prompts/phases'

const STORAGE_KEY = 'adventureTranscripts'
const STORAGE_LIMIT = 10
const SCHEMA_VERSION = 1

export interface TurnRecord {
  turn: number
  phase: StoryPhase
  triggeredBy:
    | { kind: 'kickoff' }
    | { kind: 'option'; choiceText: string; chosenChoice: Choice }
    | { kind: 'free-text'; text: string }
    // engine-forced second AI call (only paired with forceEnd='unrecoverable').
    // The PRECEDING record in the transcript holds the player's actual choice.
    | { kind: 'engine-retry'; reason: 'unrecoverable'; lastChoiceText: string }
  scene: string
  // The set of choices the AI offered AT this turn for the player to weigh.
  // Empty on game-over turns.
  choicesOffered: Choice[]
  // What the engine actually applied to parameters (from chosenChoice.expectedChanges
  // when present, else the AI's response.parameters fallback).
  appliedChanges: ParameterCost[]
  // What the AI's response.parameters claimed. Often diverges from
  // appliedChanges — kept for drift analysis.
  aiClaimedChanges: { name: string; change: number }[]
  parametersAfter: Parameter[]
  rolesAfter: Role[]
  forceEnd?: 'unrecoverable' | 'narrative-final'
}

export interface GameTranscript {
  version: typeof SCHEMA_VERSION
  startedAt: string
  endedAt?: string
  setup: {
    players: number
    genre: Genre
    duration: Duration
    language: Language
    provider: Provider
    context: ContextInput
    maxTurns: number
  }
  story: {
    title: string
    summary: string
    parametersAtStart: Parameter[]
    rolesAtStart: Role[]
  }
  secrets?: Secret[]
  turns: TurnRecord[]
  end?: {
    kind: GameOverKind
    title: string
    text: string
    finalParameters: Parameter[]
    finalRoles: Role[]
  }
}

export function newTranscript(args: {
  startedAt: string
  setup: GameTranscript['setup']
  story: GameTranscript['story']
}): GameTranscript {
  return {
    version: SCHEMA_VERSION,
    startedAt: args.startedAt,
    setup: args.setup,
    story: args.story,
    turns: [],
  }
}

// Persist to localStorage. Keeps the most recent STORAGE_LIMIT games.
// Re-persisting the same startedAt updates the existing entry, which lets us
// safely save every turn without filling storage with duplicate partial games.
// Older entries are dropped — this is a debug tool, not a save system.
// Secrets stay private until reveal, and localStorage is the one place on a
// pass-the-phone device where a curious player can read ahead. So they are
// withheld from every write until the game has ended. The in-memory transcript
// keeps them throughout, so the GameOver download is unaffected, and the
// end-of-game write still carries the full set: evaluateAll only adds `result`
// to each Secret, so the at-assignment archetype snapshot survives intact.
function forStorage(transcript: GameTranscript): GameTranscript {
  if (transcript.end) return transcript
  const copy = { ...transcript }
  delete copy.secrets
  return copy
}

export function persistTranscript(transcript: GameTranscript): void {
  if (typeof window === 'undefined') return
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    const list: GameTranscript[] = raw ? (JSON.parse(raw) as GameTranscript[]) : []
    const rest = list.filter((item) => item.startedAt !== transcript.startedAt)
    const next = [forStorage(transcript), ...rest].slice(0, STORAGE_LIMIT)
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    // localStorage write failures are non-fatal — the user can still download.
  }
}

export function loadStoredTranscripts(): GameTranscript[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as GameTranscript[]) : []
  } catch {
    return []
  }
}

export function transcriptFilename(transcript: GameTranscript): string {
  // Sortable timestamp + short slug from genre + duration. Keeps multiple
  // exports from colliding when downloaded into the same folder.
  const ts = transcript.startedAt.replace(/[:.]/g, '-').slice(0, 19)
  const slug = `${transcript.setup.genre}-${transcript.setup.duration}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
  return `adventure-${ts}-${slug}.json`
}

export function downloadTranscript(transcript: GameTranscript): void {
  if (typeof window === 'undefined') return
  const blob = new Blob([JSON.stringify(transcript, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = transcriptFilename(transcript)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
