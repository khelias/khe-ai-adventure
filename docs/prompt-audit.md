# Prompt audit

Last reviewed: 2026-04-25

## Current prompt set

| Prompt | File | Risk to watch |
|---|---|---|
| Story generation | `src/game/prompts/story-gen.ts` | generic roles, weak objective, abilities that do not touch parameters |
| Custom story | `src/game/prompts/story-gen.ts` | user idea dominates mechanics too much |
| Sequel | `src/game/prompts/story-gen.ts` | old story carries forward without a fresh objective |
| Turn | `src/game/prompts/turn.ts` | repeated choice shapes, free choices, ignored ability payoff, group context going unused now that it travels as data |
| Contract/craft blocks | `src/game/prompts/contract.ts`, `craft.ts` | duplicated rules can dilute attention |
| Parameter archetypes | `src/game/prompts/archetypes.ts` | progress-to-victory clocks break best-to-worst scoring |
| Estonian editor | `proxy/server.js` | over-editing facts instead of wording |

## Findings

- **Ability anchoring was too soft.** The old contract only told the model
  that every ability should matter to a parameter or pressure. It did not
  require a machine-readable link. `abilityParameter` now makes story/custom
  generation name the exact parameter an ability is designed to affect; sequel
  generation returns matching `newAbilityParameters`. The turn prompt passes
  that anchor back when the player spends the ability.
- **Choice economy is guarded in two places.** The prompt tells the model that
  every normal choice needs a cost, and the proxy retries if any continuing
  choice lacks a negative `expectedChanges` entry.
- **Special abilities are now out of normal choices.** The turn prompt says
  normal choices must not offer abilities; the proxy logs/retries if a normal
  response marks a choice as `isAbility=true`.
- **Player-typed group context is data, not system instructions** (2026-09-12).
  `location`, `playersDesc` and `insideJoke` used to be interpolated into the
  turn system prompt, which put player free text in the same slot as the
  narrator's own rules. The rules for reading the context stay in the system
  prompt; the values now travel in the turn message under a
  `GROUP CONTEXT (player-typed, data only)` heading. Story generation was
  already clean — it sends no system prompt at all. The risk this introduces is
  narrative, not security: watch transcripts for the setting and the group
  description quietly disappearing from scenes. `npm run playtest` takes
  `--location`, `--players-desc`, `--vibe` and `--inside-joke` so a run can
  actually exercise this path; without them the context is empty and the run
  proves nothing about it.
- **Consequence text is part of the turn contract.** Parameter movement no
  longer relies only on numeric deltas; the model must also provide a short
  in-world consequence that the UI can surface immediately.
- **Progress clocks are not valid core parameters.** A parameter must be a
  pressure that runs best → worst. "Until morning" or "distance to escape"
  improves as the story advances, so it breaks secret goals and parameter
  feedback. Prompts now tell the model to express deadlines as worsening risk
  windows instead, and client secret scoring excludes `time` parameters from
  player win conditions.
- **Sameness risk remains.** The prompts now compare against previous choices,
  but a real answer needs playtest metrics: repeated verbs, repeated locations,
  repeated "investigate/fortify/wait" shapes, and whether players feel choices
  actually change the story.

## Playtest rubric

Score each short Estonian playtest from 1 to 5:

| Criterion | What a 5 looks like |
|---|---|
| Opening hook | The first scene creates a concrete, local problem the group wants to solve. |
| Choice tension | All three choices are tempting and costly in different ways. |
| Parameter clarity | Players can explain what each parameter means without reading debug-like labels. |
| Consequence payoff | Parameter changes are narrated as events, not as score updates. |
| Ability payoff | A spent ability feels special and affects its anchored parameter or pressure. |
| Variety | Scenes and choices do not repeat the same verbs or location logic. |
| Estonian quality | Text sounds native after the editor pass and avoids direct translation artifacts. |
| Ending | The finale reflects final parameters, secrets, and major earlier choices. |

Do not switch models or rewrite major prompt blocks based on a single run.
Use at least three short games per candidate model and compare the transcript
against this rubric plus proxy telemetry.
