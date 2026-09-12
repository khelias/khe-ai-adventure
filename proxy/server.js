const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const { ET_STYLE_GUIDE } = require('./et-style-guide');
const crypto = require('crypto');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const API_SECRET = process.env.API_SECRET || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-sonnet-4-6';
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || 'gemini';
const PORT = Number(process.env.PORT) || 3000;

// A request may name a model so a playtest can compare candidates without
// reconfiguring the container between runs. The value is client-supplied, so
// it is matched against an exact allowlist rather than passed upstream: an
// unchecked model name lets anyone spend this proxy's API keys on the most
// expensive model the provider sells. Add a candidate here to make it
// testable; the configured default is always allowed.
const MODEL_ALLOWLIST = {
  gemini: ['gemini-2.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.8-flash'],
  claude: ['claude-sonnet-5', 'claude-sonnet-4-6'],
};

function resolveModel(provider, requested) {
  const configured = provider === 'claude' ? CLAUDE_MODEL : GEMINI_MODEL;
  if (!requested) return configured;
  const allowed = [...new Set([configured, ...(MODEL_ALLOWLIST[provider] || [])])];
  if (!allowed.includes(requested)) {
    const err = new Error(`model is not in the allowlist for ${provider}`);
    err.status = 400;
    err.publicBody = { error: `model is not in the allowlist for ${provider}`, allowed };
    throw err;
  }
  return requested;
}

const UPSTREAM_TIMEOUT_MS = 115_000; // slightly under nginx proxy_read_timeout (120s)
const APPROX_CHARS_PER_TOKEN = 4;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const INPUT_BUDGETS = {
  default: { promptChars: 14_000, systemPromptChars: 0, totalChars: 14_000, approxTokens: 3_500 },
  storyGenerationSchema: { promptChars: 14_000, systemPromptChars: 0, totalChars: 14_000, approxTokens: 3_500 },
  customStorySchema: { promptChars: 16_000, systemPromptChars: 0, totalChars: 16_000, approxTokens: 4_000 },
  sequelSchema: { promptChars: 18_000, systemPromptChars: 0, totalChars: 18_000, approxTokens: 4_500 },
  turnSchema: { promptChars: 18_000, systemPromptChars: 24_000, totalChars: 38_000, approxTokens: 9_500 },
};

const USAGE_LIMITS = {
  requestsPerHour: parsePositiveInt(process.env.PROXY_MAX_REQUESTS_PER_HOUR, 80),
  tokensPerHour: parsePositiveInt(process.env.PROXY_MAX_TOKENS_PER_HOUR, 300_000),
  tokensPerDay: parsePositiveInt(process.env.PROXY_MAX_TOKENS_PER_DAY, 1_200_000),
};
const usageByClient = new Map();
let lastUsagePruneAt = 0;

if (!GEMINI_API_KEY && !ANTHROPIC_API_KEY) {
  console.error('FATAL: at least one of GEMINI_API_KEY or ANTHROPIC_API_KEY must be set');
  process.exit(1);
}

const anthropic = ANTHROPIC_API_KEY ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const geminiUrl = (model) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

const app = express();
app.use(express.json({ 
  limit: '1mb', 
  type: '*/*',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

// ---- Abuse protections ----
//
// 1. Schema allowlist: reject requests whose JSON Schema does not exactly
//    match one of the known game schemas. Without this, the proxy is a free
//    generic Claude/Gemini API for whoever finds the URL.
// 2. Origin check: require Origin or Referer to match an allowed origin.
//    Filters casual curl abuse; real attackers can spoof but then they still
//    hit the schema allowlist + per-IP rate limit in nginx.
// 3. Rate limit: enforced by nginx (see nginx.conf) using CF-Connecting-IP.
// 4. Input budgets: reject oversized prompts/system prompts before a provider
//    call. The body limit is still 1 MB, but valid game prompts are far smaller.
// 5. Per-client usage budgets: an in-memory hourly/daily token counter limits
//    repeated valid calls from the same visitor/IP. This is a cost backstop,
//    not a billing-grade quota system.
//
// Hashes are SHA-256 over a canonicalized JSON representation of the schema
// object sent by the frontend. This is stricter than checking top-level keys:
// a caller cannot send `{ properties: { stories: ... } }` with an arbitrary
// loose nested schema and still pass the guard.
//
// Recompute after changing src/game/prompts/schemas.ts:
//   npm run schema:hashes
const ALLOWED_SCHEMA_HASHES = new Map([
  ['b03076dbb8868948ccd3eb5a576b67806a7fd415c2634ae985ed1639e1260977', 'storyGenerationSchema'],
  ['276f490cdb0c5e913f93a025004bb353d078643ec71b60e6b92317230f2e30bb', 'customStorySchema'],
  ['668239c498ac09d383b9609829a2bb3bb4727a64de379e9a2e2c1c9f0d3ad2cd', 'sequelSchema'],
  ['ecef588fd5abf60f990d3e092b13351f5a59a6353db967569e514354c04ea53a', 'turnSchema'],
]);

function schemaFingerprint(schema) {
  if (!schema || typeof schema !== 'object' || !schema.properties || typeof schema.properties !== 'object') {
    return null;
  }
  return Object.keys(schema.properties).sort().join(',');
}

function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = canonicalize(value[key]);
    }
    return out;
  }
  return value;
}

function schemaHash(schema) {
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(canonicalize(schema)))
    .digest('hex');
}

function schemaLabel(schema) {
  return ALLOWED_SCHEMA_HASHES.get(schemaHash(schema)) || null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function estimateTokensForText(text) {
  return Math.ceil((text || '').length / APPROX_CHARS_PER_TOKEN);
}

function promptBudgetFor(schemaName) {
  return INPUT_BUDGETS[schemaName] || INPUT_BUDGETS.default;
}

function inputBudgetStats({ schemaName, prompt, systemPrompt, extraPrompt = '' }) {
  const fullPrompt = prompt + extraPrompt;
  const systemText = systemPrompt || '';
  return {
    budget: promptBudgetFor(schemaName),
    received: {
      promptChars: fullPrompt.length,
      systemPromptChars: systemText.length,
      totalChars: fullPrompt.length + systemText.length,
      approxTokens: estimateTokensForText(fullPrompt) + estimateTokensForText(systemText),
    },
  };
}

function validateInputBudget(args) {
  const stats = inputBudgetStats(args);
  const over = [];
  if (stats.received.promptChars > stats.budget.promptChars) {
    over.push(`promptChars ${stats.received.promptChars}/${stats.budget.promptChars}`);
  }
  if (stats.received.systemPromptChars > stats.budget.systemPromptChars) {
    over.push(`systemPromptChars ${stats.received.systemPromptChars}/${stats.budget.systemPromptChars}`);
  }
  if (stats.received.totalChars > stats.budget.totalChars) {
    over.push(`totalChars ${stats.received.totalChars}/${stats.budget.totalChars}`);
  }
  if (stats.received.approxTokens > stats.budget.approxTokens) {
    over.push(`approxTokens ${stats.received.approxTokens}/${stats.budget.approxTokens}`);
  }
  return over.length > 0 ? { ok: false, ...stats, over } : { ok: true, ...stats };
}

function budgetExceededError(validation) {
  const err = new Error(`input budget exceeded: ${validation.over.join('; ')}`);
  err.status = 413;
  err.publicBody = {
    error: 'Input budget exceeded',
    details: validation.over,
    budget: validation.budget,
    received: validation.received,
  };
  return err;
}

function clientUsageKey(req) {
  const cfIp = req.get('cf-connecting-ip');
  if (cfIp) return `cf:${cfIp}`;
  const forwarded = (req.get('x-forwarded-for') || '').split(',')[0].trim();
  if (forwarded) return `xff:${forwarded}`;
  const realIp = req.get('x-real-ip');
  if (realIp) return `real:${realIp}`;
  return `socket:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

function pruneUsageBuckets(now) {
  if (now - lastUsagePruneAt < 60_000) return;
  lastUsagePruneAt = now;
  for (const [key, bucket] of usageByClient.entries()) {
    if (bucket.dayResetAt <= now) usageByClient.delete(key);
  }
}

function usageBucketFor(key, now) {
  let bucket = usageByClient.get(key);
  if (!bucket || bucket.dayResetAt <= now) {
    bucket = {
      hourResetAt: now + HOUR_MS,
      dayResetAt: now + DAY_MS,
      hourRequests: 0,
      dayRequests: 0,
      hourTokens: 0,
      dayTokens: 0,
    };
    usageByClient.set(key, bucket);
  } else if (bucket.hourResetAt <= now) {
    bucket.hourResetAt = now + HOUR_MS;
    bucket.hourRequests = 0;
    bucket.hourTokens = 0;
  }
  return bucket;
}

function reserveClientBudget(req, estimatedTokens) {
  const now = Date.now();
  pruneUsageBuckets(now);
  const key = clientUsageKey(req);
  const bucket = usageBucketFor(key, now);
  const over = [];
  if (bucket.hourRequests + 1 > USAGE_LIMITS.requestsPerHour) {
    over.push(`requestsPerHour ${bucket.hourRequests + 1}/${USAGE_LIMITS.requestsPerHour}`);
  }
  if (bucket.hourTokens + estimatedTokens > USAGE_LIMITS.tokensPerHour) {
    over.push(`tokensPerHour ${bucket.hourTokens + estimatedTokens}/${USAGE_LIMITS.tokensPerHour}`);
  }
  if (bucket.dayTokens + estimatedTokens > USAGE_LIMITS.tokensPerDay) {
    over.push(`tokensPerDay ${bucket.dayTokens + estimatedTokens}/${USAGE_LIMITS.tokensPerDay}`);
  }
  if (over.length > 0) {
    const err = new Error(`usage budget exceeded: ${over.join('; ')}`);
    err.status = 429;
    err.publicBody = {
      error: 'Usage budget exceeded',
      details: over,
      limits: USAGE_LIMITS,
    };
    throw err;
  }
  bucket.hourRequests += 1;
  bucket.dayRequests += 1;
  bucket.hourTokens += estimatedTokens;
  bucket.dayTokens += estimatedTokens;
  return { key, estimatedTokens };
}

function tokenCountFromUsage(tokens) {
  if (!tokens || typeof tokens !== 'object') return 0;
  if (Number.isFinite(tokens.total) && tokens.total > 0) return Math.ceil(tokens.total);
  return ['in', 'out', 'thoughts'].reduce((sum, key) => {
    const value = tokens[key];
    return Number.isFinite(value) && value > 0 ? sum + Math.ceil(value) : sum;
  }, 0);
}

function adjustClientBudget(reservation, actualTokens) {
  if (!reservation || !Number.isFinite(actualTokens) || actualTokens <= 0) return;
  const bucket = usageByClient.get(reservation.key);
  if (!bucket) return;
  const delta = actualTokens - reservation.estimatedTokens;
  bucket.hourTokens = Math.max(0, bucket.hourTokens + delta);
  bucket.dayTokens = Math.max(0, bucket.dayTokens + delta);
}

// Allowed origins for the game UI. Localhost entries let `npm run dev`
// and `npm run preview` hit the proxy during development.
const ALLOWED_ORIGIN_PREFIXES = [
  'https://games.khe.ee',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
];

function isAllowedOrigin(req) {
  const origin = req.get('origin') || '';
  if (origin && ALLOWED_ORIGIN_PREFIXES.some((a) => origin === a)) return true;
  const referer = req.get('referer') || '';
  if (referer && ALLOWED_ORIGIN_PREFIXES.some((a) => referer.startsWith(a + '/'))) return true;
  return false;
}

app.get('/healthz', (_req, res) => res.status(200).send('ok'));

app.post('/generate', async (req, res) => {
  if (!isAllowedOrigin(req)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  if (API_SECRET) {
    const signature = req.headers['x-adventure-signature'];
    if (!signature) {
      return res.status(401).json({ error: 'Missing signature' });
    }
    const expected = crypto.createHmac('sha256', API_SECRET).update(req.rawBody).digest('hex');
    if (signature !== expected) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
  }
  const { prompt, schema, provider = DEFAULT_PROVIDER, systemPrompt, language, model } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim() || typeof schema !== 'object' || !schema) {
    return res.status(400).json({ error: 'prompt (string) and schema (object) are required' });
  }
  if (typeof systemPrompt !== 'undefined' && typeof systemPrompt !== 'string') {
    return res.status(400).json({ error: 'systemPrompt must be a string when provided' });
  }
  if (typeof language !== 'undefined' && language !== 'et' && language !== 'en') {
    return res.status(400).json({ error: 'language must be et or en when provided' });
  }
  const knownSchema = schemaLabel(schema);
  if (!knownSchema) {
    return res.status(400).json({
      error: `schema is not in the allowlist${schemaFingerprint(schema) ? ` (${schemaFingerprint(schema)})` : ''}`,
    });
  }
  if (systemPrompt && knownSchema !== 'turnSchema') {
    return res.status(400).json({ error: 'systemPrompt is only accepted for turnSchema requests' });
  }
  if (provider !== 'claude' && provider !== 'gemini') {
    return res.status(400).json({ error: `unknown provider: ${provider}` });
  }
  if (typeof model !== 'undefined' && typeof model !== 'string') {
    return res.status(400).json({ error: 'model must be a string when provided' });
  }
  let effectiveModel;
  try {
    effectiveModel = resolveModel(provider, model);
  } catch (err) {
    return res.status(err.status || 400).json(err.publicBody || { error: err.message });
  }
  const t0 = Date.now();
  try {
    // Estonian grammar is handled by the Gemini editor pass (corrective),
    // not by prepending the style guide to the generator's system prompt.
    // This keeps the generator focused on narrative craft and saves ~800
    // tokens per turn. The ET_STYLE_GUIDE is still used in EDITOR_SYSTEM.
    const effectiveSystemPrompt = systemPrompt;

    const callOnce = async (extraPrompt = '') => {
      const budget = validateInputBudget({
        schemaName: knownSchema,
        prompt,
        systemPrompt: effectiveSystemPrompt,
        extraPrompt,
      });
      if (!budget.ok) throw budgetExceededError(budget);
      const reservation = reserveClientBudget(req, budget.received.approxTokens);
      const fullPrompt = prompt + extraPrompt;
      const result = provider === 'claude'
        ? await callClaude({ prompt: fullPrompt, schema, systemPrompt: effectiveSystemPrompt, model: effectiveModel })
        : await callGemini({ prompt: fullPrompt, schema, systemPrompt: effectiveSystemPrompt, model: effectiveModel });
      adjustClientBudget(reservation, tokenCountFromUsage(result.tokens));
      return result;
    };

    let result = await callOnce();

    // Turn responses have { scene, choices, parameters, gameOver }. For those:
    //   1) Normalize malformed choice arrays.
    //   2) Retry invalid empty-choice / free-choice contracts.
    //   3) If language is Estonian, run scene + gameOverText through Gemini editor.
    // A turn-shaped response may arrive with a malformed `choices` field
    // (object, null, or even a string) if the model drifts off-schema at
    // climax / gameOver moments. Normalise here so frontend `.map()` and
    // playtest `.entries()` don't crash.
    if (result?.data && typeof result.data.scene === 'string' && !Array.isArray(result.data.choices)) {
      console.warn(`turn response has non-array choices (type=${typeof result.data.choices}, provider=${provider}); coerced to []`);
      result.data.choices = [];
    }
    let isTurnShape = result?.data && typeof result.data.scene === 'string' && Array.isArray(result.data.choices);

    // Schema-contract retry: turn-shaped responses MUST have either
    // choices.length === 3 OR gameOver === true. Providers sometimes drift and
    // emit neither — most often on tense reveal scenes where the model
    // "feels" the turn has concluded. Without fallback, the game freezes.
    //
    // Strategy: two retries with escalating reminders, then server-side
    // coercion (force gameOver=true so the client shows a finale rather
    // than a blank choices panel).
    const isEmptyTurnContract = () =>
      isTurnShape && Array.isArray(result.data.choices) && result.data.choices.length === 0 && result.data.gameOver !== true;
    const RETRY_REMINDERS = [
      '\n\n⚠ SCHEMA CONTRACT: Your previous attempt returned an empty `choices` array with `gameOver: false`. This is not a valid response — the game cannot continue without either 3 choices OR gameOver=true. Retry now: output EXACTLY 3 choices that advance the story, OR set gameOver=true with a full gameOverText.',
      '\n\n⚠ FINAL ATTEMPT: The previous TWO responses returned empty choices with gameOver=false. This will FREEZE THE GAME for the players at the table. You have ONE job right now: either produce 3 concrete choices that let play continue, OR commit to gameOver=true and write a full 3-5 paragraph gameOverText that concludes the scene. Choosing one of these is a REQUIREMENT, not a preference. Do not return empty choices again.',
    ];
    let retried = 0;
    for (const reminder of RETRY_REMINDERS) {
      if (!isEmptyTurnContract()) break;
      retried += 1;
      console.warn(`empty-choices contract violation attempt ${retried} (provider=${provider}); retrying`);
      try {
        const retryResult = await callOnce(reminder);
        if (retryResult?.data && typeof retryResult.data.scene === 'string' && !Array.isArray(retryResult.data.choices)) {
          retryResult.data.choices = [];
        }
        result = retryResult;
        isTurnShape = result?.data && typeof result.data.scene === 'string' && Array.isArray(result.data.choices);
      } catch (e) {
        console.warn(`retry ${retried} failed: ${e.message || e}`);
      }
    }
    // Last-resort coercion: if we still have empty choices + gameOver=false
    // after all retries, force gameOver=true and synthesize a minimal
    // gameOverText from the scene. Better an abrupt ending than a freeze.
    let coercedGameOver = false;
    if (isEmptyTurnContract()) {
      coercedGameOver = true;
      console.warn(`coercing gameOver=true after ${retried} retries failed (provider=${provider})`);
      result.data.gameOver = true;
      if (!result.data.gameOverText || typeof result.data.gameOverText !== 'string' || result.data.gameOverText.trim().length < 20) {
        result.data.gameOverText = (result.data.scene || '') + '\n\n' + (language === 'et'
          ? 'Lugu katkeb siin — jutustaja jäi sõnadega kimbatusse. Mis edasi juhtus, jääb teie kujutlusvõimesse.'
          : 'The story breaks off here — the narrator ran out of words. What happens next is yours to imagine.');
      }
    }
    const COST_RETRY_REMINDERS = [
      '\n\n⚠ CHOICE COST CONTRACT: Your previous response offered at least one choice with no real downside. Every continuing-turn choice MUST include at least one negative `expectedChanges` entry. A choice may also improve something, but no option can be all upside. Retry now with exactly 3 choices; each choice has at least one negative delta that clearly follows from the action.',
      '\n\n⚠ FINAL CHOICE-COST ATTEMPT: The offered choices still had free/all-upside options. This breaks the game economy. Rewrite the choices only by producing a full valid turn response: exactly 3 choices, and every choice includes at least one negative `expectedChanges` entry. Keep choice text free of character names.',
    ];
    const choiceCostContractViolations = () =>
      isTurnShape && result.data.gameOver !== true && Array.isArray(result.data.choices) && result.data.choices.length > 0
        ? getChoiceCostViolations(result.data)
        : [];
    let costRetried = 0;
    for (const reminder of COST_RETRY_REMINDERS) {
      const violations = choiceCostContractViolations();
      if (violations.length === 0) break;
      costRetried += 1;
      console.warn(`choice-cost contract violation attempt ${costRetried} (provider=${provider}): ${violations.join(' | ')}; retrying`);
      try {
        const retryResult = await callOnce(`${reminder}\n\nViolations to fix:\n- ${violations.join('\n- ')}`);
        if (retryResult?.data && typeof retryResult.data.scene === 'string' && !Array.isArray(retryResult.data.choices)) {
          retryResult.data.choices = [];
        }
        result = retryResult;
        isTurnShape = result?.data && typeof result.data.scene === 'string' && Array.isArray(result.data.choices);
      } catch (e) {
        console.warn(`choice-cost retry ${costRetried} failed: ${e.message || e}`);
      }
    }
    let editorMs = 0;
    let editorApplied = false;
    if (!isTurnShape && language === 'et' && GEMINI_API_KEY) {
      const te = Date.now();
      try {
        editorApplied = await estonianStructuredTextEditorPass(result.data);
      } catch (e) {
        console.warn(`editor-pass structured text failed (continuing with unedited): ${e.message || e}`);
      }
      editorMs = Date.now() - te;
    }
    if (isTurnShape) {
      logChoiceCostViolations(result.data, provider);
      if (language === 'et' && GEMINI_API_KEY) {
        const te = Date.now();
        try {
          await estonianEditorPass(result.data);
          editorApplied = true;
        } catch (e) {
          console.warn(`editor-pass failed (continuing with unedited): ${e.message || e}`);
        }
        editorMs = Date.now() - te;
      }
    }

    const ms = Date.now() - t0;
    const cacheHit = result.cacheHit;
    const tokens = result.tokens || { in: 0, out: 0 };
    console.log(
      `proxy ok: schema=${knownSchema} provider=${provider} model=${result.model} ms=${ms} in=${tokens.in} out=${tokens.out}${tokens.thoughts ? ` thoughts=${tokens.thoughts}` : ''}${tokens.total ? ` total=${tokens.total}` : ''}${cacheHit != null ? ` cache=${cacheHit}` : ''}${editorApplied ? ` editor=${editorMs}ms` : ''}${retried ? ` retried=${retried}` : ''}${costRetried ? ` cost-retried=${costRetried}` : ''}${coercedGameOver ? ' coerced-gameover' : ''}`,
    );
    res.json({ provider, model: result.model, data: result.data });
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('proxy: upstream timeout', { provider });
      return res.status(504).json({ error: 'Upstream timeout' });
    }
    const status = err.status || 500;
    // provider is already constrained to claude|gemini above, but keeping
    // request values out of the format-string position removes the question.
    console.error('proxy: error', { provider, status, message: err.message || String(err) });
    res.status(status).json(err.publicBody || { error: err.message || 'Proxy error' });
  }
});

// Warn in logs if any choice has no cost (all expectedChanges zero/positive)
// or if a choice is missing expectedChanges entirely. Does not block — the AI
// self-check is primary; this is telemetry so we can spot drift.
function logChoiceCostViolations(turn, provider) {
  const violations = getChoiceCostViolations(turn);
  if (violations.length > 0) {
    console.warn(`choice-cost violations (provider=${provider}): ${violations.join(' | ')}`);
  }
}

function getChoiceCostViolations(turn) {
  if (!Array.isArray(turn.choices)) return [];
  const violations = [];
  turn.choices.forEach((c, i) => {
    if (c?.isAbility === true) {
      violations.push(`choice[${i}] is marked isAbility=true; abilities must be spent through the separate player action`);
    }
    const changes = Array.isArray(c.expectedChanges) ? c.expectedChanges : [];
    if (changes.length === 0) { violations.push(`choice[${i}] has no expectedChanges`); return; }
    const hasNegative = changes.some((ch) => typeof ch.change === 'number' && ch.change < 0);
    if (!hasNegative) violations.push(`choice[${i}] has no negative cost: ${JSON.stringify(changes)}`);
  });
  return violations;
}

// Estonian editor pass: send the scene (and optional gameOverText) through
// Gemini Flash with a strict editorial prompt. Fixes invented words, wrong
// word register, and non-native sentence structure while preserving facts.
// Mutates `turn.scene` and `turn.gameOverText` in place.
const EDITOR_SYSTEM = `Sa oled eesti kirjanduse toimetaja. Saad ilukirjandusliku lõigu ja parandad eesti keele vigu — kasuta allpool olevat sõnajärje ja grammatika reeglistikku kontrolljuhisena.

PARANDA:
- Sõnad, mida eesti keeles ei ole (hallutsinatsioonid, valed liitsõnad, otsetõlked inglise keelest — nt "dešifreerib" kui mõeldakse "avab jõuga")
- Sõnad, mis on valel registril (loomahääl masina kohta, murdesõna proosa sees)
- Kalque'd ja kohmakad lauseehitused (inglise-mõõtkavaline struktuur)
- Ebaühtlane ajavorm ühe lõigu sees
- Sõnajärje vead vastavalt allolevale reeglistikule — eelkõige V2-reegli rikkumised, eituspartikli "ei" lahutamine verbist, rõhumäärsõnade ("ka", "just", "isegi") vale asend
- Erioskuse tekstides väljamõeldud pealkirjad ja kooloniga sildid. Muuda need üheks loomulikuks tegevuslauseks. Näiteks "Ostee: Kristo meenutab..." → "Kristo mäletab üht varjatud hooviteed ja juhatab grupi sealt läbi."

ÄRA MUUDA:
- Fakte, tegelaste nimesid, sündmuste sisu
- Atmosfääri ega tooni
- Pikkust olulisel määral — paranda sõnu ja sõnajärge, mitte kompositsiooni ega stseeni mahtu

Vasta AINULT parandatud tekstiga, ilma selgituseta. Kui tekstis pole vigu, vasta täpselt sama tekstiga.

---

${ET_STYLE_GUIDE}`;

const EDITOR_SCHEMA = {
  type: 'OBJECT',
  properties: { corrected: { type: 'STRING' } },
  required: ['corrected'],
};

// Global budget for each editor pass.
// nginx proxy_read_timeout is 120s; upstream AI call can use up to 115s; we
// keep editor-pass well under the remaining margin so the total stays ≤ 120s.
const EDITOR_TOTAL_BUDGET_MS = 25_000;

async function estonianEditorPass(turnData) {
  // Each task: { label, text, apply }. `apply(corrected)` writes the edited
  // text back to its home in turnData. Choice tasks carry their index so the
  // right element is updated.
  const tasks = [];
  if (turnData.scene && typeof turnData.scene === 'string' && turnData.scene.trim().length > 10) {
    tasks.push({
      label: 'scene',
      text: turnData.scene,
      apply: (c) => { turnData.scene = c; },
    });
  }
  if (turnData.gameOverText && typeof turnData.gameOverText === 'string' && turnData.gameOverText.trim().length > 20) {
    tasks.push({
      label: 'gameOverText',
      text: turnData.gameOverText,
      apply: (c) => { turnData.gameOverText = c; },
    });
  }
  if (Array.isArray(turnData.choices)) {
    turnData.choices.forEach((choice, idx) => {
      if (choice && typeof choice.text === 'string' && choice.text.trim().length > 5) {
        tasks.push({
          label: `choice[${idx}]`,
          text: choice.text,
          apply: (c) => { turnData.choices[idx].text = c; },
        });
      }
    });
  }
  if (Array.isArray(turnData.consequences)) {
    turnData.consequences.forEach((consequence, idx) => {
      if (consequence && typeof consequence.text === 'string' && consequence.text.trim().length > 5) {
        tasks.push({
          label: `consequence[${idx}]`,
          text: consequence.text,
          apply: (c) => { turnData.consequences[idx].text = c; },
        });
      }
    });
  }
  if (tasks.length === 0) return;
  await runEditorTasks(tasks);
}

async function estonianStructuredTextEditorPass(data) {
  const tasks = [];
  addStoryTextTasks(tasks, data);
  addCustomStoryTextTasks(tasks, data);
  addSequelTextTasks(tasks, data);
  if (tasks.length === 0) return false;
  await runEditorTasks(tasks);
  return true;
}

function addTextTask(tasks, label, text, apply, minLen = 5) {
  if (typeof text !== 'string' || text.trim().length < minLen) return;
  tasks.push({ label, text, apply });
}

function addStoryTextTasks(tasks, data) {
  if (!Array.isArray(data?.stories)) return;
  data.stories.forEach((story, storyIdx) => {
    addTextTask(tasks, `story[${storyIdx}].title`, story.title, (c) => { story.title = c; });
    addTextTask(tasks, `story[${storyIdx}].summary`, story.summary, (c) => { story.summary = c; }, 20);
    addRoleTextTasks(tasks, story.roles, `story[${storyIdx}].roles`);
    addParameterTextTasks(tasks, story.parameters, `story[${storyIdx}].parameters`);
  });
}

function addCustomStoryTextTasks(tasks, data) {
  addRoleTextTasks(tasks, data?.roles, 'roles');
  addParameterTextTasks(tasks, data?.parameters, 'parameters');
}

function addSequelTextTasks(tasks, data) {
  if (Array.isArray(data?.newAbilities)) {
    data.newAbilities.forEach((ability, idx) => {
      addTextTask(tasks, `newAbilities[${idx}]`, ability, (c) => { data.newAbilities[idx] = c; }, 10);
    });
  }
  addParameterTextTasks(tasks, data?.newParameters, 'newParameters');
}

function addRoleTextTasks(tasks, roles, labelPrefix) {
  if (!Array.isArray(roles)) return;
  roles.forEach((role, idx) => {
    // Do not edit role.name; names are identifiers and should remain stable.
    addTextTask(tasks, `${labelPrefix}[${idx}].description`, role.description, (c) => { role.description = c; }, 10);
    addTextTask(tasks, `${labelPrefix}[${idx}].ability`, role.ability, (c) => { role.ability = c; }, 10);
  });
}

function addParameterTextTasks(tasks, parameters, labelPrefix) {
  if (!Array.isArray(parameters)) return;
  parameters.forEach((param, paramIdx) => {
    addTextTask(tasks, `${labelPrefix}[${paramIdx}].name`, param.name, (c) => { param.name = c; });
    if (Array.isArray(param.states)) {
      param.states.forEach((state, stateIdx) => {
        addTextTask(
          tasks,
          `${labelPrefix}[${paramIdx}].states[${stateIdx}]`,
          state,
          (c) => { param.states[stateIdx] = c; },
        );
      });
    }
  });
}

async function runEditorTasks(tasks) {
  const sharedController = new AbortController();
  const budgetTimer = setTimeout(() => sharedController.abort(), EDITOR_TOTAL_BUDGET_MS);

  try {
    const results = await Promise.all(tasks.map(async (task) => {
      try {
        const edited = await editorCall(task.text, sharedController.signal);
        return { task, edited };
      } catch (e) {
        // Per-task failure: log and leave field unedited. Don't fail the whole pass.
        console.warn(`editor-pass ${task.label} failed: ${e.message || e}`);
        return { task, edited: null };
      }
    }));
    for (const { task, edited } of results) {
      if (edited && edited.length > 0) task.apply(edited);
    }
  } finally {
    clearTimeout(budgetTimer);
  }
}

async function editorCall(text, externalSignal) {
  const body = {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: EDITOR_SCHEMA,
      temperature: 0.2,
    },
    systemInstruction: { parts: [{ text: EDITOR_SYSTEM }] },
  };
  const res = await fetch(geminiUrl(GEMINI_MODEL), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: externalSignal,
  });
  if (!res.ok) throw new Error(`editor HTTP ${res.status}`);
  const raw = await res.json();
  const responseText = raw?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!responseText) throw new Error('editor returned empty response');
  const parsed = JSON.parse(responseText);
  return typeof parsed.corrected === 'string' ? parsed.corrected : null;
}

// Game schemas were written for Gemini's responseSchema, which accepts
// uppercase type names ("OBJECT", "STRING", ...). JSON Schema (and thus
// Claude's tool input_schema) requires lowercase. Walk the schema tree and
// lowercase any `type` string values before handing to Claude.
function normalizeSchemaForClaude(node) {
  if (Array.isArray(node)) {
    return node.map(normalizeSchemaForClaude);
  }
  if (node !== null && typeof node === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(node)) {
      if (key === 'type' && typeof value === 'string') {
        out[key] = value.toLowerCase();
      } else {
        out[key] = normalizeSchemaForClaude(value);
      }
    }
    return out;
  }
  return node;
}

async function callClaude({ prompt, schema, systemPrompt, model }) {
  const claudeModel = model || CLAUDE_MODEL;
  if (!anthropic) {
    const err = new Error('Claude not configured on this proxy');
    err.status = 503;
    throw err;
  }
  const createParams = {
    model: claudeModel,
    max_tokens: 2000,
    tools: [
      {
        name: 'respond',
        description: 'Submit the structured response that matches the requested schema.',
        input_schema: normalizeSchemaForClaude(schema),
      },
    ],
    tool_choice: { type: 'tool', name: 'respond' },
    messages: [{ role: 'user', content: prompt }],
  };
  if (systemPrompt) {
    createParams.system = [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }];
  }
  const message = await anthropic.messages.create(createParams, { timeout: UPSTREAM_TIMEOUT_MS });

  const toolUse = message.content.find((b) => b.type === 'tool_use');
  if (!toolUse || typeof toolUse.input !== 'object') {
    throw new Error('Claude did not emit a structured tool_use block');
  }
  const usage = message.usage;
  const cacheHit = usage?.cache_read_input_tokens > 0 ? `${usage.cache_read_input_tokens}tok` : 'miss';
  return { model: claudeModel, data: toolUse.input, cacheHit, tokens: { in: usage?.input_tokens || 0, out: usage?.output_tokens || 0 } };
}

async function callGemini({ prompt, schema, systemPrompt, model }) {
  const geminiModel = model || GEMINI_MODEL;
  if (!GEMINI_API_KEY) {
    const err = new Error('Gemini not configured on this proxy');
    err.status = 503;
    throw err;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const geminiBody = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: schema,
        temperature: 0.8,
      },
    };
    if (systemPrompt) geminiBody.systemInstruction = { parts: [{ text: systemPrompt }] };
    const upstream = await fetch(geminiUrl(geminiModel), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(geminiBody),
      signal: controller.signal,
    });
    const body = await upstream.json();
    if (!upstream.ok) {
      const err = new Error(body?.error?.message || 'Gemini upstream error');
      err.status = upstream.status;
      throw err;
    }
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini returned an empty response');
    }
    const usageMetadata = body?.usageMetadata || {};
    const cachedTokens = usageMetadata.cachedContentTokenCount || 0;
    return {
      model: geminiModel,
      data: JSON.parse(text),
      cacheHit: cachedTokens > 0 ? `${cachedTokens}tok` : null,
      tokens: {
        in: usageMetadata.promptTokenCount || 0,
        out: usageMetadata.candidatesTokenCount || 0,
        thoughts: usageMetadata.thoughtsTokenCount || 0,
        total: usageMetadata.totalTokenCount || 0,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

app.listen(PORT, () => {
  const claudeInfo = anthropic ? CLAUDE_MODEL : 'disabled';
  const geminiInfo = GEMINI_API_KEY ? GEMINI_MODEL : 'disabled';
  console.log(
    `adventure-proxy listening on :${PORT} | default=${DEFAULT_PROVIDER} | claude=${claudeInfo} | gemini=${geminiInfo}`,
  );
});
