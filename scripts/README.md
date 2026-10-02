# scripts/playtest.ts

Headless game runner. Simulates what the frontend does — generates a story, plays turns against the proxy API, writes a Markdown transcript. Use it to review AI quality after prompt or engine changes without clicking through the UI.

The runner imports the real `src/game/prompts/` modules and `src/game/engine.ts` directly, so any change there is automatically reflected in the next playtest. No duplication.

## Setup

Install repo dependencies once:

```bash
npm install
```

## Running

```bash
# Default: Zombies / Medium / Estonian / Gemini / balanced strategy
npx tsx scripts/playtest.ts

# Same runner via package script
npm run playtest -- --genre=Thriller --duration=Short --language=et

# Push through to the endgame even if the engine tries to force-end early
npx tsx scripts/playtest.ts --skip-parametric-end

# Short fantasy in English, picking the first choice every turn
npx tsx scripts/playtest.ts --genre=Fantasy --duration=Short --language=en --strategy=first

# Against a local dev server (vite dev + proxy)
npx tsx scripts/playtest.ts --endpoint=http://localhost:5173/adventure/api/generate
```

Transcripts land in `playtest-transcripts/<timestamp>__<genre>-<duration>-<strategy>.md` at the repo root. Add that directory to `.gitignore` (transcripts are large and one-off — commit a specific file manually if you want to preserve a canonical sample).

## Options

| Flag | Default | Notes |
|---|---|---|
| `--genre` | `Zombies` | `Zombies` \| `Fantasy` \| `Sci-Fi` \| `Thriller` \| `Cyberpunk` \| `Post-Apocalyptic` |
| `--duration` | `Medium` | `Short`(8) \| `Medium`(15) \| `Long`(20) turns |
| `--players` | `3` | Role count |
| `--language` | `et` | `et` \| `en` |
| `--provider` | `gemini` | `gemini` \| `claude` — which model handles story generation and turns |
| `--model` | proxy default | Overrides the provider's model for this run; must be on the proxy's `MODEL_ALLOWLIST`. Recorded in the transcript header. |
| `--strategy` | `balanced` | See below |
| `--endpoint` | `https://games.khe.ee/adventure/api/generate` | Override for local dev |
| `--location` | empty | Group context: physical setting |
| `--players-desc` | empty | Group context: who is at the table |
| `--vibe` | empty | Group context: tone steer |
| `--inside-joke` | empty | Group context: easter egg |
| `--skip-parametric-end` | off | Continue past the engine's auto-end when multiple parameters collapse. Useful for testing late-phase prompts. |
| `--out` | auto | Override transcript path |

## Strategies

Decides how the bot picks one of the three choices each turn. Different strategies surface different failure modes.

- **`first`** — always choice 0. Deterministic. Good for regression-testing: same story seed + same strategy should produce broadly similar arcs. Reveals what the AI puts first when it's uncertain.
- **`random`** — uniform random. Baseline variance. Useful to run many short games and see whether any path produces a watchable story.
- **`balanced`** (default) — weighted by criticality. Protects the parameter closest to worst state. Approximates a cautious player.
- **`protect-threat`** — legacy strategy name; protects the last generated parameter. Useful when you want a deterministic run that favors one tracked pressure.

## What the transcript shows

Per turn:
- Phase (setup / inciting / rising / climax / resolution)
- Current parameter states
- Previous choice text
- AI model + latency
- Scene prose
- Declared parameter deltas
- All three choices with their promised costs
- Strategy's pick

At end: reason (narrative / parametric / maxTurns / api-error) and final parameter states.
Story setup also logs each role's one-time ability and its generated
parameter anchor, so ability drift is visible in transcripts.

## Playwright UI smoke

The UI smoke test is separate from the transcript runner:

```bash
npm run ui:smoke
```

It drives the real React app through the browser with the in-app `Mock`
provider, covers the long six-player mobile flow, and compares visual baselines
in `tests/__screenshots__/{platform}`. By default it uses Playwright's bundled
Chromium; set `PLAYWRIGHT_BROWSER_CHANNEL=chrome` only when deliberately
validating a local Chrome install. To test an existing dev server, set
`PLAYWRIGHT_BASE_URL`, for example:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5182 npm run ui:smoke
```

Refresh baselines deliberately after intended UI changes:

```bash
PLAYWRIGHT_BASE_URL=http://127.0.0.1:5182 npm run ui:smoke -- --update-snapshots
```

## Cost

Each turn is one Gemini or Claude API call. Gemini is the product default; Claude is for opt-in quality checks. Ballpark:

- Short (8 turns) on Gemini Flash is usually cents, depending on retries/editor passes.
- Claude Sonnet 4.6 is roughly 10× more expensive and should be used deliberately.
- See `docs/model-strategy.md` for the model decision record.

## When to run

- After editing `src/game/prompts/` — sanity-check a full game
- After editing `src/game/engine.ts` — confirm mechanics still work
- Before committing a prompt PR — attach a transcript as evidence
- Periodically to catch regressions from model-side changes (Anthropic/Google update their models; output drifts)

## Known limitations

- The bot reads `expectedChanges` numerics, not scene text. A real player weighs narrative pull too. Use `random` strategy occasionally to get choices a human might make for thematic reasons.
- No retry on transient API errors. A single 503 aborts the run.
- Context block (`location`, `playersDesc`, `vibe`, `insideJoke`) is always empty. Add a `--context` flag if you need to test that path.
- Story generation still returns a `stories` array for UI compatibility, but the prompt asks for one story. The runner always picks story 0.
