# Architecture

Last reviewed: 2026-04-25

AI Adventure is a single-page React app plus a small provider proxy. The
core architectural decision is that the app owns game state and the AI owns
narration. The model may propose parameter changes and choices, but deterministic
client code applies state transitions, scores secrets, and decides when a game
ends.

## Architectural Goals

- **Playable at a table**: short setup, low turn latency, no account system, no
  multiplayer coordination overhead.
- **Bounded AI surface**: every AI response must match one of the canonical game
  schemas.
- **Cost-aware defaults**: Gemini 2.5 Flash is the live default; expensive models
  are opt-in.
- **Good Estonian output**: generated Estonian text is edited by a dedicated
  Gemini editor pass.
- **Simple deployment**: frontend and proxy ship as two images from one commit
  to the homelab games stack.

## System Context

1. The player group, 3-6 people on one shared device, opens
   `games.khe.ee/adventure`.
2. Cloudflare answers DNS, terminates TLS and carries the request through
   its tunnel to the home server.
3. The home server runs the React SPA and the Node proxy.
4. The proxy calls the Google Gemini API for the default generation and the
   Estonian editor, or the Anthropic API in an opt-in quality mode, which production has had off
   since 2026-11-17 (no key set, so it answers 503).

The browser never receives provider API keys and never calls providers directly.
All AI traffic goes through `adventure-proxy`.

## Runtime Containers

| Container | Part | What it does |
|---|---|---|
| games | nginx proxy for `/adventure/*` | passes the browser's page requests to `adventure-web` |
| games | nginx API proxy for `/adventure/api/*` | rate-limits on `CF-Connecting-IP`, then passes to `adventure-proxy` |
| adventure-web | static bundle | serves the SPA and its runtime `config.js` |
| adventure-proxy | guard | checks origin and HMAC, and the schema hash against the allowlist |
| adventure-proxy | `POST /generate` | calls the Gemini or Claude API, then the Estonian editor pass on Gemini |

## Installed App

A service worker (`src/sw.ts`, estate ADR-041) sits between the browser and
`adventure-web`. It keeps the app shell for an offline start, and answers a
navigation with the saved build when the network fails or takes over 3 seconds.
`config.js` and `/adventure/api/` always go to the network, so the signing
secret is fetched when the first request is signed.

## Main Request Flow

1. The browser sends `POST /generate { prompt, schema, provider, systemPrompt?, language? }`
   to `adventure-proxy`.
2. The proxy checks the origin, the HMAC signature when `API_SECRET` is
   configured, and the schema's hash against the exact allowlist.
3. It sends a structured generation request to the AI provider, which
   answers with a schema-shaped response.
4. It normalizes malformed turn choices and retries empty or free-choice
   contract violations.
5. When `language=et`, the Gemini editor corrects the story-facing text.
6. The proxy answers `{ provider, model, data }`.

The proxy logs provider, model, schema name, latency, token counts, retry counts,
editor time, Gemini thinking tokens, and Gemini cache hits when available.

## Frontend State Ownership

The frontend uses Zustand for session state. Important ownership boundaries:

| Concern | Owner |
|---|---|
| Current screen, setup inputs, selected provider | App |
| Role ids and ability-used flags | App |
| Parameter current state index | App |
| Secret assignment and scoring | App |
| Game transcript | App |
| Scene prose | AI |
| Choice text and declared expected changes | AI |
| Parameter consequence text | AI |
| Final narration | AI |

Normal offered choices are group-facing and must have `isAbility=false`.
Player-triggered special abilities are created by the app from the separate
ability panel and sent back as `isAbility=true`.

Secret goals are scored from core group pressures. `time` parameters are treated
as deadline context, not personal win-condition targets, because progress clocks
can move in the opposite direction from the engine's best-to-worst parameter
contract.

Transcripts are browser-local analysis artifacts. The app persists the last 10
started games to `localStorage`, updates the active transcript after each turn,
and exposes a JSON download on the game-over screen. There is no centralized
gameplay logging unless an explicit opt-in pipeline is added later.

## Prompt And Schema Structure

Prompts live in `src/game/prompts/`.

| File | Responsibility |
|---|---|
| `schemas.ts` | Canonical response schemas and `TurnResponse` |
| `story-gen.ts` | Story, custom story, and sequel generation prompts |
| `turn.ts` | Turn prompt composer |
| `craft.ts` | Scene, choice, and parameter movement guidance; `CONTENT_RULES` |
| `contract.ts` | Strict turn response shape contract |
| `archetypes.ts` | Parameter archetypes and behavior rules |
| `phases.ts` | Story phase calculation and phase instructions |
| `tone.ts` | Mood/tone blocks |

The proxy allowlist is based on canonical schema hashes, not top-level key
fingerprints. After changing `src/game/prompts/schemas.ts`, run:

```bash
npm run schema:hashes
```

Then copy changed hashes into `proxy/server.js` and update
[api-contract.md](docs/api-contract.md).

## Turn Mechanics

One turn has three steps:

1. The player chooses a normal option, types a custom action, or spends a
   special ability.
2. The engine applies authoritative parameter changes:
   - for normal offered choices, `choice.expectedChanges`
   - for kickoff, custom actions, and special abilities, `response.parameters`
3. The AI response supplies the next scene, visible consequences, and the next
   three choices.

If one parameter reaches its worst state, the story continues with that collapse
as pressure. If two or more parameters are at worst, the engine asks the AI for a
forced ending using `forceEnd='unrecoverable'`.

## Reliability Guardrails

The model is expected to return either:

- a continuing turn with three choices and `gameOver=false`
- an ending turn with no choices, `gameOver=true`, and `gameOverText`

The proxy still defends against drift:

- non-array `choices` are coerced to `[]`
- empty choices with `gameOver=false` trigger two retries
- if retries fail, the proxy coerces `gameOver=true`
- continuing choices with no negative expected cost trigger retries
- one 115 s deadline covers the provider call, the retries and the editor
  pass; a retry is skipped with under 20 s left, and an empty-choices turn
  the deadline cut short answers 504 instead of being coerced
- normal choices marked `isAbility=true` are treated as contract violations

These guardrails keep one bad provider response from freezing the game.

## Security Posture

Controls:

1. nginx rate limit per visitor
2. origin/referer check in the proxy
3. HMAC request signature when `API_SECRET` is configured
4. exact schema hash allowlist
5. schema-specific prompt/system-prompt input budgets before provider calls
6. in-memory per-client hourly/daily request and token budgets, IPv6 keyed on
   its /64 (`proxy/limits.js`)
7. an in-memory global daily token budget across all visitors
   (`PROXY_MAX_TOKENS_GLOBAL_PER_DAY`, default 5,000,000, an unverified
   starting value), which also counts the Estonian editor pass
8. provider API keys stored only in server-side environment; the Gemini key
   travels in the `x-goog-api-key` header, never in a URL
9. Gemini `safetySettings` at `BLOCK_ONLY_HIGH`, `maxOutputTokens` on every
   call, and blocked or truncated responses rejected with 502
   (`proxy/gemini-response.js`)
10. upstream provider error messages logged, never returned to the client

Limitations:

- The HMAC key reaches the browser (the web image's runtime `config.js`, or
  the build-time `VITE_API_SECRET`), so HMAC is a friction layer, not a true
  secret.
- Origin can be spoofed by a determined caller.
- Usage budgets are in-memory process counters, not durable billing controls.
  They are meant to cap repeated valid public calls between deploys. The hard
  ceiling on spend is the quota and budget alert set at the provider.
- Production sets every `PROXY_MAX_*` in khe-homelab's
  [`services/apps/games/docker-compose.yml`](https://github.com/khelias/khe-homelab/blob/main/services/apps/games/docker-compose.yml); the defaults in `proxy/server.js` apply only where one is unset.
- The acceptable threat model is "public game endpoint with bounded game-shaped
  calls", not "untrusted general-purpose AI gateway".

## Deployment

Both frontend and proxy ship from this repo, as two images built from the same
commit ([estate ADR-008](https://github.com/khelias/khe-architecture/blob/main/decisions/008-container-images.md)).

1. A push to `main` runs GitHub Actions CI, which builds, scans and
   publishes the web and proxy images to GHCR with `sha-` and `main` tags.
2. CI opens a pin PR in khe-homelab through the pin App, with auto-merge;
   khe-homelab holds the digest pins.
3. The merge deploys: the games nginx container passes `/adventure/` to the
   `adventure-web` container and `/adventure/api/` to the
   `adventure-proxy` container.

The homelab repository owns Docker Compose orchestration, the image pins, nginx
config, network wiring, and environment values. This repo owns the application, proxy code,
prompts, schemas, and documentation.

## Code Map

| Concern | Path |
|---|---|
| App shell and screen routing | `src/App.tsx` (renders the screen named by `screen` in `src/store/gameStore.ts`) |
| Setup UI | `src/components/SetupScreen.tsx` |
| Gameplay UI | `src/components/GameScreen.tsx` |
| Secrets UI | `src/components/SecretAssignmentScreen.tsx`, `src/components/GameOverScreen.tsx` |
| Client state | `src/store/gameStore.ts` |
| Game mechanics | `src/game/engine.ts`, `src/game/actions.ts`, `src/game/secrets.ts` |
| Prompt modules | `src/game/prompts/` |
| API client | `src/api/adventure.ts` |
| Provider proxy | `proxy/server.js`, `proxy/generation.js`, `proxy/limits.js`, `proxy/gemini-response.js` |
| Headless playtest | `scripts/playtest.ts` |

## Related Documents

- [API contract](docs/api-contract.md)
- [Model strategy](docs/model-strategy.md)
- [Prompt audit](docs/prompt-audit.md)
- [Game systems audit](docs/game-systems-audit.md)
