/**
 * Entry point for `npm run eval`: reads playtest transcripts and prints
 * per-check pass rates. Checks, parsing and gate logic live in ./lib.ts.
 *
 *   --dir=<path>                transcript directory (default playtest-transcripts/)
 *   --threshold=<ratio>         bound for every check that ran
 *   --threshold=<check>=<ratio> bound for one check, overrides the default
 *
 * Exit codes: 0 pass or report-only, 1 gate failed, 2 usage or input error.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
  boundFor,
  CHECK_NAMES,
  evaluateGate,
  parseThresholds,
  parseTranscript,
  runChecks,
  type Thresholds,
  type Transcript,
} from './lib';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(HERE, '..', '..', 'playtest-transcripts');

type Input = {
  transcripts: Transcript[];
  thresholds: Thresholds | null;
};

// Everything that can fail on bad arguments or a bad directory happens here,
// so it exits 2 instead of surfacing as an uncaught throw (exit 1, which
// would read as a gate failure).
function readInput(): Input {
  const { values } = parseArgs({
    options: {
      dir: { type: 'string' },
      threshold: { type: 'string', multiple: true },
    },
  });

  const thresholds =
    values.threshold === undefined
      ? null
      : parseThresholds(values.threshold, CHECK_NAMES);

  if (values.dir === '') {
    throw new Error('--dir needs a path');
  }
  const dir = values.dir === undefined ? DEFAULT_DIR : resolve(values.dir);
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (files.length === 0) {
    throw new Error(`no .md transcripts in ${dir}`);
  }
  const transcripts = files.map((f) =>
    parseTranscript(readFileSync(join(dir, f), 'utf8'), f),
  );

  if (thresholds) {
    // An unparsed Language row silently drops estonian_markers for that file.
    const unknown = transcripts.filter((t) => t.language === 'unknown');
    if (unknown.length > 0) {
      throw new Error(
        `no Language row parsed in: ${unknown.map((t) => t.file).join(', ')}`,
      );
    }
  }

  return { transcripts, thresholds };
}

function main(): void {
  let input: Input;
  try {
    input = readInput();
  } catch (err) {
    console.error(`eval: ${(err as Error).message}`);
    process.exitCode = 2;
    return;
  }
  const { transcripts, thresholds } = input;

  const { totals, failures, errorTurns } = runChecks(transcripts);

  const excluded = errorTurns > 0 ? ` ${errorTurns} API-error turns excluded.` : '';
  console.log(`\nParsed ${transcripts.length} transcripts.${excluded}\n`);
  console.log('Check summary:');
  const names = [
    ...Object.keys(totals),
    ...Object.keys(thresholds?.perCheck ?? {}).filter((n) => !(n in totals)),
  ];
  for (const name of names) {
    const counts = totals[name] ?? { pass: 0, fail: 0 };
    const total = counts.pass + counts.fail;
    const pct = total === 0 ? 0 : Math.round((counts.pass / total) * 100);
    let line = `  ${name.padEnd(22)} ${counts.pass}/${total} pass (${pct}%)`;
    const bound = thresholds ? boundFor(name, thresholds) : undefined;
    if (bound !== undefined) {
      const ok = total > 0 && counts.pass / total >= bound;
      line += `  >= ${bound} ${ok ? 'ok' : 'FAIL'}`;
    }
    console.log(line);
  }

  if (failures.length === 0) {
    console.log('\nNo failures.');
  } else {
    console.log(`\nFailures (${failures.length}):`);
    for (const f of failures) {
      console.log(`  ${f.file} · turn ${f.turn} · ${f.check}: ${f.detail ?? ''}`);
    }
  }

  if (thresholds) {
    const breaches = evaluateGate(totals, thresholds);
    console.log(
      breaches.length === 0
        ? '\nGate: PASS'
        : `\nGate: FAIL - ${breaches.map((b) => b.detail).join(', ')}`,
    );
    if (breaches.length > 0) process.exitCode = 1;
  }
  console.log();
}

main();
