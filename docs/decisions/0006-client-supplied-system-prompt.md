# ADR 0006: Client-Supplied System Prompt Is An Accepted, Bounded Risk

Status: Accepted
Date: 2026-09-12

## Context

`POST /generate` accepts a `systemPrompt` field and passes it to Claude's system
slot (`proxy/server.js`). CodeQL reports this as `js/system-prompt-injection`,
high severity, open since 2026-07-13. The alert is correct about the mechanism:
the browser decides what the narrator's own instructions say.

The reason it is client-supplied is that the turn prompt is assembled in
`src/game/prompts/turn.ts` from game state the client owns — genre, title,
summary, parameters, roles, recent scenes, phase — which is a direct consequence
of [ADR 0003](./0003-client-owned-game-state.md). Moving assembly server-side
means moving a ~1,070-line TypeScript prompt module into a plain-JavaScript
proxy, which needs either a build step or a shared workspace package.

What already bounds the abuse:

- Origin/referer check.
- HMAC signature when `API_SECRET` is set. Not a real secret — `VITE_API_SECRET`
  ships in the browser bundle — but it blocks unsigned calls.
- Exact canonical schema hash allowlist ([ADR 0002](./0002-proxy-and-schema-guard.md)).
- `systemPrompt` accepted only for `turnSchema` requests, capped at 24,000 chars.
- Per-client budgets: 80 requests/hour, 300K tokens/hour, 1.2M tokens/day, keyed
  from `CF-Connecting-IP`.
- `adventure-proxy` publishes no ports and sits on `games-internal` only; the
  nginx container in front of it is reachable only through the Cloudflare tunnel.

The residual risk is therefore bounded rather than open-ended: someone who
extracts `VITE_API_SECRET` from the bundle can, within one IP's hourly and daily
budget, use this proxy's provider keys as a general LLM endpoint with a system
prompt of their choosing. That is a cost and misuse problem, not a data-exposure
one — the proxy holds no user data, and there is no auth to subvert.

A separate and more immediate half of the same problem was fixed in #118:
player-typed context (`location`, `playersDesc`, `insideJoke`) used to be
interpolated into the system prompt, so ordinary players — not attackers — sat
in the same slot as the narrator's rules. Those values now travel as data in the
turn message. CodeQL never flagged that half.

## Decision

Accept the risk. Do not move prompt assembly into the proxy at this time, and do
not suppress the CodeQL rule.

The alert stays open and visible as a standing reminder rather than being
dismissed, because unlike the randomness rule in khe-study this one describes a
real property of the system.

## Consequences

The CodeQL check on this repository stays red for as long as this holds. Anyone
reading it must know that one known-open alert is expected and that a *second*
alert is the signal worth acting on. That is a real cost of this decision and
the main argument against it.

Rate and token budgets become load-bearing security controls, not just cost
controls. Raising `PROXY_MAX_*` meaningfully widens the abuse ceiling, so treat
those values as a security setting.

Revisit when any of the following becomes true:

- The app gains accounts, auth, or any per-user data worth stealing.
- Provider spend shows usage that does not correspond to real games.
- The prompt module needs to be shared with another surface anyway, which makes
  the packaging work worth doing for its own sake.

At that point the fix is to have the client send typed game state and let the
proxy assemble the system prompt, which also makes the schema guard meaningful
for prompt content rather than just response shape.
