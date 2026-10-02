# Game Systems Audit

Last reviewed: 2026-04-25

This audit covers the hardcoded product/game-design surfaces that shape every
run before the AI writes any prose. The goal is to keep the project architecturally
clean: deterministic rules stay in the app, narrative content stays in prompts,
and changes that affect fairness are made deliberately.

## Hardcoded Surfaces

| Surface | Current owner | Notes |
|---|---|---|
| Genres | `src/game/types.ts`, `src/components/SetupScreen.tsx`, translations | Six fixed genres. Genre currently affects copy and prompt input, but not deterministic mechanics. |
| Durations | `src/game/types.ts`, `src/game/engine.ts`, setup UI | `Short=8`, `Medium=15`, `Long=20` max turns. |
| Providers | `src/game/types.ts`, `src/store/gameStore.ts` | `gemini` default, `claude` hidden advanced option. |
| Parameter archetypes | `src/game/types.ts`, `src/game/prompts/archetypes.ts` | AI declares the archetype; app uses it for icons and secret eligibility. |
| Secret archetypes | `src/game/types.ts`, `src/game/secrets.ts`, translations | App-owned. AI does not know private goals. |
| Game-over route | `src/game/engine.ts`, `src/game/actions.ts` | Narrative end at max turn; parametric collapse when 2+ parameters hit worst. |
| Ability ownership | `src/game/prompts/story-gen.ts`, `src/game/actions.ts`, UI | AI writes ability text and anchor; app owns used state and separate trigger. |
| Transcript persistence | `src/game/transcript.ts`, `src/store/gameStore.ts` | Browser-local, last 10 started games, downloadable JSON at game over. |

## Parameter Baseline

Current behavior: every generated parameter starts at `currentStateIndex=0`,
which means the UI effectively starts at 100%.

That is simple and safe, but it creates two product problems:

- Most movement feels like loss prevention instead of something players can
  build up.
- A perfect-ending secret is extremely brittle, because the first bad trade can
  make the goal feel unrecoverable.

Recommendation: do not blindly start all parameters below 100%. Instead, add a
schema-backed `initialStateIndex` later and treat it as a design contract:

- `0` means stable at the start.
- `1` means already under pressure, but recoverable.
- `2` is rare and only for short, high-pressure stories.
- worst state is never a valid starting state.
- at least one core parameter should usually start imperfect.
- at least one core parameter should usually start strong.

This should be implemented only with an API contract/proxy hash update. A purely
frontend heuristic would hide important game-design state from transcripts and
make prompt failures harder to diagnose.

Secret scoring must change in the same work. If games can start imperfect,
`optimist` should probably mean "all core parameters end in the top band and none
collapse", not "every parameter is exactly index 0". Exact perfection can remain
as a rarer/harder archetype later, but it should not be the core third role.

## Archetype Audit

The current palette is useful, but a few archetypes mix opposite meanings:

- `resource`, `bond`, and `promise` are easy to understand as best -> worst.
- `pressure`, `time`, `curse`, `hunger`, `debt`, and `guilt` are worsening
  pressures and should mostly move down.
- `secret` can be either good-to-hide or good-to-reveal depending on objective.
- `proof` is especially risky because "more proof" often feels like progress,
  while the engine expects index movement toward worst to be bad.

Next hardening step: split archetypes into explicit mechanical families instead
of relying on prose examples alone:

- `scarcity`: fuel, medicine, shelter, warmth
- `relation`: trust, oath, alliance, promise
- `threat`: pursuit, suspicion, deadline, curse
- `revelation-risk`: lie exposure, evidence leakage, unwanted truth
- `leverage`: proof, access, bargaining power

`leverage` should not use the same best -> worst semantics unless it is framed as
"leverage slipping away". This avoids progress-to-victory meters like
`Hommikuni`, and also avoids subtler inverted meters like "proof gathered".

## Genre Audit

Genres are currently only labels plus examples inside prompts. That is acceptable
for a prototype, but weak for a reference-quality architecture because every
genre can still drift into the same structure.

Recommended next step: add `src/game/genreProfiles.ts` with deterministic
profiles:

- preferred archetype families
- disallowed archetype families
- setup teaser copy source
- example objective shapes
- tone guardrails
- ability examples that are genre-specific but not copy-pasted into prompts

The prompt can then receive a compact profile block instead of one large global
archetype palette. This gives each genre more identity and makes audits easier.

## Secret Audit

The current distribution guarantees the core trio for 3+ players:

- `traitor`: wants collapse
- `survivor`: wants narrative ending without collapse
- `optimist`: wants perfect state

This creates good social pressure, but the exact win conditions need tuning:

- `optimist` is too strict when any parameter starts imperfect or when the AI
  offers mostly negative tradeoffs.
- `survivor` may overlap too much with normal group play.
- `sacrificer` can be fun, but only if the target parameter is not a clock or
  one-way boring pressure.
- `keeper` is fair only when its target can plausibly recover.

Current mitigation: `time` parameters are excluded from secret targets. That
fixes the obvious `Hommikuni` failure, but broader fairness still needs transcript
evidence.

Recommended next step: score secrets against parameter family and starting
baseline:

- destructive goals target recoverable but costly parameters
- protective goals target parameters with multiple plausible movement paths
- perfect goals use top-band scoring unless explicitly marked hard mode
- neutral goals should create behavior that is not identical to "play normally"

## Ability Audit

Special abilities are now triggered separately, which is the right interaction
model. The remaining risk is quality:

- An ability can be tied to a parameter by name but still feel generic.
- The generated ability can repair a parameter that is not narratively connected.
- The consequence text may fail to make the ability feel like a moment.

Recommended next step: add transcript checks for ability quality:

- ability text mentions a concrete route, fact, tool, relation, or sacrifice
- `abilityParameter` matches a generated parameter exactly
- after ability use, at least one event or scene sentence pays off that ability
- ability is not a generic "notices details", "is strong", or "calms everyone"

## Transcript And Logging

What exists now:

- the browser stores the last 10 started games in `localStorage`
- a game is persisted when it starts and after each turn record
- the same game updates in place instead of creating duplicates
- game-over includes a JSON download button
- `scripts/playtest.ts` can generate Markdown transcripts through the proxy

What does not exist:

- centralized server-side gameplay logging
- automatic upload of real player transcripts
- a UI for browsing local transcripts
- anonymization/consent controls for production analytics

That means the app can be analyzed locally after playtests, but Codex cannot see
real player games later unless the transcript is exported or a deliberate logging
pipeline is added.

Recommended next step: add a dev-only transcript library first. Server-side
collection should be opt-in and documented, because full transcripts include
player names, locations, and private setup context.

## Priority Backlog

1. Add `initialStateIndex` to the story schema and proxy allowlist, then update
   secret scoring in the same commit.
2. Replace the global archetype palette with genre profiles and mechanical
   families.
3. Add transcript scoring helpers for parameter valence, repeated choice shapes,
   ability payoff, and secret fairness.
4. Add a local transcript library/debug screen before considering server-side
   logging.
5. Continue screen-level UI polish after each full playthrough, especially
   parameter density, secret reveal clarity, and game-over satisfaction.
