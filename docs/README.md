# Documentation

This directory is the architecture and engineering record for AI Adventure
Engine. The README at the repo root is the product entry point; these documents
explain how the system is shaped and why.

## Reading Order

1. [Architecture](./ARCHITECTURE.md) — system boundaries, request flows,
   security posture, deployment, and where to find key code.
2. [API contract](./api-contract.md) — request shape, schema allowlist, and
   AI-authored vs app-owned fields.
3. [Architecture decisions](./decisions/README.md) — accepted ADRs for the
   provider strategy, proxy boundary, game state ownership, special abilities,
   secrets, and the client-supplied system prompt.
4. [UI/UX notes](./ui-ux.md) — screen flow, interaction principles, and current
   UX risks.
5. [Model strategy](./model-strategy.md) — why Gemini 2.5 Flash is the default,
   when Claude is acceptable, and how candidates should be evaluated.
6. [Prompt audit](./prompt-audit.md) — current prompt risks, gameplay rubric,
   and what to inspect in transcripts.
7. [Game systems audit](./game-systems-audit.md) — hardcoded genres,
   archetypes, secrets, parameter baselines, abilities, and logging risks.

The product roadmap remains at the repo root: [ROADMAP.md](../ROADMAP.md).

## Documentation Principles

- Keep docs aligned with shipped code. If a schema or prompt contract changes,
  update docs in the same commit.
- Prefer decision records over vague plans. Explain why the current default
  exists and what evidence would change it.
- Keep generated AI behavior separate from deterministic app behavior. This is
  the most important architectural boundary in the project.
- Treat cost, latency, and Estonian language quality as product requirements,
  not implementation details.
- Document screen-level user flows and invariants when UI changes affect the
  product experience.

## Change Checklist

For API or schema changes:

- update `src/game/prompts/schemas.ts`
- run `npm run schema:hashes`
- copy changed hashes into `proxy/server.js`
- update [API contract](./api-contract.md)
- run `npm run lint` and `npm run build`

For model or prompt changes:

- update [Model strategy](./model-strategy.md) if defaults or candidates change
- update [Prompt audit](./prompt-audit.md) if behavior assumptions change
- run at least one short Estonian playtest transcript
- use proxy telemetry and transcript quality before changing live defaults
