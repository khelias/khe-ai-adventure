# API contract

Last reviewed: 2026-04-25

The browser sends every AI request through `POST /generate` on the
adventure proxy. The frontend never calls provider APIs directly.

## Request shape

```ts
{
  prompt: string
  schema: JsonSchema
  provider?: 'gemini' | 'claude'
  model?: string
  systemPrompt?: string
  language?: 'et' | 'en'
}
```

- `prompt`: dynamic user message.
- `schema`: one of the canonical schemas exported from
  `src/game/prompts/schemas.ts`.
- `provider`: defaults to `gemini`; `claude` is an opt-in quality mode.
- `model`: optional override of the provider's configured model, for
  side-by-side playtests. Checked against `MODEL_ALLOWLIST` in
  `proxy/server.js`; anything else is a 400 listing the allowed values. The
  configured default (`GEMINI_MODEL` / `CLAUDE_MODEL`) is always allowed.
  The Estonian editor pass always runs on `GEMINI_MODEL` and ignores this.
- `systemPrompt`: accepted only for `turnSchema` requests. It is used for turn
  prompts and Claude tool calls.
- `language`: enables the Estonian editor pass when set to `et`.

Requests may also carry `x-adventure-signature`, an HMAC over the raw body.
This is not a true client secret because `VITE_API_SECRET` ships in the
browser bundle, but it blocks casual unsigned calls and keeps live and local
proxy requests aligned.

## Proxy guards

The proxy currently applies these checks before provider calls:

1. Origin or referer must match the deployed app or localhost dev origins.
2. If `API_SECRET` is set, the HMAC signature must match.
3. `schema` must match one of the exact canonical schema hashes below.
4. `provider` must be `gemini` or `claude`.
5. `model`, when present, must be on the allowlist for that provider.
6. `prompt` and `systemPrompt` must fit the schema-specific input budget.
7. The caller must fit the in-memory per-client request/token budget.

## Input and usage budgets

The proxy rejects oversized game-shaped requests before provider calls. Token
counts are approximated as 4 characters per token for preflight checks; provider
telemetry replaces the estimate after successful calls when available.

| Schema | Prompt chars | System prompt chars | Total chars | Approx tokens |
|---|---:|---:|---:|---:|
| `storyGenerationSchema` | 14,000 | 0 | 14,000 | 3,500 |
| `customStorySchema` | 16,000 | 0 | 16,000 | 4,000 |
| `sequelSchema` | 18,000 | 0 | 18,000 | 4,500 |
| `turnSchema` | 18,000 | 24,000 | 38,000 | 9,500 |

Per-client usage is keyed from `CF-Connecting-IP`, then `X-Forwarded-For`,
then `X-Real-IP`, then the socket address. Defaults:

- 80 accepted provider attempts per hour
- 300,000 approximate/actual provider tokens per hour
- 1,200,000 approximate/actual provider tokens per day

These counters are an in-memory cost backstop. They reset when the proxy
restarts and can be tuned with `PROXY_MAX_REQUESTS_PER_HOUR`,
`PROXY_MAX_TOKENS_PER_HOUR`, and `PROXY_MAX_TOKENS_PER_DAY`.

The legacy `/gemini` passthrough endpoint has been removed. It bypassed the
HMAC and exact schema guard, so old cached frontends must refresh to use
`/generate`.

## Allowed schema hashes

Run `npm run schema:hashes` after editing `src/game/prompts/schemas.ts`, then
copy the new values into `proxy/server.js`.

| Schema | Hash |
|---|---|
| `storyGenerationSchema` | `b03076dbb8868948ccd3eb5a576b67806a7fd415c2634ae985ed1639e1260977` |
| `customStorySchema` | `276f490cdb0c5e913f93a025004bb353d078643ec71b60e6b92317230f2e30bb` |
| `sequelSchema` | `668239c498ac09d383b9609829a2bb3bb4727a64de379e9a2e2c1c9f0d3ad2cd` |
| `turnSchema` | `ecef588fd5abf60f990d3e092b13351f5a59a6353db967569e514354c04ea53a` |

## Authorship boundaries

AI-authored fields:

- `Story.title`, `Story.summary`
- `Story.roles[].name`
- `Story.roles[].description`
- `Story.roles[].ability`
- `Story.roles[].abilityParameter`
- `Story.parameters[].name`
- `Story.parameters[].states`
- `Story.parameters[].archetype`
- `Sequel.newAbilities[]`
- `Sequel.newAbilityParameters[]`
- `Sequel.newParameters[]`
- `TurnResponse.scene`
- `TurnResponse.parameters`
- `TurnResponse.choices[].text`
- `TurnResponse.choices[].isAbility` for normal choices, which must be `false`
- `TurnResponse.choices[].actor`
- `TurnResponse.choices[].target`
- `TurnResponse.choices[].expectedChanges`
- `TurnResponse.consequences`
- `TurnResponse.gameOver`
- `TurnResponse.gameOverText`

App-owned fields:

- `Role.id`
- `Role.used`
- `Parameter.currentStateIndex`
- `Parameter.justMoved`
- `Parameter.justBroke`
- `Secret.*`
- `Choice.isAbility` for player-triggered ability choices
- authoritative parameter changes after a normal offered choice

Normal AI-offered choices must have `isAbility: false`. Special abilities are
spent from the separate player action, and the app creates that choice with
`isAbility: true`, `actor`, and empty `expectedChanges`.

## Turn consequences

`TurnResponse.consequences` is required. It contains one short in-world text
for each parameter that moved. The app uses it for the parameter event toast.
If the model omits a consequence for a changed parameter, the frontend falls
back to a generic localized state-change line.
