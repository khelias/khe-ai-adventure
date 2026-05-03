# khe-ai-adventure

Web-based party adventure game for 3-6 players. Pass-the-phone tabletop loop:
one shared device, AI narrates, group debates choices, engine applies state.
Live at games.khe.ee/adventure.

## Tech stack

Frontend (`src/`):

- React 19, TypeScript, Vite
- Tailwind CSS v4 (`@tailwindcss/vite`)
- Zustand for client state
- Playwright for UI smoke tests
- Node 24 (frontend tooling), `tsx` loader for tests

Proxy (`proxy/`, separate package.json):

- Node 22+, Express 5
- Anthropic SDK (Claude) + Gemini fetch adapter
- Default model: Gemini 2.5 Flash. Opt-in quality: Claude Sonnet 4.6.

## Commands

- `npm run dev` - frontend dev (proxies `/adventure/api/` to live by default)
- `npm run build` - `tsc -b && vite build`
- `npm run lint` - ESLint, type-aware rules
- `npm run test:unit` - node:test via tsx
- `npm run ui:smoke` - Playwright headless via Mock provider
- `npm run playtest -- --duration=Short --language=et` - prompt-quality runner
- `npm run proxy:smoke` - signed smoke against live proxy (needs API_SECRET)
- `npm run schema:hashes` - regenerate ALLOWED_SCHEMA_SHAPES hashes

## Layout

```
src/
  api/         live + mock providers (browser never calls AI directly)
  components/  8 screens (Setup, Role, Secret, Game, GameOver, ...)
  game/        engine, actions, secrets, transcript, types (mechanics)
  i18n/        et + en lang-packs
  store/       Zustand gameStore
proxy/         standalone Node Express, Dockerized for homelab VM
  server.js              schema guard, origin check, rate limit, editor routing
  et-style-guide.js      prompt for ET editor pass
docs/          ARCHITECTURE, api-contract, model-strategy, prompt-audit,
               ui-ux, game-systems-audit, 5 ADRs in decisions/
scripts/       playtest.ts, proxy-smoke.ts, schema-hashes.ts
tests/         ui-smoke.spec.ts, unit/game.test.ts
```

## Architecture invariants (HARD)

1. **Browser never calls AI directly.** All generation goes through `proxy/`.
2. **Exact schema hash allowlist** in `proxy/server.js` (`ALLOWED_SCHEMA_SHAPES`).
   When a request shape changes, update both sides in the SAME commit and
   run `npm run schema:hashes` to regenerate the proxy allowlist.
3. **Origin check** in proxy: `Origin` or `Referer` must match `games.khe.ee`
   or a localhost dev origin. Otherwise 403.
4. **Real per-visitor rate limit** via `$http_cf_connecting_ip` in nginx
   (configured in khe-homelab compose). Without this, all visitors share one
   counter behind cloudflared's socket.
5. **HMAC secrets** must match between frontend (`VITE_API_SECRET`) and proxy
   (`API_SECRET`). Smoke tests fetch from `services/apps/games/.env` on VM.

## Product invariants (from ROADMAP)

- One shared device (pass-the-phone, no live multiplayer)
- Fast setup (~1 min)
- Nobody sits out (no mechanics that remove players from the table)
- Choices must cost something (no pure-upside continuing options)
- Parameters are group state, not personal meters
- Secrets stay private until reveal
- Cost matters (cheaper model first; expensive opt-in only when measured)

## Estonian editor pass

`/generate` requests with `language='et'` route `scene` and `gameOverText`
through Gemini Flash with a separate editorial system prompt
(`proxy/et-style-guide.js`). 25s shared budget. Failures fall back to
unedited text. Total response stays under nginx 120s ceiling.

## Quality gate (before shipping prompt, contract, or proxy changes)

```bash
npm run lint
npm run build
npm run test:unit
npm run ui:smoke
npm run schema:hashes
node --check proxy/server.js
```

For prompt or model changes also run a measured playtest:

```bash
npm run playtest -- --genre=Thriller --duration=Short --language=et
```

Judge model changes by transcripts and proxy telemetry, not one attractive run.

## Deployment

GH Actions self-hosted runner on homelab VM
(`/home/khe/actions-runner-adventure`). Push to main:

1. Pinned Node 24, `npm ci`
2. Quality gate (above)
3. Static assets -> `/srv/data/games/adventure/app/`
4. Build proxy image `games-adventure-proxy:latest` from `proxy/Dockerfile`
5. `docker compose up -d --force-recreate adventure-proxy` on VM

Infrastructure: khelias/khe-homelab. This repo owns app, proxy, prompts,
contracts, product docs.
