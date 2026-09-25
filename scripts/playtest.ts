#!/usr/bin/env tsx
// Playtest harness: simulates the frontend, plays a full game through the
// proxy API, writes a Markdown transcript.
//
// Imports live prompts + engine from src/ — no duplication. When prompt
// modules or engine.ts change, this runner follows automatically.
//
// Run:
//   npx tsx scripts/playtest.ts --duration=Short --strategy=balanced
//
// See scripts/README.md for full options.

import fs from 'node:fs'
import path from 'node:path'
import { createHmac } from 'node:crypto'
import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'

import {
  storyGenerationPrompt,
  storyGenerationSchema,
  turnPrompt,
  turnSchema,
  getStoryPhase,
  type TurnResponse,
} from '../src/game/prompts'
import {
  applyParameterChanges,
  findBrokenParameters,
  findJustBrokenParameters,
  isUnrecoverable,
  durationToMaxTurns,
} from '../src/game/engine'
import { assignSecrets, evaluateAll } from '../src/game/secrets'
import { LANG_PACKS } from '../src/i18n/lang-packs'
import type {
  Choice,
  ContextInput,
  Duration,
  Genre,
  Language,
  Parameter,
  Provider,
  Role,
  Story,
  Vibe,
} from '../src/game/types'

// ---------- CLI ----------

const { values } = parseArgs({
  options: {
    genre: { type: 'string', default: 'Zombies' },
    duration: { type: 'string', default: 'Medium' },
    players: { type: 'string', default: '3' },
    language: { type: 'string', default: 'et' },
    provider: { type: 'string', default: 'gemini' },
    model: { type: 'string', default: '' },
    strategy: { type: 'string', default: 'balanced' },
    endpoint: { type: 'string', default: 'https://games.khe.ee/adventure/api/generate' },
    location: { type: 'string', default: '' },
    'players-desc': { type: 'string', default: '' },
    vibe: { type: 'string', default: '' },
    'inside-joke': { type: 'string', default: '' },
    out: { type: 'string' },
    'skip-parametric-end': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false, short: 'h' },
  },
})

if (values.help) {
  console.log(`
Usage: npx tsx scripts/playtest.ts [options]

  --genre=<Zombies|Fantasy|Sci-Fi|Thriller|Cyberpunk|Post-Apocalyptic>
                              Default: Zombies
  --duration=<Short|Medium|Long>   Default: Medium   (8 / 15 / 20 turns)
  --players=<1..6>            Default: 3
  --language=<et|en>          Default: et
  --provider=<claude|gemini>  Default: gemini
  --model=<id>                Override the provider's model for this run.
                              Must be on the proxy's MODEL_ALLOWLIST.
  --strategy=<first|random|balanced|protect-threat>
                              Default: balanced  (see README)
  --endpoint=<url>            Default: https://games.khe.ee/adventure/api/generate
  --location=<text>           Group context: physical setting. Default: empty
  --players-desc=<text>       Group context: who is at the table. Default: empty
  --vibe=<text>               Group context: tone steer. Default: empty
  --inside-joke=<text>        Group context: easter egg. Default: empty
  --skip-parametric-end       Continue past engine's auto-end to see climax/resolution
  --out=<path>                Transcript output. Default: playtest-transcripts/<...>.md
  --help, -h                  Show this help
`)
  process.exit(0)
}

type StrategyName = 'first' | 'random' | 'balanced' | 'protect-threat'

const genre = values.genre as Genre
const duration = values.duration as Duration
const players = Number(values.players)
const language = values.language as Language
const provider = values.provider as Provider
const modelOverride = values.model ?? ''
const strategy = values.strategy as StrategyName
const endpoint = values.endpoint
const skipParametricEnd = Boolean(values['skip-parametric-end'])
const maxTurns = durationToMaxTurns(duration)
const apiSecret = process.env.API_SECRET || process.env.VITE_API_SECRET || ''

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const transcriptsDir = path.join(repoRoot, 'playtest-transcripts')
fs.mkdirSync(transcriptsDir, { recursive: true })
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
const outPath =
  values.out ??
  path.join(transcriptsDir, `${timestamp}__${genre}-${duration}-${strategy}${skipParametricEnd ? '-skipend' : ''}.md`)

// ---------- API ----------

async function callAI<T>(
  prompt: string,
  schema: unknown,
  providerArg: Provider,
  systemPrompt?: string,
): Promise<{ data: T; model: string }> {
  const body: Record<string, unknown> = { prompt, schema, provider: providerArg, language }
  if (modelOverride) body.model = modelOverride
  if (systemPrompt) body.systemPrompt = systemPrompt
  const payload = JSON.stringify(body)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    // Proxy's origin allowlist permits https://games.khe.ee; the playtest
    // script identifies itself as that origin so it isn't rejected as abuse.
    Origin: 'https://games.khe.ee',
  }
  if (apiSecret) {
    headers['x-adventure-signature'] = createHmac('sha256', apiSecret)
      .update(payload)
      .digest('hex')
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: payload,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 400)}`)
  }
  const json = (await res.json()) as { data: T; model: string }
  return json
}

// ---------- Strategies ----------

function pickChoice(choices: Choice[], parameters: Parameter[], strat: StrategyName): Choice {
  if (choices.length === 0) throw new Error('No choices to pick from')
  if (strat === 'first') return choices[0]!
  if (strat === 'random') return choices[Math.floor(Math.random() * choices.length)]!
  if (strat === 'protect-threat') {
    // Heuristic: THREAT is generated last in story gen. Rank by most +change on it.
    const threatName = parameters[parameters.length - 1]!.name
    return [...choices].sort((a, b) => threatChange(b, threatName) - threatChange(a, threatName))[0]!
  }
  // balanced: score by change × criticality weight (closer to worst = weightier)
  return [...choices].sort((a, b) => scoreChoice(b, parameters) - scoreChoice(a, parameters))[0]!
}

function threatChange(c: Choice, name: string): number {
  return c.expectedChanges?.find((ec) => ec.name === name)?.change ?? 0
}

function scoreChoice(choice: Choice, parameters: Parameter[]): number {
  const changes = choice.expectedChanges ?? []
  let score = 0
  for (const p of parameters) {
    const ch = changes.find((c) => c.name === p.name)?.change ?? 0
    const criticality = p.currentStateIndex / Math.max(1, p.states.length - 1)
    score += ch * (1 + criticality * 3)
  }
  return score
}

// ---------- Transcript ----------

function log(line = '') {
  console.log(line)
  fs.appendFileSync(outPath, line + '\n')
}

function describeContext(ctx: ContextInput): string {
  const parts = [
    ctx.location ? `location="${ctx.location}"` : null,
    ctx.playersDesc ? `playersDesc="${ctx.playersDesc}"` : null,
    ctx.vibe ? `vibe="${ctx.vibe}"` : null,
    ctx.insideJoke ? `insideJoke="${ctx.insideJoke}"` : null,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : '(empty)'
}

function paramsLine(parameters: Parameter[]): string {
  return parameters
    .map((p) => `${p.name}=${p.currentStateIndex + 1}/4 "${p.states[p.currentStateIndex]}"`)
    .join(' · ')
}

// ---------- Main ----------

async function main() {
  fs.writeFileSync(outPath, '')
  log(`# Playtest transcript`)
  log('')
  log(`| Field | Value |`)
  log(`|---|---|`)
  log(`| When | ${new Date().toISOString()} |`)
  log(`| Genre | ${genre} |`)
  log(`| Duration | ${duration} (${maxTurns} turns) |`)
  log(`| Players | ${players} |`)
  log(`| Language | ${language} |`)
  log(`| Provider | ${provider} |`)
  log(`| Model | ${modelOverride || '(proxy default)'} |`)
  log(`| Strategy | ${strategy} |`)
  log(`| Skip parametric end | ${skipParametricEnd} |`)
  log(`| Endpoint | ${endpoint} |`)
  const ctx: ContextInput = {
    location: values.location ?? '',
    playersDesc: values['players-desc'] ?? '',
    vibe: (values.vibe ?? '') as Vibe,
    insideJoke: values['inside-joke'] ?? '',
  }
  log(`| Group context | ${describeContext(ctx)} |`)
  log('')

  // ---- Story generation ----
  log(`## Story generation`)
  log('')
  const t0 = Date.now()
  const storyPrompt = storyGenerationPrompt({ players, genre, duration, language, context: ctx })
  const storyResp = await callAI<{ stories: Story[] }>(storyPrompt, storyGenerationSchema, provider)
  const story = storyResp.data.stories[0]
  log(`_model: ${storyResp.model} · ${Date.now() - t0}ms_`)
  log('')
  if (!story) throw new Error('Story generation returned no stories')
  log(`### ${story.title}`)
  log('')
  log(`> ${story.summary}`)
  log('')
  log(`**Characters:**`)
  for (const r of story.roles) {
    const anchor = r.abilityParameter ? `; anchor: ${r.abilityParameter}` : ''
    log(`- **${r.name}** — ${r.description}  _(ability: ${r.ability}${anchor})_`)
  }
  log('')
  log(`**Parameters:**`)
  for (const p of story.parameters) {
    const meta = [
      p.archetype ? `archetype=${p.archetype}` : null,
    ].filter(Boolean).join(', ')
    log(`- **${p.name}**${meta ? ` _[${meta}]_` : ''}: ${p.states.join(' → ')}`)
  }
  log('')

  // ---- State init ----
  let roles: Role[] = story.roles.map((r, i) => ({ ...r, id: i, used: false }))
  let parameters: Parameter[] = story.parameters.map((p) => ({ ...p, currentStateIndex: 0 }))
  const recentScenes: string[] = []
  let nextChoice = LANG_PACKS[language].gameStartChoice
  let lastPicked: Choice | null = null
  // Mirror live-app state: the choices the AI offered LAST turn (= the set
  // the simulator just picked from). Sent to the next turn's prompt so the
  // AI can avoid paraphrasing its own previous shape.
  let lastTurnChoices: Choice[] = []
  let endReason: 'narrative' | 'parametric' | 'maxTurns' | 'api-error' = 'maxTurns'

  // ---- Simulated secrets (client-only in prod; here we mirror the logic
  // so the transcript shows what the room dynamic would have looked like) ----
  const secrets = assignSecrets(roles, parameters)
  log(`**Secrets (simulated):**`)
  for (const s of secrets) {
    const owner = roles.find((r) => r.id === s.ownerRoleId)
    const tail = s.paramName ? ` · "${s.paramName}"` : ''
    log(`- ${owner?.name ?? `role${s.ownerRoleId}`} → **${s.archetype}**${tail}`)
  }
  log('')

  // ---- Turn loop ----
  for (let t = 1; t <= maxTurns; t++) {
    log(`## Turn ${t} / ${maxTurns}`)
    log('')
    log(`- **Phase**: ${getStoryPhase(t, maxTurns)}`)
    log(`- **State**: ${paramsLine(parameters)}`)
    log(`- **Last choice**: ${nextChoice}`)
    log('')

    const isFinalTurn = t >= maxTurns
    const { system, user } = turnPrompt({
      currentTurn: t,
      maxTurns,
      genre,
      title: story.title,
      summary: story.summary,
      parameters,
      roles,
      recentScenes,
      choiceText: nextChoice,
      lastChoiceCost: lastPicked?.expectedChanges,
      lastTurnChoices,
      language,
      context: ctx,
      // Mirror the live app: on the final turn, send forceEnd='narrative-final'
      // so the simulator exercises the same code path users will hit. Without
      // it, the harness's diagnostics drift from real game-end behavior.
      forceEnd: isFinalTurn ? 'narrative-final' : undefined,
    })

    const turnStart = Date.now()
    let resp: { data: TurnResponse; model: string }
    try {
      resp = await callAI<TurnResponse>(user, turnSchema, provider, system)
    } catch (err) {
      log(`**API error**: ${(err as Error).message}`)
      endReason = 'api-error'
      break
    }
    const r = resp.data
    log(`_model: ${resp.model} · ${Date.now() - turnStart}ms_`)
    log('')
    log(`**Scene:**`)
    log('')
    log(`> ${r.scene.replace(/\n+/g, '\n> ')}`)
    log('')
    const aiDeltas = Array.isArray(r.parameters) ? r.parameters : []
    const appliedDeltas = lastPicked?.expectedChanges ?? aiDeltas
    log(`**Applied deltas** (from picked choice): ${appliedDeltas.map((p) => `${p.name}:${p.change >= 0 ? '+' : ''}${p.change}`).join(', ') || '(none)'}`)
    if (aiDeltas.length > 0 && lastPicked) {
      const aiStr = aiDeltas.map((p) => `${p.name}:${p.change >= 0 ? '+' : ''}${p.change}`).join(', ')
      log(`_AI also echoed:_ ${aiStr}`)
    }
    log('')
    const choices = Array.isArray(r.choices) ? r.choices : []
    if (!Array.isArray(r.choices)) {
      log(`> ⚠ _Model returned non-array \`choices\` (type=${typeof r.choices}) — treated as empty._`)
      log('')
    }
    log(`**Choices:**`)
    if (choices.length === 0) {
      log('_(none)_')
    } else {
      for (const [i, c] of choices.entries()) {
        const cost = (c.expectedChanges ?? [])
          .map((ec) => `${ec.name}:${ec.change >= 0 ? '+' : ''}${ec.change}`)
          .join(', ') || '_none declared_'
        const actorLabel = c.actor !== undefined ? ` _[actor=${c.actor}${typeof c.target === 'number' ? `, target=${c.target}` : ''}]_` : ''
        const ability = c.isAbility ? ` **[ABILITY]**` : ''
        log(`- ${i + 1}.${actorLabel} ${c.text}${ability}  _(cost: ${cost})_`)
      }
    }
    log('')

    if (r.gameOver) {
      log(`### GAME OVER — narrative`)
      log('')
      log(r.gameOverText || '_(no gameOverText provided)_')
      log('')
      endReason = 'narrative'
      break
    }

    recentScenes.push(r.scene)
    if (recentScenes.length > 3) recentScenes.shift()
    // Apply the LAST PICKED choice's declared cost — mirrors actions.ts where
    // the engine honours the choice contract instead of trusting whatever
    // the AI wrote into response.parameters. On turn 1 lastPicked is null,
    // and AI-echoed deltas (aiDeltas) are the only signal — usually empty.
    parameters = applyParameterChanges(parameters, appliedDeltas)

    const justBroke = findJustBrokenParameters(parameters)
    if (justBroke.length > 0) {
      log(`> ⚠ _Phase transition: **${justBroke.map((p) => p.name).join(', ')}** just hit worst state. AI should dramatize the consequence next turn._`)
      log('')
    }

    const broken = findBrokenParameters(parameters)
    if (isUnrecoverable(parameters) && !skipParametricEnd) {
      log(`### UNRECOVERABLE — requesting AI-narrated end`)
      log('')
      log(`Broken parameters: ${broken.map((p) => `**${p.name}** ("${p.states[p.states.length - 1]}")`).join(', ')}`)
      log('')
      // Call the AI once more with forceEnd flag
      const endPrompt = turnPrompt({
        currentTurn: t + 1,
        maxTurns,
        genre,
        title: story.title,
        summary: story.summary,
        parameters,
        roles,
        recentScenes,
        choiceText: choices.length > 0 ? pickChoice(choices, parameters, strategy).text : 'Mäng jätkub.',
        language,
        context: ctx,
        forceEnd: 'unrecoverable',
      })
      try {
        const endResp = await callAI<TurnResponse>(endPrompt.user, turnSchema, provider, endPrompt.system)
        log(`_model: ${endResp.model}_`)
        log('')
        log(`**Final scene:**`)
        log('')
        log(`> ${endResp.data.scene.replace(/\n+/g, '\n> ')}`)
        log('')
        log(`**Game Over text (AI-narrated):**`)
        log('')
        log(endResp.data.gameOverText || '_(no text)_')
        log('')
      } catch (err) {
        log(`**End narration failed**: ${(err as Error).message}`)
      }
      endReason = 'parametric'
      break
    }
    if (broken.length >= 1 && skipParametricEnd) {
      log(`> ℹ _[skip-parametric-end] ${broken.length} param(s) at worst — continuing. (New logic: 2+ needed anyway.)_`)
      log('')
    }

    if (choices.length === 0) {
      log(`> ⚠ _No choices returned and gameOver not set — ending playtest here._`)
      log('')
      endReason = 'api-error'
      break
    }
    const picked = pickChoice(choices, parameters, strategy)
    if (picked.isAbility && typeof picked.actor === 'number') {
      roles = roles.map((role) => (role.id === picked.actor ? { ...role, used: true } : role))
    }
    nextChoice = picked.text
    lastPicked = picked
    // Snapshot the full set the simulator picked from for the next turn's
    // anti-paraphrase block — must capture BEFORE the loop body re-overwrites.
    lastTurnChoices = choices
    log(`**→ Strategy "${strategy}" picks:** ${picked.text}`)
    log('')
    log(`---`)
    log('')
  }

  // ---- End ----
  log(`## End`)
  log('')
  log(`- **Reason**: ${endReason}`)
  log(`- **Final params**: ${paramsLine(parameters)}`)
  log(`- **Abilities used**: ${roles.filter((r) => r.used).map((r) => r.name).join(', ') || 'none'}`)
  log('')

  // ---- Simulated secret outcomes ----
  const gameOverKind = endReason === 'narrative' ? 'narrative' : endReason === 'parametric' ? 'parametric' : null
  const scored = evaluateAll(secrets, { parameters, gameOverKind })
  log(`**Secret outcomes:**`)
  for (const s of scored) {
    const owner = roles.find((r) => r.id === s.ownerRoleId)
    const tail = s.paramName ? ` · "${s.paramName}"` : ''
    const mark = s.result === 'won' ? '🏆 WON' : '✗ lost'
    log(`- ${owner?.name ?? `role${s.ownerRoleId}`} (${s.archetype}${tail}) → **${mark}**`)
  }
  const wins = scored.filter((s) => s.result === 'won').length
  log('')
  log(`Win ratio: ${wins}/${scored.length}`)
  log('')
  console.error(`\nTranscript: ${outPath}`)
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(1)
})
