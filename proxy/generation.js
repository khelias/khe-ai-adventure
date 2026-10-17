// Orchestration of one /generate request after validation: the provider call,
// the turn-contract retries and the Estonian editor pass, all inside one
// request deadline. Kept out of server.js so unit tests can drive it with a
// mocked upstream.

function createDeadline(totalMs, { now = Date.now } = {}) {
  const controller = new AbortController();
  const endsAt = now() + totalMs;
  const timer = setTimeout(() => controller.abort(), totalMs);
  return {
    signal: controller.signal,
    remaining: () => Math.max(0, endsAt - now()),
    clear: () => clearTimeout(timer),
  };
}

function abortError() {
  const err = new Error('request deadline reached');
  err.name = 'AbortError';
  return err;
}

// Settles no later than the signal aborts, even when the wrapped call ignores
// the signal.
function withSignal(promise, signal) {
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortError());
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    // Always attached, so a late rejection of the abandoned call is handled.
    promise.then(
      (value) => { signal.removeEventListener('abort', onAbort); resolve(value); },
      (err) => { signal.removeEventListener('abort', onAbort); reject(err); },
    );
  });
}

function isTurnShape(result) {
  return Boolean(result?.data) && typeof result.data.scene === 'string' && Array.isArray(result.data.choices);
}

// A turn-shaped response may arrive with a malformed `choices` field (object,
// null, or even a string) if the model drifts off-schema at climax / gameOver
// moments. Normalise so frontend `.map()` and playtest `.entries()` don't crash.
function normalizeTurnChoices(result) {
  if (result?.data && typeof result.data.scene === 'string' && !Array.isArray(result.data.choices)) {
    const type = typeof result.data.choices;
    result.data.choices = [];
    return type;
  }
  return null;
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

// Warn in logs if any choice has no cost (all expectedChanges zero/positive)
// or if a choice is missing expectedChanges entirely. Does not block — the AI
// self-check is primary; this is telemetry so we can spot drift.
function logChoiceCostViolations(turn, provider) {
  const violations = getChoiceCostViolations(turn);
  if (violations.length > 0) {
    console.warn(`choice-cost violations (provider=${provider}): ${violations.join(' | ')}`);
  }
}

// Re-asks the model once per reminder while `violationsOf(result)` is
// non-empty. A failed retry keeps the previous result. A retry is not started
// when the deadline leaves less than `minRetryMs`: it would mostly be aborted,
// still billed, and take the editor pass's time.
async function retryContract({ name, result, reminders, violationsOf, promptFor, call, deadline, minRetryMs, onRetry, onFailure }) {
  let attempts = 0;
  for (const reminder of reminders) {
    const violations = violationsOf(result);
    if (violations.length === 0) break;
    const left = deadline.remaining();
    if (left <= 0 || left < minRetryMs) {
      console.warn(`${name} retry skipped: ${left}ms left of the request deadline`);
      break;
    }
    attempts += 1;
    onRetry(attempts, violations);
    try {
      const retryResult = await call(promptFor(reminder, violations));
      normalizeTurnChoices(retryResult);
      result = retryResult;
    } catch (e) {
      onFailure(attempts, e);
    }
  }
  return { result, attempts };
}

// Schema-contract retry: turn-shaped responses MUST have either
// choices.length === 3 OR gameOver === true. Providers sometimes drift and
// emit neither — most often on tense reveal scenes where the model
// "feels" the turn has concluded. Without fallback, the game freezes.
//
// Strategy: two retries with escalating reminders, then server-side
// coercion (force gameOver=true so the client shows a finale rather
// than a blank choices panel).
const EMPTY_CHOICES_REMINDERS = [
  '\n\n⚠ SCHEMA CONTRACT: Your previous attempt returned an empty `choices` array with `gameOver: false`. This is not a valid response — the game cannot continue without either 3 choices OR gameOver=true. Retry now: output EXACTLY 3 choices that advance the story, OR set gameOver=true with a full gameOverText.',
  '\n\n⚠ FINAL ATTEMPT: The previous TWO responses returned empty choices with gameOver=false. This will FREEZE THE GAME for the players at the table. You have ONE job right now: either produce 3 concrete choices that let play continue, OR commit to gameOver=true and write a full 3-5 paragraph gameOverText that concludes the scene. Choosing one of these is a REQUIREMENT, not a preference. Do not return empty choices again.',
];
const CHOICE_COST_REMINDERS = [
  '\n\n⚠ CHOICE COST CONTRACT: Your previous response offered at least one choice with no real downside. Every continuing-turn choice MUST include at least one negative `expectedChanges` entry. A choice may also improve something, but no option can be all upside. Retry now with exactly 3 choices; each choice has at least one negative delta that clearly follows from the action.',
  '\n\n⚠ FINAL CHOICE-COST ATTEMPT: The offered choices still had free/all-upside options. This breaks the game economy. Rewrite the choices only by producing a full valid turn response: exactly 3 choices, and every choice includes at least one negative `expectedChanges` entry. Keep choice text free of character names.',
];

const isEmptyTurnContract = (result) =>
  isTurnShape(result) && result.data.choices.length === 0 && result.data.gameOver !== true;

const choiceCostContractViolations = (result) =>
  isTurnShape(result) && result.data.gameOver !== true && result.data.choices.length > 0
    ? getChoiceCostViolations(result.data)
    : [];

// Turn responses have { scene, choices, parameters, gameOver }. For those:
//   1) Normalize malformed choice arrays.
//   2) Retry invalid empty-choice / free-choice contracts.
//   3) If language is Estonian, run the player-facing text through the editor.
// Every provider call and the editor pass share `deadline`.
async function runGeneration({ callOnce, editTurn, editStructured, editorEnabled, language, provider, deadline, minRetryMs }) {
  const call = (extraPrompt = '') => withSignal(callOnce(extraPrompt, deadline.signal), deadline.signal);

  let result = await call();
  const coercedType = normalizeTurnChoices(result);
  if (coercedType) {
    console.warn(`turn response has non-array choices (type=${coercedType}, provider=${provider}); coerced to []`);
  }

  const emptyChoices = await retryContract({
    result,
    name: 'empty-choices',
    reminders: EMPTY_CHOICES_REMINDERS,
    violationsOf: (r) => (isEmptyTurnContract(r) ? ['empty choices with gameOver=false'] : []),
    promptFor: (reminder) => reminder,
    call,
    deadline,
    minRetryMs,
    onRetry: (attempt) => console.warn(`empty-choices contract violation attempt ${attempt} (provider=${provider}); retrying`),
    onFailure: (attempt, e) => console.warn(`retry ${attempt} failed: ${e.message || e}`),
  });
  result = emptyChoices.result;

  // Coercion below ends the game. When the deadline, not the model, stopped
  // the retries, a 504 lets the table retry the turn instead.
  if (isEmptyTurnContract(result) && (emptyChoices.attempts < EMPTY_CHOICES_REMINDERS.length || deadline.signal.aborted)) {
    throw abortError();
  }

  // Last-resort coercion: if we still have empty choices + gameOver=false
  // after all retries, force gameOver=true and synthesize a minimal
  // gameOverText from the scene. Better an abrupt ending than a freeze.
  let coercedGameOver = false;
  if (isEmptyTurnContract(result)) {
    coercedGameOver = true;
    console.warn(`coercing gameOver=true after ${emptyChoices.attempts} retries failed (provider=${provider})`);
    result.data.gameOver = true;
    if (!result.data.gameOverText || typeof result.data.gameOverText !== 'string' || result.data.gameOverText.trim().length < 20) {
      result.data.gameOverText = (result.data.scene || '') + '\n\n' + (language === 'et'
        ? 'Lugu katkeb siin — jutustaja jäi sõnadega kimbatusse. Mis edasi juhtus, jääb teie kujutlusvõimesse.'
        : 'The story breaks off here — the narrator ran out of words. What happens next is yours to imagine.');
    }
  }

  const choiceCost = await retryContract({
    result,
    name: 'choice-cost',
    reminders: CHOICE_COST_REMINDERS,
    violationsOf: choiceCostContractViolations,
    promptFor: (reminder, violations) => `${reminder}\n\nViolations to fix:\n- ${violations.join('\n- ')}`,
    call,
    deadline,
    minRetryMs,
    onRetry: (attempt, violations) =>
      console.warn(`choice-cost contract violation attempt ${attempt} (provider=${provider}): ${violations.join(' | ')}; retrying`),
    onFailure: (attempt, e) => console.warn(`choice-cost retry ${attempt} failed: ${e.message || e}`),
  });
  result = choiceCost.result;

  const turnShape = isTurnShape(result);
  if (turnShape) logChoiceCostViolations(result.data, provider);

  let editorMs = 0;
  let editorApplied = false;
  let editorTokens = null;
  if (editorEnabled) {
    if (deadline.signal.aborted) {
      console.warn('editor-pass skipped: request deadline reached');
    } else {
      const te = Date.now();
      try {
        const pass = turnShape
          ? await editTurn(result.data, deadline.signal)
          : await editStructured(result.data, deadline.signal);
        editorApplied = pass.applied;
        editorTokens = pass.tokens;
      } catch (e) {
        console.warn(`${turnShape ? 'editor-pass' : 'editor-pass structured text'} failed (continuing with unedited): ${e.message || e}`);
      }
      editorMs = Date.now() - te;
    }
  }

  return {
    result,
    retried: emptyChoices.attempts,
    costRetried: choiceCost.attempts,
    coercedGameOver,
    editorApplied,
    editorMs,
    editorTokens,
  };
}

module.exports = {
  createDeadline,
  withSignal,
  normalizeTurnChoices,
  retryContract,
  runGeneration,
};
