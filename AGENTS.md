# khe-ai-adventure

Pass-the-phone party adventure for 3-6 players: one shared device, the AI
narrates, the group debates, the engine applies state. Live at
games.khe.ee/adventure. This repo owns the app, proxy, prompts, contracts and
product docs; infrastructure is in `khe-homelab`.

## Stack

- Frontend (`src/`): React 19, Vite 8, Tailwind v4 (`@tailwindcss/vite`),
  Zustand 5, Playwright smoke tests, `tsx` for unit tests. Node 24.
- TypeScript is two packages on purpose: `@typescript/native` (TS 7)
  supplies `tsc`, and `typescript` is aliased to `@typescript/typescript6`
  because typescript-eslint does not support TS 7 yet. A plain Renovate bump
  of `typescript` to 7 breaks lint.
- Proxy (`proxy/`, own `package.json`): Express 5, Anthropic SDK and a Gemini
  fetch adapter, shipped as a `node:24-alpine` image. Default and allowed
  models are at the top of `proxy/server.js`; the reasoning is in
  `docs/model-strategy.md`.

## Commands

- `npm run dev` - frontend dev server; proxies `/adventure/api/` to live
- `npm run build` - `tsc -b && vite build`
- `npm run lint` - ESLint with type-aware rules
- `npm run test:unit` - node:test via tsx
- `npm run ui:smoke` - headless Playwright against the Mock provider
- `npm run playtest -- --genre=Thriller --duration=Short --language=et` -
  prompt-quality run, transcripts into `playtest-transcripts/`
- `npm run eval` - deterministic checks over those transcripts
- `npm run proxy:smoke` - signed smoke against the live proxy (needs
  `API_SECRET`)
- `npm run schema:hashes` - regenerate `ALLOWED_SCHEMA_SHAPES`

CI and deploy run lint, build, test:unit, ui:smoke, schema:hashes and
`node --check proxy/server.js`. Prompt or model changes also get a playtest;
judge them by transcripts and proxy telemetry, not one attractive run.

## Layout

```
src/
  api/         live + mock providers
  components/  the screens (Setup, Role, Secret, Game, GameOver, ...)
  game/        engine, actions, secrets, transcript, types
  i18n/        et + en language packs
  store/       Zustand gameStore
proxy/
  server.js        schema guard, origin check, rate limit, editor routing
  et-style-guide.js  system prompt for the Estonian editor pass
docs/          ARCHITECTURE, api-contract, model-strategy, prompt-audit,
               ui-ux, game-systems-audit; ADRs in decisions/
scripts/       playtest.ts, eval/check.ts, proxy-smoke.ts, schema-hashes.ts
tests/         ui-smoke.spec.ts, unit/game.test.ts
```

## Architecture invariants

1. **The browser never calls an AI provider.** All generation goes through
   `proxy/`.
2. **Exact schema hash allowlist** (`ALLOWED_SCHEMA_SHAPES` in
   `proxy/server.js`). A changed request shape updates both sides in the same
   commit, with `npm run schema:hashes` regenerating the allowlist.
3. **Origin check:** `Origin` or `Referer` must match `games.khe.ee` or a
   localhost dev origin, otherwise 403.
4. **Per-visitor rate limit** keys on `$http_cf_connecting_ip` in the nginx
   config in `khe-homelab`. Without it every visitor shares one counter
   behind cloudflared.
5. **HMAC secret** `VITE_API_SECRET` (frontend) must equal `API_SECRET`
   (proxy). Deploy reads it from `services/apps/games/.env` on the VM.
6. **Rate and token budgets are security controls.** `PROXY_MAX_*` bounds
   the abuse ceiling of the client-supplied system prompt
   ([ADR 0006](docs/decisions/0006-client-supplied-system-prompt.md));
   raising them widens it. CodeQL is not required here, and its one
   `js/system-prompt-injection` alert on `proxy/server.js` is knowingly open
   per ADR 0006. A second alert is the signal worth acting on.

## Product invariants

From `ROADMAP.md`:

- One shared device, no live multiplayer; setup in about a minute.
- Nobody sits out: no mechanic removes a player from the table.
- Choices cost something. `expectedChanges[].change = -1` moves a parameter
  toward its worst state and is the cost direction, `+1` improves it
  (`applyParameterChanges` in `src/game/engine.ts`).
- Parameters are group state, not personal meters.
- Secrets stay private until the reveal.
- Cheaper model first; an expensive one is opt-in, and only when measured.

## Estonian editor pass

Estonian (`language='et'`) player-facing text (scene, choices, story and
sequel texts) goes through a second call to `GEMINI_MODEL` with the editorial
prompt in `proxy/et-style-guide.js` (`estonianEditorPass`,
`estonianStructuredTextEditorPass`), inside a 25 s budget
(`EDITOR_TOTAL_BUDGET_MS`). A failure falls back to the unedited
text; the whole response stays under nginx's 120 s `proxy_read_timeout`.

## Deployment

Push to main runs `deploy.yml` on the self-hosted homelab runner: the gate
above, static assets to `/srv/data/games/adventure/app/`, then
`docker build -t games-adventure-proxy:latest ./proxy` and a
`--force-recreate` of `adventure-proxy` in the homelab games stack.
