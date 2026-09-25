/**
 * Deterministic eval — rule-based checks over playtest transcripts.
 *
 * Why deterministic checks first: they are fast, free, reproducible, and
 * encode product invariants that should NEVER break regardless of model
 * choice. They form the bottom of the eval pyramid; LLM-as-judge sits on
 * top later.
 */

// ---------- Types ----------

export type Choice = {
  index: number;
  text: string;
  costs: Array<{ param: string; delta: number }>;
};

export type Turn = {
  number: number;
  phase: string;
  scene: string | null;
  choices: Choice[];
  // playtest.ts logs "**API error**" and stops before any scene or choices.
  apiError: boolean;
};

export type Transcript = {
  file: string;
  language: string;
  provider: string;
  turns: Turn[];
};

export type CheckResult = {
  pass: boolean;
  detail?: string;
};

export type TurnCheck = {
  name: string;
  run: (turn: Turn) => CheckResult;
  etOnly?: boolean;
};

export type Totals = Record<string, { pass: number; fail: number }>;

export type Failure = {
  file: string;
  turn: number;
  check: string;
  detail?: string;
};

export type RunResult = {
  totals: Totals;
  failures: Failure[];
  errorTurns: number;
};

export type Thresholds = {
  default?: number;
  perCheck: Record<string, number>;
};

export type Breach = {
  check?: string;
  detail: string;
};

export class UsageError extends Error {}

// ---------- Parser ----------
// The transcript is Markdown with a stable structure (see playtest.ts).
// We do not need a full Markdown parser; targeted regexes are enough and
// keep the dependency list at zero.

export function parseTranscript(raw: string, file: string): Transcript {
  const language = raw.match(/\| Language \| (\w+) \|/)?.[1] ?? 'unknown';
  const provider = raw.match(/\| Provider \| (\w+) \|/)?.[1] ?? 'unknown';

  // Split by "## Turn N / M" headers. The "## Story generation" and "## End"
  // sections are ignored for now — they need their own checks later.
  const turnBlocks = raw.split(/\n## Turn (\d+) \/ \d+\n/);
  // After split: [preamble, "1", block1, "2", block2, ...]
  const turns: Turn[] = [];
  for (let i = 1; i < turnBlocks.length; i += 2) {
    const num = Number(turnBlocks[i]);
    const body = turnBlocks[i + 1] ?? '';
    turns.push(parseTurn(num, body));
  }

  return { file, language, provider, turns };
}

function parseTurn(number: number, body: string): Turn {
  const phase = body.match(/\*\*Phase\*\*: (\w+)/)?.[1] ?? 'unknown';

  // Scene is the first blockquote after "**Scene:**".
  const scene =
    body.match(/\*\*Scene:\*\*\n\n> ([\s\S]*?)\n\n/)?.[1]?.trim() ?? null;

  // Each choice line: "- 1. <text>  _(cost: Param:+1, Other:-1)_"
  // The "[ABILITY roleIndex=N]" marker may sit before the cost block.
  const choices: Choice[] = [];
  const choiceRegex =
    /^- (\d+)\. (.+?)\s+_\(cost: ([^)]+)\)_\s*$/gm;
  const choiceBlock = body.split(/\*\*Choices:\*\*/)[1] ?? '';
  let m: RegExpExecArray | null;
  while ((m = choiceRegex.exec(choiceBlock)) !== null) {
    const [, idx = '', text = '', costStr = ''] = m;
    const costs = costStr.split(',').map((part) => {
      const [param = '', delta] = part.split(':').map((s) => s.trim());
      return { param, delta: Number(delta) };
    });
    choices.push({ index: Number(idx), text: text.trim(), costs });
  }

  const apiError = /^\*\*API error\*\*/m.test(body);

  return { number, phase, scene, choices, apiError };
}

// ---------- Checks ----------
// One rule per check so failures point at one specific invariant.

function checkSceneLength(turn: Turn): CheckResult {
  // Scenes below ~200 chars feel skeletal; above ~1000 chars hurt
  // pass-the-phone readability. Bounds are heuristic, not contractual.
  const MIN = 200;
  const MAX = 1000;
  if (turn.scene == null) {
    return { pass: true, detail: 'no scene (end?)' };
  }
  const len = turn.scene.length;
  if (len < MIN || len > MAX) {
    return { pass: false, detail: `${len} chars (expected ${MIN}-${MAX})` };
  }
  return { pass: true };
}

function checkChoicesCount(turn: Turn): CheckResult {
  // Product invariant: every turn presents exactly three choices.
  // Exception: terminal turns (game over) legitimately have zero.
  if (turn.choices.length === 0) {
    return { pass: true, detail: 'terminal turn' };
  }
  if (turn.choices.length !== 3) {
    return { pass: false, detail: `got ${turn.choices.length}` };
  }
  return { pass: true };
}

function checkChoiceHasCost(turn: Turn): CheckResult {
  // Product invariant: every choice must cost something. Per engine.ts
  // (the authoritative source for sign semantics), `change = -1` moves a
  // parameter toward its worst state and is therefore THE cost direction.
  // Mirrors proxy/server.js getChoiceCostViolations.
  const offenders = turn.choices.filter(
    (c) => !c.costs.some((cost) => cost.delta < 0),
  );
  if (offenders.length > 0) {
    return {
      pass: false,
      detail: `choices #${offenders.map((o) => o.index).join(',')} have no negative (worsening) delta`,
    };
  }
  return { pass: true };
}

function checkEstonianMarkers(turn: Turn): CheckResult {
  // Cheap proxy for "is this really Estonian": does the scene contain at
  // least one Estonian-specific letter? Real langdetect would be more
  // robust; for v0 this catches the obvious "model slipped into English"
  // failure mode.
  if (turn.scene == null) {
    return { pass: true, detail: 'no scene' };
  }
  if (!/[äöõüÄÖÕÜ]/.test(turn.scene)) {
    return { pass: false, detail: 'no ä/ö/õ/ü letters found' };
  }
  return { pass: true };
}

export const TURN_CHECKS: TurnCheck[] = [
  { name: 'scene_length', run: checkSceneLength },
  { name: 'choices_count', run: checkChoicesCount },
  { name: 'choice_has_cost', run: checkChoiceHasCost },
  { name: 'estonian_markers', run: checkEstonianMarkers, etOnly: true },
];

export const CHECK_NAMES = TURN_CHECKS.map((c) => c.name);

// ---------- Runner ----------

export function runChecks(transcripts: Transcript[]): RunResult {
  const totals: Totals = {};
  const failures: Failure[] = [];
  let errorTurns = 0;

  for (const t of transcripts) {
    for (const turn of t.turns) {
      // An API-error turn has no model output; counting it would pass every
      // check vacuously.
      if (turn.apiError) {
        errorTurns++;
        continue;
      }
      for (const check of TURN_CHECKS) {
        if (check.etOnly && t.language !== 'et') continue;
        const r = check.run(turn);
        const counts = (totals[check.name] ??= { pass: 0, fail: 0 });
        if (r.pass) counts.pass++;
        else {
          counts.fail++;
          failures.push({
            file: t.file,
            turn: turn.number,
            check: check.name,
            detail: r.detail,
          });
        }
      }
    }
  }

  return { totals, failures, errorTurns };
}

// ---------- Gate ----------

const RATIO = /^\d*\.?\d+$/;

function parseRatio(raw: string, label: string): number {
  const value = Number(raw);
  if (!RATIO.test(raw) || value > 1) {
    throw new UsageError(`${label}: ratio must be a number in [0, 1], got "${raw}"`);
  }
  return value;
}

// Values come from `--threshold` repeated: "<ratio>" is the default bound,
// "<check>=<ratio>" bounds one check and overrides the default.
export function parseThresholds(
  values: readonly string[],
  checkNames: readonly string[],
): Thresholds {
  const thresholds: Thresholds = { perCheck: {} };
  for (const value of values) {
    const eq = value.indexOf('=');
    if (eq === -1) {
      if (thresholds.default !== undefined) {
        throw new UsageError('default --threshold given more than once');
      }
      thresholds.default = parseRatio(value, '--threshold');
      continue;
    }
    const name = value.slice(0, eq);
    if (!checkNames.includes(name)) {
      throw new UsageError(
        `unknown check "${name}" in --threshold (known: ${checkNames.join(', ')})`,
      );
    }
    if (name in thresholds.perCheck) {
      throw new UsageError(`--threshold for ${name} given more than once`);
    }
    thresholds.perCheck[name] = parseRatio(value.slice(eq + 1), `--threshold ${name}`);
  }
  return thresholds;
}

export function boundFor(check: string, thresholds: Thresholds): number | undefined {
  return thresholds.perCheck[check] ?? thresholds.default;
}

export function evaluateGate(totals: Totals, thresholds: Thresholds): Breach[] {
  const breaches: Breach[] = [];
  if (Object.keys(totals).length === 0) {
    breaches.push({ detail: 'no checkable turns' });
  }
  for (const [check, { pass, fail }] of Object.entries(totals)) {
    const bound = boundFor(check, thresholds);
    const total = pass + fail;
    // Exact ratio, not the rounded percentage: 3/4 passes a 0.75 bound.
    if (bound !== undefined && pass / total < bound) {
      breaches.push({ check, detail: `${check} ${pass}/${total} < ${bound}` });
    }
  }
  for (const check of Object.keys(thresholds.perCheck)) {
    if (!(check in totals)) {
      breaches.push({ check, detail: `${check} has no samples` });
    }
  }
  return breaches;
}
