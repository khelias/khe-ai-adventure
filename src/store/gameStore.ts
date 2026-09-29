import { create } from 'zustand'
import type {
  Choice,
  GameOverKind,
  Parameter,
  ParameterEvent,
  Role,
  Screen,
  Secret,
  Settings,
  Story,
} from '../game/types'
import { durationToMaxTurns } from '../game/engine'
import { assignSecrets as assignSecretsImpl, evaluateAll } from '../game/secrets'
import { loadInitialLanguage, persistLanguagePreference } from '../i18n/language'
import {
  newTranscript,
  persistTranscript,
  type GameTranscript,
  type TurnRecord,
} from '../game/transcript'

const PROVIDER_STORAGE_KEY = 'adventureProvider'
const ADULTS_CONFIRMED_STORAGE_KEY = 'adventureAdultsConfirmed'

function loadStoredProvider(): Settings['provider'] {
  if (typeof window === 'undefined') return 'gemini'
  const stored = window.localStorage.getItem(PROVIDER_STORAGE_KEY)
  return stored === 'claude' || stored === 'gemini' || stored === 'mock' ? stored : 'gemini'
}

function loadStoredAdultsConfirmed(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(ADULTS_CONFIRMED_STORAGE_KEY) === 'true'
}

const initialSettings: Settings = {
  language: loadInitialLanguage(),
  provider: loadStoredProvider(),
  players: 3,
  genre: 'Zombies',
  duration: 'Short',
  context: {
    location: '',
    playersDesc: '',
    vibe: '',
    insideJoke: '',
  },
  adultsConfirmed: loadStoredAdultsConfirmed(),
}

interface GameState {
  settings: Settings
  screen: Screen

  // Story draft (set after AI generation, before role assignment)
  availableStories: Story[]

  // Active game
  title: string
  summary: string
  roles: Role[]
  parameters: Parameter[]
  currentTurn: number
  maxTurns: number
  sceneText: string
  choices: Choice[]
  parameterEvents: ParameterEvent[]
  // The choices the AI offered on the PREVIOUS turn (= the set the player
  // just picked from). Sent back to the AI on the next turn so it can
  // avoid paraphrasing the same shape — "Mari investigates / Jaan retreats
  // / Liis stalls" twice in a row is the loop-boredom failure mode.
  // Empty until at least one turn has resolved.
  lastTurnChoices: Choice[]
  recentScenes: string[]
  allScenes: string[]

  // Secrets — each role holds one private win condition, client-only
  secrets: Secret[]

  // End state
  gameOverKind: GameOverKind
  gameOverTitle: string
  gameOverText: string

  // Full-fidelity transcript built across the game. Captures setup, the
  // initial story state, every turn (offered choices + applied changes +
  // AI claims + post-state), secrets, and the end. Null until initStory
  // creates one. Auto-persisted to localStorage on game-end; downloadable
  // as JSON from the game-over screen.
  transcript: GameTranscript | null

  // UI
  isLoading: boolean
  error: string | null
}

interface GameActions {
  setSetting<K extends keyof Settings>(this: void, key: K, value: Settings[K]): void
  setScreen(this: void, screen: Screen): void
  setAvailableStories(this: void, stories: Story[]): void
  initStory(this: void, story: Story): void
  setRoleName(this: void, index: number, name: string): void
  startGame(this: void): void
  setTurnResult(this: void, payload: {
    sceneText: string
    choices: Choice[]
    parameters: Parameter[]
    roles: Role[]
    currentTurn: number
    parameterEvents?: ParameterEvent[]
  }): void
  setGameOver(this: void, kind: GameOverKind, title: string, text: string): void
  pushFinalScene(this: void, scene: string): void
  appendTurnRecord(this: void, record: TurnRecord): void
  assignSecrets(this: void): void
  scoreSecrets(this: void): void
  setLoading(this: void, loading: boolean): void
  setError(this: void, error: string | null): void
  reset(this: void): void
}

const initialGameSlice = {
  screen: 'setup' as Screen,
  availableStories: [] as Story[],
  title: '',
  summary: '',
  roles: [] as Role[],
  parameters: [] as Parameter[],
  currentTurn: 0,
  maxTurns: 0,
  sceneText: '',
  choices: [] as Choice[],
  parameterEvents: [] as ParameterEvent[],
  lastTurnChoices: [] as Choice[],
  recentScenes: [] as string[],
  allScenes: [] as string[],
  secrets: [] as Secret[],
  gameOverKind: null as GameOverKind,
  gameOverTitle: '',
  gameOverText: '',
  transcript: null as GameTranscript | null,
  isLoading: false,
  error: null as string | null,
}

export const useGameStore = create<GameState & GameActions>()((set) => ({
  settings: initialSettings,
  ...initialGameSlice,

  setSetting: (key, value) =>
    set((state) => {
      if (key === 'language') {
        persistLanguagePreference(value as Settings['language'])
      }
      if (key === 'provider' && typeof window !== 'undefined') {
        window.localStorage.setItem(PROVIDER_STORAGE_KEY, value as string)
      }
      if (key === 'adultsConfirmed' && typeof window !== 'undefined') {
        if (value === true) window.localStorage.setItem(ADULTS_CONFIRMED_STORAGE_KEY, 'true')
        else window.localStorage.removeItem(ADULTS_CONFIRMED_STORAGE_KEY)
      }
      return { settings: { ...state.settings, [key]: value } }
    }),

  setScreen: (screen) => set({ screen }),

  setAvailableStories: (availableStories) =>
    set({ availableStories, screen: 'storyChoice' }),

  initStory: (story) =>
    set({
      title: story.title,
      summary: story.summary,
      roles: story.roles.map((r, index) => ({
        id: index,
        name: r.name,
        description: r.description,
        ability: r.ability,
        abilityParameter: r.abilityParameter,
        used: false,
      })),
      parameters: story.parameters.map((p) => ({
        ...p,
        currentStateIndex: 0,
      })),
      screen: 'roleAssignment',
    }),

  setRoleName: (index, name) =>
    set((state) => ({
      roles: state.roles.map((r, i) => (i === index ? { ...r, name } : r)),
    })),

  startGame: () =>
    set((state) => {
      const maxTurns = durationToMaxTurns(state.settings.duration)
      // Snapshot the at-start state into a fresh transcript. Captures both
      // settings (genre/duration/context) and the AI-generated story bones
      // (title/summary/parameters/roles before any deltas).
      const transcript: GameTranscript = newTranscript({
        startedAt: new Date().toISOString(),
        setup: {
          players: state.settings.players,
          genre: state.settings.genre,
          duration: state.settings.duration,
          language: state.settings.language,
          provider: state.settings.provider,
          context: state.settings.context,
          maxTurns,
        },
        story: {
          title: state.title,
          summary: state.summary,
          parametersAtStart: state.parameters,
          rolesAtStart: state.roles,
        },
      })
      // Capture secrets assigned BEFORE the game started (assignSecrets fires
      // on the secret-distribution screen, which is before startGame). Without
      // this, the persisted transcript would miss the at-assignment archetype
      // tags — final scoring is captured on game-end, but the original
      // assignment snapshot would be lost.
      if (state.secrets.length > 0) transcript.secrets = state.secrets
      persistTranscript(transcript)
      return {
        currentTurn: 1,
        maxTurns,
        screen: 'game',
        parameterEvents: [],
        transcript,
      }
    }),

  setTurnResult: ({
    sceneText,
    choices,
    parameters,
    roles,
    currentTurn,
    parameterEvents = [],
  }) =>
    set((state) => ({
      sceneText,
      choices,
      parameterEvents,
      // Capture the OUTGOING choices (what the player just decided from)
      // so the next turn's AI call can see them and avoid paraphrasing.
      // The very first setTurnResult (turn 1, kickoff) has state.choices=[],
      // which correctly leaves lastTurnChoices empty.
      lastTurnChoices: state.choices,
      parameters,
      roles,
      currentTurn,
      recentScenes: [...state.recentScenes, sceneText].slice(-3),
      allScenes: [...state.allScenes, sceneText],
    })),

  setGameOver: (kind, title, text) =>
    set((state) => {
      // Finalize the transcript: stamp endedAt, capture the end record + final
      // state, and persist to localStorage. Persistence is fire-and-forget — a
      // failure here must not block the gameOver screen rendering.
      const finalized: GameTranscript | null = state.transcript
        ? {
            ...state.transcript,
            endedAt: new Date().toISOString(),
            secrets: state.secrets,
            end: {
              kind,
              title,
              text,
              finalParameters: state.parameters,
              finalRoles: state.roles,
            },
          }
        : null
      if (finalized) persistTranscript(finalized)
      return {
        screen: 'gameOver',
        gameOverKind: kind,
        gameOverTitle: title,
        gameOverText: text,
        transcript: finalized,
      }
    }),

  pushFinalScene: (scene) =>
    set((state) => ({ allScenes: [...state.allScenes, scene] })),

  appendTurnRecord: (record) =>
    set((state) => {
      if (!state.transcript) return {}
      const transcript = {
        ...state.transcript,
        turns: [...state.transcript.turns, record],
      }
      persistTranscript(transcript)
      return {
        transcript,
      }
    }),

  assignSecrets: () =>
    set((state) => {
      const secrets = assignSecretsImpl(state.roles, state.parameters)
      // Mirror into transcript if it already exists. assignSecrets fires
      // before startGame on the normal path, so transcript will usually be
      // null here — final scoreSecrets call captures committed secrets.
      const transcript = state.transcript
        ? { ...state.transcript, secrets }
        : state.transcript
      if (transcript) persistTranscript(transcript)
      return {
        secrets,
        transcript,
        screen: 'secretAssignment',
      }
    }),

  scoreSecrets: () =>
    set((state) => {
      const secrets = evaluateAll(state.secrets, {
        parameters: state.parameters,
        gameOverKind: state.gameOverKind,
      })
      // setGameOver runs BEFORE scoreSecrets in the actions.ts flow, so the
      // transcript was already persisted with pre-scored secrets. Update the
      // in-memory transcript so the GameOverScreen download captures the
      // scored version, AND re-persist for localStorage analysis tooling.
      let transcript = state.transcript
      if (transcript) {
        transcript = { ...transcript, secrets }
        persistTranscript(transcript)
      }
      return { secrets, transcript }
    }),

  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),

  reset: () =>
    set((state) => ({
      ...initialGameSlice,
      settings: state.settings,
    })),
}))
