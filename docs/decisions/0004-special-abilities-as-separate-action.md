# ADR-0004: Special Abilities As Separate Action

- **Status:** Accepted (2026-04-25)

## Context

Special abilities were originally at risk of becoming just another generated
choice. That made them easy to miss, hard to remember, and mechanically muddy.
It also encouraged the AI to offer named-character actions inside the normal
group choice list.

The desired table behavior is different: players should remember their own
ability, decide when it is worth spending, and create a visible payoff moment.

## Decision

Do not mix special abilities into the three normal choices.

Normal choices are group-facing and must use `isAbility=false`.

Special abilities are spent through a separate player action in the UI. When a
player spends one, the app creates a choice with:

- `isAbility=true`
- `actor` set to the role id
- empty `expectedChanges`

Story generation must also produce `abilityParameter`: the exact generated
parameter name the ability is designed to affect. Sequel generation returns
matching `newAbilityParameters`.

## Consequences

Abilities become a player-controlled resource rather than passive AI content.

The turn prompt can tell the model which parameter the spent ability was
designed around, making payoff less generic.

The proxy can treat `isAbility=true` inside normal AI-offered choices as a
contract violation.

The UI must make unused abilities accessible without making the game screen
crowded. This remains a UX pressure point.
