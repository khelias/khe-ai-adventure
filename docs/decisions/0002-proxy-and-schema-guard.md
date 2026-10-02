# ADR-0002: Proxy And Schema Guard

- **Status:** Accepted (2026-04-25)

## Context

The browser cannot safely hold provider API keys. It also cannot be trusted to
make arbitrary provider requests, because a public endpoint can otherwise become
a general-purpose AI gateway.

At the same time, the game needs local development against the same request path
as production and needs enough telemetry to evaluate model cost and quality.

## Decision

Route all AI calls through `adventure-proxy`.

The proxy owns:

- provider API keys
- provider adapters
- origin/referer checks
- HMAC request verification when `API_SECRET` is configured
- exact canonical schema hash allowlists
- retry/coercion guardrails for malformed turn responses
- Estonian editor pass
- provider/model/token/retry telemetry

Remove generic passthrough endpoints. The only live generation surface is
`POST /generate` with one of the canonical game schemas.

## Consequences

Provider credentials stay server-side.

The public API is bounded to game-shaped requests rather than arbitrary prompts
and schemas.

Schema changes now require an explicit coupling step:

1. change `src/game/prompts/schemas.ts`
2. run `npm run schema:hashes`
3. copy changed hashes into `proxy/server.js`
4. update `docs/api-contract.md`

HMAC is documented as a friction layer, not a true browser-side secret, because
`VITE_API_SECRET` ships in the frontend bundle.

Update 2026-10-02: production no longer bakes the key into the bundle. The web
image writes it into a runtime `config.js` (`window.__ADVENTURE_CONFIG__`,
`web/40-adventure-config.sh`) and the frontend reads that first
(`src/api/runtimeConfig.ts`); `VITE_API_SECRET` is only the `npm run dev`
fallback. The key is still visible to any browser, so HMAC stays friction.

If more providers, tools, or caching modes are added, `proxy/server.js` should be
split into smaller provider, guard, editor, and telemetry modules.
