# Roadmap

Last reviewed: 2026-09-25

AI Adventure Engine is a 20-40 minute pass-the-phone adventure game for a small
group using one shared device. The next product decisions should come from real
table play, not from adding more mechanics in isolation.

## Current State

Shipped:

- four-step setup flow with a genre/length showcase first step
- generated roles, parameters, one-time special abilities, and ability anchors
- separate special ability action outside the three normal choices
- shared parameter board with event feedback
- private secret goals with pass-the-phone reveal
- AI-narrated parameter consequences and endings
- Gemini 2.5 Flash default model with Estonian editor pass
- Claude Sonnet 4.6 hidden quality mode
- exact schema hash guard in the proxy
- headless playtest runner, local started-game transcripts, and transcript export

The live architecture is described in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).
Screen-level UX principles are described in [docs/ui-ux.md](docs/ui-ux.md).
Hardcoded game-system risks are tracked in
[docs/game-systems-audit.md](docs/game-systems-audit.md).

## Product Invariants

- **One shared device**: the game remains a pass-the-phone tabletop experience.
- **Fast setup**: a playable game should start in about a minute.
- **Nobody sits out**: future injury/death mechanics must preserve participation.
- **Choices must cost something**: no continuing option should be pure upside.
- **Parameters are group state**: they describe the whole story situation, not one
  player's private meter.
- **Secrets stay private until reveal**: the AI does not need to know secret goals
  to create social tension.
- **Cost matters**: a more expensive model is acceptable only when measurement
  shows the cheaper default breaks gameplay.

## Near-Term Gates

### 1. Full Estonian Table Playtest

Run one complete short game in Estonian with 3-4 people.

Watch for:

- Do players argue about choices or quietly optimize parameter math?
- Does the separate ability button create a memorable moment?
- Are the parameter names and states understandable without explanation?
- Does secret reveal create a good ending discussion?
- Does Estonian prose sound native enough after the editor pass?
- Does anyone want another round?

Use the rubric in [docs/prompt-audit.md](docs/prompt-audit.md).

### 2. Model Measurement Pass

Before changing model defaults, run a measured short-game matrix over the
models in the proxy's `MODEL_ALLOWLIST` (`proxy/server.js`), currently:

- `gemini-2.5-flash`
- `gemini-3.5-flash-lite`
- `gemini-3.8-flash`
- `claude-sonnet-5`
- `claude-sonnet-4-6`

Compare:

- first story latency
- turn latency
- schema retries
- editor-pass time
- thinking tokens
- cache hits
- total estimated cost
- transcript quality from the prompt rubric

Model policy lives in [docs/model-strategy.md](docs/model-strategy.md).

### 3. Prompt Pruning Pass

After playtest evidence, remove prompt duplication that does not improve
behavior. Do not prune purely because the prompt feels long; prune when
transcripts show the rule is ineffective or redundant.

## Candidate Work

### UX Polish

- Rework parameter board spacing for small screens.
- Improve parameter event transitions so state changes feel like story events,
  not score updates.
- Tighten game-over summary so secrets, winners, and final parameters read as
  one conclusion.
- Validate the new setup showcase with real users before adding more visual
  complexity.

### Gameplay

- Add schema-backed parameter starting baselines so some pressures can be built
  up without breaking best-to-worst semantics or secret fairness.
- Add stronger climax planning: generated destination, hidden truth, or final
  confrontation seed that the turn prompt can foreshadow.
- Improve special ability payoff if playtests show abilities still feel generic.
- Review secret archetype distribution after several transcripts.
- Consider "wounded" or "ghost" states only if character loss becomes narratively
  useful and does not remove a player from the table.

### Tooling And Evaluation

- Add `--context` support to `scripts/playtest.ts`.
- Add transcript scoring helpers for repeated verbs, repeated choice shapes, and
  ability-parameter alignment.
- Store a small set of canonical transcripts for regression comparison.
- Add model matrix scripts so candidate comparisons are repeatable.

#### Eval pipeline (incremental)

Started with `scripts/eval/check.ts` (deterministic rule-based checks over
`playtest-transcripts/`). Baseline finding (2026-09-25, 23 local
transcripts, 106 turns after excluding 2 API-error turns): `choice_has_cost`
passes only 77% (82/106), indicating real leakage of pure-upside choices to
players despite proxy retry logic.

Next steps, ordered by pedagogical value and effort:

1. **LLM-as-judge layer** — add one model-graded rubric (e.g. Estonian
   prose quality, 1-5 + reasoning) over the same transcript dataset.
   Surfaces judge-prompt design, structured output via tool_use, and
   judge consistency (run twice, compare).
2. **Pass/fail gating** — done: `--threshold` bounds, exit 1 below a
   bound, `--dir` to gate one fresh batch, `npm run eval:gate` with the
   committed bounds (0.95, `choice_has_cost` 0.75, a ratchet just under the
   baseline). CI runs the gate logic through unit tests over synthetic
   transcripts; the transcripts themselves are gitignored.
3. **CI integration** — GitHub Actions workflow generates fresh
   transcripts (`npm run playtest`) on every PR that touches prompts,
   proxy, or schema, gates that batch with `--dir`, and comments results.
   A committed snapshot would not do: its numbers only move when the checker
   does, and real transcripts carry group-context strings. Open constraints:
   `API_SECRET` as an Actions secret, not available to fork PRs; the live
   proxy runs main's `server.js` and schema allowlist, so a PR that changes a
   schema shape is rejected and proxy retry changes are not exercised
   (running the PR's `proxy/` in the job with a Gemini key avoids both); one
   Short game is 8 turns, too few samples for a 0.75 bound, so several runs
   per PR; token cost and minutes.
4. **Production sampling** — pull a window of real scenes from proxy
   logs, run the same checks. Catches model drift that offline regression
   against fixed transcripts cannot.
5. **Reference-based eval** (last) — human-annotated golden set for the
   rubrics where ground truth is meaningful. Highest cost, highest signal.

### Infrastructure

- Decide whether explicit Gemini context caching is worth the lifecycle
  complexity after telemetry confirms repeated cacheable prompt prefixes.
- Add edge abuse controls only if rate limits and schema guards prove
  insufficient.
- Keep local model support out of the live path until latency, Estonian quality,
  and structured-output reliability are competitive.

## Ambitions

Long-horizon directions, not scheduled work. Each one names the asset it builds
on, a first step that produces a number, and the gate it waits for. None of them
may bend the Product Invariants; the ones that touch the Out Of Scope list are
marked as later product directions. The benchmark is the backbone: the local
model direction reuses it, and it gives the Estonian quality criterion in the
Definition Of "Good Enough" a measurement instead of a feeling.

### 1. Public Estonian Narration Benchmark

- **What:** a published, repeatable comparison of how well language models
  write Estonian narrative prose: grammar, word order, register and
  translationese, alongside whether the output stays playable (valid schema,
  three costed choices). The harness lives in this repo; results are a
  versioned page with the prompt set, the scores and the date.
- **Builds on:** the word-order and grammar rubric in `proxy/et-style-guide.js`
  (sourced from EKK 2007), the "Estonian quality" row of the rubric in
  [docs/prompt-audit.md](docs/prompt-audit.md), the deterministic checks and
  gate in `scripts/eval/`, `scripts/playtest.ts --model` against the proxy's
  `MODEL_ALLOWLIST`, and steps 1 (LLM judge) and 5 (human golden set) of the
  eval pipeline above, which are exactly the parts a benchmark needs. No public
  benchmark of this kind for Estonian narrative text is known to us
  (unverified; check before publishing the claim).
- **Who would use it:** Estonian developers choosing a model for
  Estonian-facing product text, language-technology people who want a
  narrative-register data point next to translation benchmarks, and this repo
  itself, since it answers the model measurement pass with evidence.
- **First published result:** the models already on the allowlist, run over a
  fixed synthetic prompt set, scored on raw output and on editor-pass output.
  The headline question is one this product already has: does the Gemini
  editor pass make a cheap model read as well as a premium one?
- **First measurable step:** keep the pre-editor text. Today the editor pass
  overwrites each field in place and the proxy logs only `editor=<ms>`, so how
  much the editor changed is not recorded anywhere. Recording both versions
  gives a per-model edit ratio, a cheap first signal of how much correcting the
  raw Estonian needed.
- **Waits for:** the LLM-judge step and a small human-rated sample to calibrate
  it against native readers. The prompt set must be synthetic and committed:
  real transcripts are gitignored and carry player-typed group context.
- **Main risk or cost:** judge bias (a model grading its own family), the
  time native raters cost, and staleness, since model lineups change faster
  than a hand-run benchmark. The rerun has to be one command, and the Gemini
  Batch API noted in [docs/model-strategy.md](docs/model-strategy.md) is the
  cheap path for offline runs. Scope honestly: this measures game narration,
  not Estonian in general.

### 2. Local Model On The Homelab

- **What:** a third proxy provider that calls the homelab's Ollama, admitted
  to the live path only if it passes the same benchmark and a latency bar.
  If it did, the per-game API cost of the main calls would drop to zero.
- **Builds on:** Ollama already runs in `khe-homelab` (`services/ai/ollama`):
  CPU-only on an i7-12700K with no discrete GPU, capped at 10G RAM and 6 CPUs,
  with `qwen2.5:7b` loaded. Provider selection is
  already centralized in the proxy (ADR 0001), so the frontend would not change.
- **Honest limits:** a turn is one full JSON object (scene, three choices with
  `expectedChanges`, consequence text) and the UI waits for the whole object,
  so CPU generation speed lands directly on the table as silence. CPU
  tokens-per-second on this host has not been measured here. The proxy's
  upstream timeout is 115 s under nginx's 120 s, and the Estonian editor pass
  is a second call that today always goes to the configured `GEMINI_MODEL`, so
  a local main model with a Gemini editor is cheaper, not free. Estonian
  quality of 7B-class open models is the larger unknown and is what the
  benchmark answers. Two games at once would queue on the same model.
- **First measurable step:** run the benchmark prompt set directly against
  Ollama, outside the proxy, and record time to a complete turn object, schema
  validity rate and benchmark score for `qwen2.5:7b` and any open model that
  fits the 10G cap. Compare with the per-turn times the existing transcripts
  already record for Gemini. No live-path change.
- **Waits for:** the benchmark. The Infrastructure rule above (local stays out
  of the live path until competitive) stays in force; this gives it a
  measurement. Reaching Ollama means `adventure-proxy` joins the
  `ai-internal` network, a `khe-homelab` change.
- **Main risk or cost:** the likely first answer is "not good enough on CPU",
  which is still a useful benchmark row. The realistic enabler is the GPU on
  the `khe-homelab` hardware wishlist, and that purchase has to beat the API
  cost it replaces, which on the cheap default is already low; a measured
  per-game cost does not exist yet and comes from the model measurement pass.
  The stronger payoff is independence from provider pricing and model
  retirement, not the saving.

### 3. The Phone Reads Aloud (Later Direction)

- **What:** optional Estonian speech synthesis for scene and consequence text,
  so the person holding the phone can play instead of performing. This is
  "Full voice narration" from the Out Of Scope list, argued as a later
  direction, not part of the current loop.
- **Builds on:** the README's own table ritual, where one person reads the
  story aloud, and the one-shared-device invariant: the phone is already the
  speaker in the middle of the table. The text is already edited Estonian
  prose with bounded scene length (the `scene_length` check).
- **First measurable step:** offline, send ten edited scenes through an
  Estonian neural TTS engine (the University of Tartu's TartuNLP group builds
  one; licence, API terms and handling of invented fantasy names are
  unverified) and record synthesis time per scene plus a table rating of
  whether it is listenable.
- **Waits for:** the Definition Of "Good Enough", and the full Estonian table
  playtest showing that reading aloud is actually a friction point rather than
  part of the fun.
- **Main risk or cost:** a synthetic voice can remove the human performance
  that makes the reader role social; it adds latency to every turn and a
  per-character cost if the engine is a paid API; and a noisy party room may
  drown it out.

### 4. Campaign Evenings (Later Direction)

- **What:** one group continuing the same cast across several evenings, with
  earlier outcomes, unresolved threads and secret-goal results carried forward
  on the device. This is "Campaign persistence" from the Out Of Scope list,
  argued as a later direction.
- **Builds on:** the sequel flow already continues a story within a session:
  `generateSequel` keeps the old roles, takes a player-written summary and
  generates new abilities and parameters. Finished transcripts already persist
  to `localStorage`, and ADR 0003 (client-owned game state) means a campaign
  could stay on the device with no server-side storage.
- **First measurable step:** count how often groups press the sequel button.
  The proxy log line already names the schema, so the ratio of `sequelSchema`
  requests to `storyGenerationSchema` requests over a window is a demand
  signal that needs no new code.
- **Waits for:** the Definition Of "Good Enough", a sequel ratio that shows
  real demand, and a yes to "Does anyone want another round?" in table play.
- **Main risk or cost:** carried context grows the prompt against the per-schema
  input budgets, and raising `PROXY_MAX_*` or those budgets widens the abuse
  ceiling (architecture invariant 6, ADR 0006). Secret-goal fairness across
  sessions needs design, and campaign bookkeeping can pull the product away
  from a 20-40 minute game that works cold.

## Out Of Scope For Now

- Live multiplayer with multiple devices
- Solo-player mode
- Campaign persistence
- AI-generated images per scene
- Full voice narration
- Child-specific mode

These can become separate product directions later, but they should not dilute
the current tabletop loop.

## Definition Of "Good Enough"

The game is ready for broader sharing when:

- a short game consistently finishes without manual recovery
- choices create real disagreement at the table
- special abilities produce visible payoff
- final reveal is understandable without replaying the whole game
- Estonian text does not feel machine-translated
- per-game cost remains acceptable for casual repeated play
