# ADR-0001: AI Provider Strategy

- **Status:** Accepted (2026-04-25)

## Context

AI Adventure Engine is a casual social game. A good model response matters, but
the table experience depends just as much on low latency and low per-game cost.
Players will abandon the game if each turn feels expensive or slow.

The project supports Gemini and Claude through the proxy. Earlier iterations
leaned on Claude for story quality, but that made the cost profile harder to
justify for casual repeated play.

## Decision

Use `gemini-2.5-flash` as the default live model for story generation, custom
stories, sequels, and turns.

Keep `claude-sonnet-4-6` available as a hidden opt-in quality mode, not as the
default.

Run Estonian story-facing text through a Gemini editor pass when `language=et`.

Model defaults may change only after measured playtests compare:

- first-story latency
- turn latency
- schema retries
- editor-pass use
- cache hits
- thinking tokens
- total estimated cost
- transcript quality

## Consequences

The default game remains cheap and fast enough for repeated casual use.

Premium prose is treated as an explicit tradeoff rather than a hidden default
cost. This keeps product priorities visible in code and documentation.

Model evaluation must be transcript-based. One impressive or disappointing run
is not enough evidence to change defaults.

The proxy must keep provider selection centralized so the frontend does not
grow provider-specific request logic.
