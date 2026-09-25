/* eslint-disable @typescript-eslint/no-floating-promises -- node:test registration calls intentionally return promises. */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, describe, it } from 'node:test'

import {
  CHECK_NAMES,
  evaluateGate,
  parseThresholds,
  parseTranscript,
  runChecks,
  TURN_CHECKS,
  UsageError,
  type Totals,
  type Turn,
} from '../../scripts/eval/lib'

// Synthetic transcripts in the Markdown shape scripts/playtest.ts writes.

const ET_SCENE =
  'Öö on vaikne ja tuul liigutab puude oksi. Te seisate vana maja ees, kus aknad on ammu katki. Keegi on siin hiljuti käinud, sest mudas on värsked jäljed. Kaugelt kostab hääl, mis kõlab nagu keegi hüüaks teie nimesid.'
const EN_SCENE =
  'The night is quiet and the wind moves the branches. You stand in front of an old house whose windows broke long ago. Someone was here recently, the mud holds fresh prints. A voice carries from far away, as if someone were calling your names.'

type TurnSpec = {
  scene?: string
  choices?: string[]
  apiError?: boolean
}

const COSTLY = [
  'Läheme sisse  _(cost: Oht:-1)_',
  'Jääme ootama  _(cost: Aeg:-1, Oht:+1)_',
  'Hüüame vastu  _(cost: Saladus:-1)_',
]

function transcript(language: string | null, turns: TurnSpec[]): string {
  const lines = [
    '# Playtest transcript',
    '',
    '| Field | Value |',
    '|---|---|',
    ...(language ? [`| Language | ${language} |`] : []),
    '| Provider | gemini |',
    '',
    '## Story generation',
    '',
  ]
  turns.forEach((t, i) => {
    lines.push(`## Turn ${i + 1} / ${turns.length}`, '', '- **Phase**: rising', '')
    if (t.apiError) {
      lines.push('**API error**: HTTP 502: <html>', '')
      return
    }
    lines.push('**Scene:**', '', `> ${t.scene ?? ET_SCENE}`, '', '**Choices:**')
    for (const [n, c] of (t.choices ?? COSTLY).entries()) {
      lines.push(`- ${n + 1}. ${c}`)
    }
    lines.push('')
  })
  return lines.join('\n')
}

function turn(overrides: Partial<Turn>): Turn {
  return {
    number: 1,
    phase: 'rising',
    scene: ET_SCENE,
    choices: parseTranscript(transcript('et', [{}]), 'x.md').turns[0]!.choices,
    apiError: false,
    ...overrides,
  }
}

function run(name: string, t: Turn) {
  const check = TURN_CHECKS.find((c) => c.name === name)
  assert.ok(check)
  return check.run(t)
}

describe('eval parser', () => {
  it('reads language, turns, choices and costs', () => {
    const t = parseTranscript(transcript('et', [{}, {}]), 'a.md')
    assert.equal(t.file, 'a.md')
    assert.equal(t.language, 'et')
    assert.equal(t.provider, 'gemini')
    assert.equal(t.turns.length, 2)
    const first = t.turns[0]!
    assert.equal(first.phase, 'rising')
    assert.equal(first.scene, ET_SCENE)
    assert.equal(first.apiError, false)
    assert.deepEqual(first.choices.map((c) => c.text), [
      'Läheme sisse',
      'Jääme ootama',
      'Hüüame vastu',
    ])
    assert.deepEqual(first.choices[1]!.costs, [
      { param: 'Aeg', delta: -1 },
      { param: 'Oht', delta: 1 },
    ])
  })

  it('marks an API-error turn and reports a missing Language row', () => {
    const t = parseTranscript(transcript(null, [{}, { apiError: true }]), 'b.md')
    assert.equal(t.language, 'unknown')
    assert.equal(t.turns[1]!.apiError, true)
    assert.equal(t.turns[1]!.scene, null)
    assert.equal(t.turns[1]!.choices.length, 0)
  })
})

describe('eval checks', () => {
  it('scene_length', () => {
    assert.equal(run('scene_length', turn({})).pass, true)
    assert.equal(run('scene_length', turn({ scene: 'Liiga lühike.' })).pass, false)
    assert.equal(run('scene_length', turn({ scene: 'ä'.repeat(1001) })).pass, false)
  })

  it('choices_count', () => {
    const base = turn({})
    assert.equal(run('choices_count', base).pass, true)
    assert.equal(run('choices_count', turn({ choices: base.choices.slice(0, 2) })).pass, false)
    assert.equal(run('choices_count', turn({ choices: [] })).pass, true)
  })

  it('choice_has_cost', () => {
    assert.equal(run('choice_has_cost', turn({})).pass, true)
    const free = turn({
      choices: [{ index: 2, text: 'Tasuta', costs: [{ param: 'Oht', delta: 1 }] }],
    })
    const r = run('choice_has_cost', free)
    assert.equal(r.pass, false)
    assert.match(r.detail ?? '', /#2/)
  })

  it('estonian_markers', () => {
    assert.equal(run('estonian_markers', turn({})).pass, true)
    assert.equal(run('estonian_markers', turn({ scene: EN_SCENE })).pass, false)
  })

  it('runs estonian_markers only on et transcripts', () => {
    const { totals } = runChecks([parseTranscript(transcript('en', [{ scene: EN_SCENE }]), 'en.md')])
    assert.equal('estonian_markers' in totals, false)
    assert.equal(totals.scene_length?.pass, 1)
  })

  it('excludes API-error turns from every denominator', () => {
    const t = parseTranscript(transcript('et', [{}, { apiError: true }]), 'c.md')
    const { totals, errorTurns } = runChecks([t])
    assert.equal(errorTurns, 1)
    for (const name of CHECK_NAMES) {
      assert.deepEqual(totals[name], { pass: 1, fail: 0 })
    }
  })
})

describe('eval thresholds', () => {
  it('parses a default and per-check overrides', () => {
    assert.deepEqual(parseThresholds(['0.95', 'choice_has_cost=0.75'], CHECK_NAMES), {
      default: 0.95,
      perCheck: { choice_has_cost: 0.75 },
    })
    assert.deepEqual(parseThresholds(['scene_length=1', 'choices_count=.5'], CHECK_NAMES), {
      perCheck: { scene_length: 1, choices_count: 0.5 },
    })
  })

  for (const bad of [
    [''],
    ['abc'],
    ['1.5'],
    ['-0.1'],
    ['nope=0.5'],
    ['scene_length='],
    ['0.9', '0.8'],
    ['scene_length=0.5', 'scene_length=0.6'],
  ]) {
    it(`rejects ${JSON.stringify(bad)}`, () => {
      assert.throws(() => parseThresholds(bad, CHECK_NAMES), UsageError)
    })
  }
})

describe('eval gate', () => {
  const totals: Totals = {
    scene_length: { pass: 3, fail: 1 },
    choice_has_cost: { pass: 2, fail: 2 },
  }

  it('passes at the exact boundary (3/4 at 0.75)', () => {
    assert.deepEqual(evaluateGate(totals, { perCheck: { scene_length: 0.75 } }), [])
  })

  it('breaches below the bound, with per-check override over the default', () => {
    const breaches = evaluateGate(totals, { default: 0.5, perCheck: { scene_length: 0.8 } })
    assert.deepEqual(breaches.map((b) => b.check), ['scene_length'])
  })

  it('breaches when a named check has no samples', () => {
    const breaches = evaluateGate(totals, { perCheck: { estonian_markers: 0.5 } })
    assert.deepEqual(breaches.map((b) => b.check), ['estonian_markers'])
  })

  it('does not breach an unnamed check without samples', () => {
    assert.deepEqual(evaluateGate(totals, { default: 0.5, perCheck: {} }), [])
  })

  it('breaches when zero checkable turns remain', () => {
    const breaches = evaluateGate({}, { default: 0, perCheck: {} })
    assert.equal(breaches.length, 1)
    assert.equal(breaches[0]!.check, undefined)
  })
})

describe('eval CLI', () => {
  const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
  const checkTs = join(repoRoot, 'scripts', 'eval', 'check.ts')
  let dir = ''
  let errorsOnly = ''
  let noLanguage = ''
  let empty = ''
  let root = ''

  before(() => {
    root = mkdtempSync(join(tmpdir(), 'eval-test-'))
    dir = join(root, 'ok')
    errorsOnly = join(root, 'errors')
    noLanguage = join(root, 'nolang')
    empty = join(root, 'empty')
    for (const d of [dir, errorsOnly, noLanguage, empty]) {
      mkdirSync(d)
    }
    // 3 of 4 turns have a free choice: choice_has_cost is 1/4.
    const free = ['A  _(cost: Oht:+1)_', 'B  _(cost: Aeg:-1)_', 'C  _(cost: Oht:-1)_']
    writeFileSync(
      join(dir, 'a.md'),
      transcript('et', [{}, { choices: free }, { choices: free }, { choices: free }, { apiError: true }]),
    )
    writeFileSync(join(errorsOnly, 'a.md'), transcript('et', [{ apiError: true }]))
    writeFileSync(join(noLanguage, 'a.md'), transcript(null, [{}]))
  })

  after(() => rmSync(root, { recursive: true, force: true }))

  function cli(...args: string[]) {
    return spawnSync(process.execPath, ['--import', 'tsx', checkTs, ...args], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
  }

  it('exits 0 report-only and when the gate passes', () => {
    assert.equal(cli(`--dir=${dir}`).status, 0)
    const r = cli(`--dir=${dir}`, '--threshold=0.9', '--threshold=choice_has_cost=0.25')
    assert.equal(r.status, 0, r.stdout + r.stderr)
    assert.match(r.stdout, /1 API-error turns excluded/)
    assert.match(r.stdout, /Gate: PASS/)
  })

  it('exits 1 when a check is below its bound', () => {
    const r = cli(`--dir=${dir}`, '--threshold=choice_has_cost=0.5')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /Gate: FAIL - choice_has_cost 1\/4 < 0\.5/)
  })

  it('exits 1 when no checkable turns remain', () => {
    const r = cli(`--dir=${errorsOnly}`, '--threshold=0')
    assert.equal(r.status, 1, r.stdout + r.stderr)
    assert.match(r.stdout, /no checkable turns/)
  })

  for (const args of [
    ['--bogus'],
    ['positional'],
    ['--threshold'],
    ['--threshold=nope=0.5'],
    ['--threshold='],
    ['--dir=/nonexistent-eval-dir'],
    ['--dir='],
  ]) {
    it(`exits 2 on ${args.join(' ')}`, () => {
      assert.equal(cli(`--dir=${dir}`, ...args).status, 2)
    })
  }

  it('exits 2 on a directory without transcripts', () => {
    assert.equal(cli(`--dir=${empty}`).status, 2)
  })

  it('exits 2 when gating a transcript without a Language row', () => {
    assert.equal(cli(`--dir=${noLanguage}`).status, 0)
    assert.equal(cli(`--dir=${noLanguage}`, '--threshold=0').status, 2)
  })
})
