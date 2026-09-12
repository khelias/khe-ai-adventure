# Architecture Decision Records

These ADRs capture decisions that define the shape of AI Adventure Engine.
They are intentionally short: enough context to understand the tradeoff, enough
consequences to know what future changes must respect.

## Index

| ADR | Status | Decision |
|---|---|---|
| [0001](./0001-ai-provider-strategy.md) | Accepted | Use Gemini 2.5 Flash as the default live model and keep Claude as opt-in quality mode. |
| [0002](./0002-proxy-and-schema-guard.md) | Accepted | Route all provider calls through the proxy and enforce exact schema hash allowlists. |
| [0003](./0003-client-owned-game-state.md) | Accepted | Keep game mechanics deterministic and app-owned; use AI for narration and proposals. |
| [0004](./0004-special-abilities-as-separate-action.md) | Accepted | Spend special abilities through a separate player action, not normal choices. |
| [0005](./0005-pass-the-phone-secrets.md) | Accepted | Keep private secret goals client-side and reveal them through pass-the-phone UX. |
| [0006](./0006-client-supplied-system-prompt.md) | Accepted | Accept the client-supplied system prompt as a bounded risk; keep the CodeQL alert visible. |

## ADR Template

```md
# ADR N: Title

Status: Proposed | Accepted | Superseded
Date: YYYY-MM-DD

## Context

## Decision

## Consequences
```
