# Roadmap

Last reviewed: 2026-04-25

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

Before changing model defaults, run a measured short-game matrix:

- `gemini-2.5-flash`
- `gemini-2.5-flash-lite`
- `gemini-3.1-flash-lite-preview`

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
