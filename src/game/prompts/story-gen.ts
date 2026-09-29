import type { ContextInput, Language, Role } from '../types'
import { LANG_PACKS } from '../../i18n/lang-packs'
import { buildToneBlock } from './tone'
import { ARCHETYPE_PALETTE, PARAMETER_CRAFT } from './archetypes'
import { CONTENT_RULES } from './craft'

function buildContextBlock(ctx: ContextInput): string {
  const structural: string[] = []
  if (ctx.location) structural.push(`- Physical setting: "${ctx.location}"`)
  if (ctx.playersDesc) structural.push(`- People in the group: "${ctx.playersDesc}"`)

  const hasStructural = structural.length > 0
  const hasJoke = !!ctx.insideJoke
  if (!hasStructural && !hasJoke) return ''

  const parts: string[] = ['\n## GROUP CONTEXT\n']
  if (hasStructural) {
    parts.push(
      'Story-shaping inputs — fold these into the setting, the people, the mood.\n',
    )
    parts.push(structural.join('\n') + '\n')
  }
  if (hasJoke) {
    parts.push(`### SCENE EASTER EGG (flavor only, NOT story structure)

A small in-joke from the group's day: "${ctx.insideJoke}"

This is decoration, not material. It MUST NOT appear in:
- the title or summary
- any parameter (name, archetype, or state phrase)
- any role (name, description, or ability)

The genre and the player count drive the story's bones. Build those
first as if this easter egg did not exist. The narrator may reference
it lightly later as a passing scene-level wink — but the story must
stand on its own without it.\n`)
  }
  return parts.join('\n')
}

export function storyGenerationPrompt(args: {
  players: number
  genre: string
  duration: string
  language: Language
  context: ContextInput
}): string {
  const { players, genre, duration, language, context } = args
  const contextBlock = buildContextBlock(context)
  const toneBlock = buildToneBlock(context.vibe)
  return `${LANG_PACKS[language].instruction}
${toneBlock}
## TASK

Generate one adventure story for ${players} players in the ${genre}
genre, suitable for a ${duration} duration game. Provide a compelling
title, a vivid 2–3 sentence summary, and exactly ${players} unique roles.

The story needs a clear table objective that can survive most of the game:
reach a place, protect a person, keep a lie hidden, hold a shelter, expose
a truth, or escape a closing trap. Do not make the objective a timer that
can simply expire halfway through unless that failure creates a concrete
second objective in the summary.

The summary and the initial scene MUST already embody the TONE above if
one was provided — a 'light' story opens with a ridiculous human detail,
a 'dark' story opens with dread, a 'tense' story opens with measured
pressure.

## ROLES

- \`name\` is a PROPER FIRST NAME appropriate to the target language — not
  a job title, not a description. Just a single first name.
- If GROUP CONTEXT names real players and the count matches, prefer using
  those names as role names. This makes the generated cast feel like the
  people at the table instead of random strangers.
- \`description\` is one sentence describing who this person is and their
  relevant skill or background.
- \`ability\` is a single powerful one-time-use special ability written as
  one natural sentence. Do NOT invent an ability title, label, or colon
  prefix. Do NOT start the ability with the role's name; the UI already
  displays the owner separately. Good Estonian shape: "Mäletab üht varjatud
  hooldusväravat ja juhatab grupi sealt läbi." Bad: "Ostee: Kristo meenutab...".
- \`abilityParameter\` is the exact \`name\` of one of the three generated
  parameters this ability is designed to affect. Design the parameters and
  abilities together; do not use a vague category or a parameter state phrase.
- Every ability must be special in THIS story, not generically useful.
  It should clearly help with one of the story's three parameters, protect
  against one named pressure, restore one concrete resource, reveal one
  hidden route/fact, or create one costly shortcut. Avoid generic healing,
  strength, leadership, or "notices details" unless the parameters make
  that ability mechanically meaningful.
- Every ability must contain one concrete story-specific noun: a named place,
  route, tool, code, person, debt, ritual object, vehicle, document, or threat
  from THIS premise. Bad generic ability: "notices details", "calms the group",
  "binds a wound", "knows back roads". Good: "finds the maintenance badge under
  the bus station kiosk and opens the staff corridor".

${ARCHETYPE_PALETTE}

${PARAMETER_CRAFT}

The three parameters must create a TRILEMMA: no single choice can improve
all three. Every meaningful decision trades one against another.

${CONTENT_RULES}
${contextBlock}`
}

export function customStoryPrompt(args: {
  storyText: string
  players: number
  genre: string
  language: Language
}): string {
  const { storyText, players, genre, language } = args
  return `${LANG_PACKS[language].instruction}

## TASK

Based on this custom story idea: "${storyText}", generate ${players}
thematically appropriate roles and 3 unique parameters for a ${genre} game.

Preserve or infer one clear table objective that can carry a full game.
If an objective fails, it must create a concrete second objective rather
than leaving the group with only generic survival.

Each role needs a PROPER FIRST NAME (not a title), a one-sentence
description, and a one-time-use ability written as one natural sentence.
Do NOT invent an ability title, label, or colon prefix. Do NOT start the
ability with the role's name; the UI already displays the owner separately.
Every role also needs \`abilityParameter\`: the exact \`name\` of one of the
three generated parameters the ability is designed to affect. Every ability
must clearly matter to that parameter or one named pressure in the generated
story; avoid generic useful talents. Every ability must contain one concrete
story-specific noun: a named place, route, tool, code, person, debt, ritual
object, vehicle, document, or threat from THIS premise.

${ARCHETYPE_PALETTE}

${PARAMETER_CRAFT}

${CONTENT_RULES}

Output language must be ${LANG_PACKS[language].label}.`
}

export function sequelPrompt(args: {
  sequelText: string
  oldRoles: Pick<Role, 'name' | 'description'>[]
  language: Language
}): string {
  const { sequelText, oldRoles, language } = args
  return `${LANG_PACKS[language].instruction}

## TASK — SEQUEL

This is a sequel to a previous adventure. The story continues from this
summary: "${sequelText}".

The returning characters are: ${JSON.stringify(oldRoles)}.

The sequel needs one concrete objective that can carry the next game. Do
not reduce the continuation to a vague "survive whatever comes next".

Generate:

1. A new, unique, one-time-use special ability for EACH returning
   character, written as one natural sentence with no title, label, or
   colon prefix. Do NOT start abilities with the character name. The list
   of abilities must be in the same order as the characters above.
   Each ability must clearly matter to one of the sequel's parameters or
   named pressures; avoid generic useful talents. Every ability must contain
   one concrete story-specific noun from the sequel premise.
2. \`newAbilityParameters\`: one exact parameter \`name\` per returning
   character, in the same order as \`newAbilities\`. Each value must match one
   of the three generated sequel parameters exactly.
3. Three completely new, unique parameters suitable for this sequel
   story.

${ARCHETYPE_PALETTE}

${PARAMETER_CRAFT}

Prefer a DIFFERENT archetype mix from the first adventure —
continuations feel fresh when the mechanical shape evolves.

${CONTENT_RULES}

Output language must be ${LANG_PACKS[language].label}.`
}
