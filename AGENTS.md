# khe-ai-adventure

Pass-the-phone party adventure for 3-6 adult players (18+): one shared
device, the AI narrates, the group debates, the engine applies state. Live at
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
  fetch adapter, shipped as a multi-stage `node:24-alpine` image whose runtime
  stage has no npm. Default and allowed models are at the top of
  `proxy/server.js`; the reasoning is in `docs/model-strategy.md`.
- Web image (`web/`, build context the repo root): the Vite build served by
  `nginx-unprivileged` on 8080 under `/adventure/`. At start,
  `web/40-adventure-config.sh` writes `API_SECRET` into `config.js`, which
  `index.html` loads before the bundle; `public/config.js` is the empty
  placeholder for dev and `ui:smoke`.
- Fonts: Fraunces and Inter, latin and latin-ext subsets, self-hosted from
  `src/assets/fonts/` (`@font-face` at the top of `src/index.css`, OFL in
  `public/fonts/OFL.txt`). No request goes to Google. `vite build` writes the
  bundled dependencies' licenses to `dist/third-party-licenses.md`.

## Commands

- `npm run dev` - frontend dev server; proxies `/adventure/api/` to live
- `npm run build` - `tsc -b && vite build`
- `npm run lint` - ESLint with type-aware rules
- `npm run test:unit` - node:test via tsx
- `npm run ui:smoke` - headless Playwright against the Mock provider;
  `PLAYWRIGHT_BASE_URL` reuses a running server instead of starting one,
  `PLAYWRIGHT_BROWSER_CHANNEL` picks a local browser over bundled Chromium
- `npm run playtest -- --genre=Thriller --duration=Short --language=et` -
  prompt-quality run, transcripts into `playtest-transcripts/`, rubric in
  `docs/prompt-audit.md`
- `npm run eval` - deterministic checks over those transcripts, report only;
  `-- --dir=<path>` reads another directory, `-- --threshold=<ratio>` and
  `-- --threshold=<check>=<ratio>` (repeatable, overrides the default) gate
  it. Exit 0 pass or report-only, 1 a check below its bound, a named check
  without samples or no checkable turns, 2 usage or input error. API-error
  turns are excluded from every check
- `npm run eval:gate` - `eval` with the committed bounds
- `npm run proxy:smoke` - signed smoke against the live proxy
- `npm run schema:hashes` - regenerate `ALLOWED_SCHEMA_HASHES`

`proxy:smoke` needs `API_SECRET`, and `npm run dev` against the live proxy
needs the same value as `VITE_API_SECRET`. It lives in
`services/apps/games/.env` on the VM; the operator fetches it with
`ssh khe@docker-vm 'cd /home/khe/homelab/services/apps/games && set -a && . ./.env && printf %s "$API_SECRET"'`
into the variable, never into a file or the conversation.

CI runs lint, build, test:unit, ui:smoke, schema:hashes and `node --check`
on `proxy/server.js`, `proxy/limits.js` and `proxy/gemini-response.js`. CI's
`Images` job also builds both images and scans them with Grype
(`.grype.yaml`: HIGH or CRITICAL with a fix fails; an ignore rule's reason
starts with `until YYYY-MM-DD:` and fails CI once past).
Local image check: `docker build -f web/Dockerfile .` and `docker build ./proxy`.

Prompt or model changes also get a playtest; judge them by transcripts and
proxy telemetry, not one attractive run.

`ui:smoke` baselines live in `tests/__screenshots__/{darwin,linux}`. CI
compares the linux set, so regenerate it inside
`mcr.microsoft.com/playwright:v<version>-noble` matching the installed
`@playwright/test`, with `npx playwright test tests/ui-smoke.spec.ts
--update-snapshots`. `mobile-game-over.png` renders slightly differently
from run to run, so regenerating it only adds noise; leave it unless the
screen changed.

## Layout

```
src/
  api/         live + mock providers, runtime config
  components/  the screens (Setup, Role, Secret, Game, GameOver, ...)
  game/        engine, actions, secrets, transcript, types
  i18n/        et + en language packs
  store/       Zustand gameStore
proxy/
  server.js        schema guard, origin check, provider calls, editor routing
  limits.js        per-client and global usage budgets, IPv6 /64 client key
  gemini-response.js  Gemini response parsing: safety blocks, truncation
  et-style-guide.js  system prompt for the Estonian editor pass
  *.d.ts           types for the unit tests; not shipped in the image
web/           Dockerfile, nginx.conf, config.js entrypoint of the web image
docs/          ARCHITECTURE, api-contract, model-strategy, prompt-audit,
               ui-ux, game-systems-audit; ADRs in decisions/
scripts/       playtest.ts, eval/{check,lib}.ts, proxy-smoke.ts, schema-hashes.ts
tests/         ui-smoke.spec.ts, unit/{game,eval,runtime-config,
               proxy-limits,gemini-response}.test.ts
```

## Architecture invariants

1. **The browser never calls an AI provider.** All generation goes through
   `proxy/`.
2. **Exact schema hash allowlist** (`ALLOWED_SCHEMA_HASHES` in
   `proxy/server.js`). A changed request shape updates both sides in the same
   commit, with `npm run schema:hashes` regenerating the allowlist.
3. **Origin check:** `Origin` or `Referer` must match `games.khe.ee` or a
   localhost dev origin, otherwise 403.
4. **Per-visitor rate limit** keys on `$http_cf_connecting_ip` in the nginx
   config in `khe-homelab`. Without it every visitor shares one counter
   behind cloudflared.
5. **HMAC secret:** the frontend's key must equal `API_SECRET` (proxy). It
   comes from `window.__ADVENTURE_CONFIG__.apiSecret` (the web image's
   runtime `config.js`), falling back to the build-time `VITE_API_SECRET`
   (`src/api/runtimeConfig.ts`), which only `npm run dev` uses. The web
   container gets `API_SECRET` from `services/apps/games/.env` on the VM, the
   same value the proxy reads.
6. **Rate and token budgets are security controls.** `PROXY_MAX_*` bounds
   the abuse ceiling of the client-supplied system prompt
   ([ADR 0006](docs/decisions/0006-client-supplied-system-prompt.md));
   raising them widens it. Per client (IPv6 keyed on its /64):
   `PROXY_MAX_REQUESTS_PER_HOUR` 80, `PROXY_MAX_TOKENS_PER_HOUR` 300000,
   `PROXY_MAX_TOKENS_PER_DAY` 1200000. Across all visitors:
   `PROXY_MAX_TOKENS_GLOBAL_PER_DAY` 5000000, an unverified starting value;
   the provider-side quota is the real ceiling. The khe-homelab compose passes
   no `PROXY_MAX_*` variables, so the defaults in `proxy/server.js` are what
   runs in production. CodeQL is not required here, and its one
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

## Audience and content

- **18+.** The Gemini API terms require adult users. The last setup step
  asks for a self-declared confirmation that every player is 18 or older
  (`Settings.adultsConfirmed`, kept in localStorage as
  `adventureAdultsConfirmed`); the start button and `generateStories` refuse
  without it. The footer carries the AI disclosure, the group, place and
  detail fields say their text goes to the AI provider, and a copied story
  ends with an AI-generated credit line. A self-declaration is not age
  verification, and the launcher sits next to a kids' game, so the terms'
  "likely to be accessed by" minors wording stays a residual risk.
- **Content rules** are `CONTENT_RULES` in `src/game/prompts/craft.ts`, part of
  the turn system prompt and all three story prompts. Gemini calls also send
  `safetySettings` at `BLOCK_ONLY_HIGH`, and a blocked or truncated response
  returns 502 instead of partial text (`proxy/gemini-response.js`).
- Upstream provider error messages go only to the log; the client gets
  `{ error: 'Upstream error' }`. The proxy's own 400, 413 and 429 errors keep
  their detailed body.

## Estonian editor pass

Estonian (`language='et'`) player-facing text (scene, choices, story and
sequel texts) goes through a second call to `GEMINI_MODEL` with the editorial
prompt in `proxy/et-style-guide.js` (`estonianEditorPass`,
`estonianStructuredTextEditorPass`), inside a 25 s budget
(`EDITOR_TOTAL_BUDGET_MS`). A failure falls back to the unedited
text; the whole response stays under nginx's 120 s `proxy_read_timeout`.
It runs with thinking off (or at the model's lowest level), is capped at 40
tasks, is skipped when the global day budget has no room, and its actual
tokens count against the global budget only. The `proxy ok` log line reports
them as `editor_tokens=<n>`.

## Deployment

CI's `publish` job, on push to main after `App quality` and `Images`, pushes
`ghcr.io/khelias/khe-ai-adventure-proxy` and `-web` as `sha-<commit>` with
SBOM, provenance and an attestation, then moves both `main` tags in one step
(khe-meta ADR-008). Nothing in this repo touches the VM.

khe-homelab pins both images as `:main@sha256:<digest>` in
`services/apps/games/docker-compose.yml`. Renovate there sees the new `main`
digests and opens one grouped PR that automerges, and the merge is the
deploy. So a push here goes live hours later, not at once.

Rollback is a khe-homelab change: pin both images to the same
`sha-<full commit>@sha256:<digest>` of a known good commit, never one image
alone (invariant 2). The procedure is in khe-homelab's `AGENTS.md`.
