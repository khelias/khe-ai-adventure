# ADR-0005: Pass-The-Phone Secrets

- **Status:** Accepted (2026-04-25)

## Context

The game is designed for one shared device. Private information can create
social tension, but it must work without accounts, multiple phones, or real-time
multiplayer infrastructure.

The AI does not need to know each player's secret objective to generate useful
story tension. In fact, keeping secrets app-owned makes scoring deterministic
and avoids prompt leakage.

## Decision

Assign one private secret goal per role on the client.

Use a pass-the-phone ritual:

1. the screen names the next player
2. that player reveals only their secret
3. the secret is hidden before the phone moves on
4. final reveal shows each secret and whether it succeeded

The AI is unaware of secrets. Secret scoring uses final app-owned parameter
state and game-over kind.

## Consequences

The game gets asymmetric incentives without requiring backend user sessions or
multi-device synchronization.

Secrets remain inspectable and testable because they are ordinary client data,
not model memory.

The reveal ritual is part of the product, not decorative UI. If it feels clumsy
in playtests, the mechanic needs UX work before adding deeper secret systems.

Future multi-device play would need a new decision record because it changes the
privacy and synchronization model.
