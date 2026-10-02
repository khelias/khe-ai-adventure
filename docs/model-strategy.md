# AI Adventure Engine model strategy

Last reviewed: 2026-10-02

## Product goal

This is a casual social game. The default model choice should optimize for:

- low cost per full game
- low latency between turns
- reliable structured JSON
- good enough Estonian after the editor pass

Top-tier narrative quality matters, but not enough to make every game expensive.
The product should feel quick at the table; a slower premium model is only
worth it if a cheap model repeatedly breaks gameplay.

## Current default

Use `gemini-2.5-flash` as the default model for story generation, custom
stories, sequels, and turns.

Why:

- It is cheap enough for repeated casual play: $0.30 / 1M input tokens and $2.50 / 1M output tokens on the paid tier.
- It supports a 1M token context window, thinking, function calling, and structured outputs.
- It is fast enough for table play.
- The existing proxy already uses Gemini for the Estonian editor pass, so keeping the main game on Gemini avoids mixing an expensive generator with a cheap editor.
- When it was chosen (April 2026) the Gemini 3 options were still preview models. Newer Gemini models are now on the proxy's allowlist as candidates (see below); whether one replaces it is for the measurement pass to decide.

Implementation:

- Client provider default: `gemini`
- Proxy fallback default: `gemini`
- Proxy model default: `gemini-2.5-flash`
- Advanced UI may still expose `claude` as a quality mode.

## Gemini capabilities to use carefully

- **Structured outputs**: already used through `responseMimeType:
  application/json` and `responseSchema`. Keep this as a hard requirement for
  every live game call.
- **Thinking budget**: 2.5 Flash uses dynamic thinking by default, and output
  pricing includes thinking tokens. The Estonian editor pass runs with
  `thinkingBudget: 0` on `gemini-2.5-*`, `thinkingBudget: 128` on
  `gemini-2.5-pro` (it cannot turn thinking off, 128 is its lowest budget)
  and the lowest `thinkingLevel` on `gemini-3*` (`maxOutputTokens` 4096). Turn and story calls stay dynamic
  under `maxOutputTokens` 8192, which thinking counts against; that figure is
  unverified until the logs show the largest out plus thoughts of a real
  turn.
- **Implicit context caching**: Gemini 2.5 and newer models have implicit
  caching enabled by default. The turn system prompt has a stable prefix
  during one game, so we may get hits without extra code. The proxy logs
  `cachedContentTokenCount` when Gemini returns it.
- **Explicit context caching**: possible future optimization for the static
  turn system prompt, but it adds cache lifecycle work and is only worth it if
  telemetry shows repeated large prompt prefixes.
- **Batch API**: useful for offline model evaluations and prompt regression
  tests because it is asynchronous and discounted. It is not suitable for live
  table turns.
- **Streaming structured output**: could improve perceived latency later, but
  the UI currently needs the whole JSON object before applying choices and
  parameter consequences.

## Quality mode

Use `claude-sonnet-4-6` only as an opt-in quality mode.

Why not default:

- Sonnet 4.6 is roughly 10x more expensive than Gemini 2.5 Flash for this workload: $3 / 1M input tokens and $15 / 1M output tokens.
- Better prose does not justify that cost for every casual game.
- If we use Sonnet, it should be a conscious "quality over cost" choice, not a hidden default.

## Candidate models

A request to the proxy may carry `model`, which overrides the provider's
configured model for that call (`0c5765f`). The value is matched against
`MODEL_ALLOWLIST` in `proxy/server.js`; the configured `GEMINI_MODEL` or
`CLAUDE_MODEL` is always allowed, anything else returns 400 with the allowed
list. The Estonian editor pass ignores the override and always runs on
`GEMINI_MODEL`. To make a model testable, add it to the allowlist first.

### Current candidates

The allowlist as it stands. Prices relative to 2.5 Flash are from the
default-model review that seeded it (`0c5765f`); check the provider pricing
pages before acting on them.

| Model | Status | Price | Notes |
|---|---:|---:|---|
| `gemini-2.5-flash` | Default | $0.30 / $2.50 per 1M tokens | Proxy default (`GEMINI_MODEL`). |
| `gemini-3.5-flash-lite` | Candidate | Same as 2.5 Flash | Three generations newer at the same price. |
| `gemini-3.8-flash` | Candidate | About 2.2x 2.5 Flash | Promotional pricing until 2026-12-31. |
| `claude-sonnet-5` | Opt-in quality candidate | Not recorded here | Newer Sonnet on the opt-in Claude path. |
| `claude-sonnet-4-6` | Opt-in quality | $3 / $15 per 1M tokens | Proxy Claude default (`CLAUDE_MODEL`). |

### Earlier candidates (April 2026 review, history)

Kept for the reasoning; prices are from April 2026. None of these is on the
allowlist, so the proxy rejects them as an override. The `gpt-*` rows would
also need an OpenAI provider in the proxy.

| Model | Status then | Input / Output per 1M tokens | Notes |
|---|---:|---:|---|
| `gemini-2.5-flash-lite` | Cost test | $0.10 / $0.40 | Cheapest stable option. Test if volume cost becomes the main issue; likely weaker prose and fewer interesting consequences. |
| `gemini-2.0-flash-lite` | Cost floor test | $0.075 / $0.30 | Cheaper, but older and less aligned with current structured/thinking/caching strategy. Only test if 2.5 Flash-Lite is still too expensive. |
| `gemini-3.1-flash-lite-preview` | Candidate | $0.25 / $1.50 | Preview option that may be cheaper than 2.5 Flash with stronger quality. Do not use as live default until schema retries and Estonian playtests are clean. |
| `gemini-3-flash-preview` | Candidate | $0.50 / $3.00 | Preview model with better capability claims, but more expensive than 2.5 Flash and preview-risky. |
| `gemini-2.5-pro` | Avoid by default | $1.25 / $10.00 | Good reasoning, but too expensive for every turn of a casual game. |
| `claude-haiku-4-5` | Candidate | $1 / $5 | Possible middle ground if Gemini quality is too weak, but still notably more expensive. |
| `gpt-5.4-mini` | Candidate, not implemented | $0.75 / $4.50 | Strong structured-output candidate; requires adding an OpenAI provider to the proxy. |
| `gpt-5.4-nano` | Candidate, not implemented | $0.20 / $1.25 | Could be a future low-cost test, but pricing and quality need a dedicated provider spike. |

## Review process

Do not switch defaults based on one nice or bad run. Use this loop:

1. Run at least three short Estonian playtests per candidate.
2. Compare latency, schema retries, Estonian editor corrections, and whether choices are playable.
3. Estimate full-game cost from proxy logs (`in=`, `out=`, retries, editor time).
4. Change the default only if the cheaper model repeatedly breaks gameplay, not merely because a premium model writes prettier prose.

## Current recommendation

Keep `gemini-2.5-flash` as the live default.

Next model work should be a measurement branch, not a blind switch:

1. Read cache hits, thinking tokens and total tokens from the proxy logs; the
   proxy already logs them from Gemini's `usageMetadata`.
2. Run the matrix over the current candidates with `scripts/playtest.ts
   --model=<id>`, which sends the per-request override, so no container has
   to be reconfigured between runs. (The April plan was an env-only
   `GEMINI_MODEL` matrix; the override replaced it.)
3. Run three short Estonian playtests per candidate using the rubric in
   `docs/prompt-audit.md`.
4. Record average first-story latency, average turn latency, schema retries,
   editor-pass use, cache hits, thinking tokens, and total token cost.
5. Promote a cheaper model only if the story still produces tense choices,
   concrete consequences, and no repeated empty/free choices.

## Sources

- Google Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Google Gemini model capabilities: https://ai.google.dev/gemini-api/docs/models
- Google Gemini structured outputs: https://ai.google.dev/gemini-api/docs/structured-output
- Google Gemini thinking: https://ai.google.dev/gemini-api/docs/thinking
- Google Gemini context caching: https://ai.google.dev/gemini-api/docs/caching
- Google Gemini Batch API: https://ai.google.dev/gemini-api/docs/batch-api
- Anthropic Claude pricing: https://platform.claude.com/docs/en/docs/about-claude/pricing
- Anthropic Claude model overview: https://platform.claude.com/docs/en/about-claude/models/overview
- OpenAI GPT-5.4 mini model page: https://developers.openai.com/api/docs/models/gpt-5.4-mini/
- OpenAI models overview: https://developers.openai.com/api/docs/models
