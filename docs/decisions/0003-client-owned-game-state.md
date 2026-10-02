# ADR-0003: Client-Owned Game State

- **Status:** Accepted (2026-04-25)

## Context

LLMs are useful narrators, but they are not reliable state machines. The game
needs repeatable rules for parameter movement, secrets, ability use, turn count,
and game-over conditions.

If the model owned game state, a single drifted response could silently undo a
choice, forget an ability, change secret logic, or contradict the UI.

## Decision

Keep game mechanics deterministic and app-owned.

The app owns:

- role ids
- ability used state
- current parameter state indices
- `justMoved` and `justBroke` flags
- secret assignment and scoring
- max turn count and forced ending checks
- transcript persistence
- authoritative parameter changes after normal offered choices

The AI owns:

- scene prose
- role descriptions and ability text
- initial parameter names, states, and archetypes
- proposed choices and expected changes
- consequence text for visible parameter changes
- final narration

For normal offered choices, the engine applies `choice.expectedChanges` from
the choice the players selected. For kickoff, custom actions, and special
abilities, the engine can apply `response.parameters` because there is no prior
offered-choice cost.

## Consequences

The game remains playable even when the model's prose is imperfect.

The frontend can show final parameters, secrets, and winners without asking the
model to reconstruct state after the fact.

AI responses must still be audited because valid JSON can produce boring or weak
gameplay. The transcript system exists to inspect that quality boundary.

Future persistence or share links must preserve the app-owned state contract,
not just the narrative text.
