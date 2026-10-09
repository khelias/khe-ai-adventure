# UI/UX Notes

Last reviewed: 2026-04-25

This document records the product-facing screen structure and the UI principles
that should stay true as the game changes. It is not a pixel-perfect design
spec; the source of truth for implementation remains the React components and
CSS.

## Product Experience Goals

- **Sell the game before generation starts.** The first setup screen should feel
  like choosing the shape of an adventure, not filling a form.
- **Keep setup fast.** A group should be able to start a playable game in about
  a minute.
- **Separate different kinds of decisions.** Genre and duration are about the
  game promise; player count and names are about the table; place and mood are
  context; the final idea is optional.
- **Use Estonian as authored product copy.** Estonian labels should be natural,
  not literal translations from English.
- **Keep technical controls out of the main path.** Model selection is an
  advanced/experimental control, not a gameplay decision.
- **Design for one shared device.** Screens should work when one person reads
  aloud and the device is passed around.

## Screen Flow

### 1. Adventure Direction

Purpose: create the first impression and choose the game promise.

Inputs:

- genre
- game length

UI notes:

- The selected genre is shown as a large visual signal with a short teaser.
- Game length is visible immediately because it affects commitment and pacing.
- Player count is intentionally not here; it belongs with the group setup.

### 2. The Group

Purpose: define who is playing.

Inputs:

- player count
- optional player names or group description

UI notes:

- Player count affects roles and secret goals, so it should be explicit.
- Names remain optional to keep setup quick.

### 3. Place And Tone

Purpose: anchor the adventure in the current room or situation.

Inputs:

- current location
- mood

UI notes:

- Location asks where the group is right now, because familiar places make the
  generated story more immediately interesting.
- Mood may remain open if the group wants surprise.

### 4. Final Detail

Purpose: give the AI one optional spark and confirm the setup.

Inputs:

- one optional detail the adventure may use
- the confirmation that every player is 18 or older, asked once per device

UI notes:

- The screen includes a compact review of genre, player count, length, and
  location before generation.
- The optional detail should be one useful seed, not a full prompt brief.
- The start button stays disabled until the 18+ confirmation is checked.

The group, place and detail fields each carry a short hint that the text is
sent to the AI provider, so the group enters only what everyone is fine with.
The footer on every screen reads "18+ · Lugu kirjutab tehisintellekt".

## Gameplay Screens

### Story Selection

The generated story choices should help the group pick a premise quickly. The
screen should avoid implying that players are editing a prompt; they are choosing
which adventure to enter.

The screen previews generated parameters and cast names because those are the
first clues that the adventure has a playable mechanical shape, not just a title.

### Role Assignment

Role and name assignment is deterministic app behavior. The AI may supply story
material, but the app owns player identity, ability-used state, and secret goal
scoring.

Role cards show each ability and its parameter anchor. This is intentional:
players should see that an ability belongs to this story, not that it is a
generic bonus action.

### Secrets

Secrets are pass-the-phone interactions. Only one player should see their secret
at a time, and the UI should make the privacy ritual obvious without a long
explanation.

The hidden state should feel like a handoff moment: phone owner, progress, and
privacy cue in one focused surface. The revealed state should feel materially
different, like opening a classified goal card: the card turns edge-on, swaps,
and the dossier turns in (a cross-fade under reduced motion). The dossier, and
with it the secret, mounts only at that swap, so the next player's secret is
never in the DOM before their reveal. Taps are ignored while the card turns
away, so a double tap cannot skip a player.

### Gameplay

The gameplay screen must prioritize:

- current scene text
- shared parameter state
- three group-facing choices
- separate special ability action in a drawer/dialog
- visible consequence events when parameters move

Normal choices should not be named after one player. Special abilities may use a
player's skill, but they are triggered through the separate ability action.
The ability drawer is a bottom sheet: it closes by dragging or flicking it down
from the handle or head, by tapping the scrim, with Escape, or with its cancel
button, and it sits above the consequence toast.
Parameter movement should feel like something happened in the fiction, not like
the UI changed a score.

### Game Over

The end screen should read as one conclusion:

- final parameters
- revealed secrets
- winners
- final narrative

Players should see winners and final parameters before the long final prose.
They should not need to click through the entire game again to understand who
won and why.

The copied full story ends with a line saying it was generated with AI and
naming games.khe.ee/adventure.

## Parameter Rules

Parameters are group-level pressures ordered best → worst. They are not personal
meters and they are not progress-to-victory clocks.

Bad parameter:

- `Hommikuni`: `Mitu tundi` → `Pool ööd` → `Kohe hommik`

That sequence gets better as the group survives, while the engine treats movement
down the list as worse. It also makes "perfect ending" goals unfair.

Better parameter:

- `Päästeaken`: `Selgelt avatud` → `Kitseneb` → `Sekundid jäänud` → `Kadunud`

If a `time` parameter appears, it is treated as a worsening deadline and is not
eligible for personal secret-goal assignment.

## Current UI Assessment

Strong:

- Setup now has a clearer first impression.
- Player count and names are grouped correctly.
- Advanced model selection is hidden from the main path.
- Special abilities are separate from normal choices and open as a focused
  bottom sheet.
- Parameter changes appear as in-world consequence events.
- Game over shows winners and final parameters before the long final narration.
- The final setup screen gives useful review before generation.
- Story selection now previews both premise and mechanics.
- Role assignment now reads as cast setup instead of a plain form.
- Secret distribution now has distinct handoff and dossier states.

Needs continued playtest attention:

- Parameter board density and comprehension on small screens.
- Whether secrets are immediately understandable when the phone is passed.
- Whether game-over summaries create a satisfying table discussion.
- Whether the generated choices create disagreement instead of obvious
  optimization.

## Documentation Rule

For this project, screen documentation should stay at the level of user flows,
interaction contracts, and product invariants. Avoid maintaining duplicated
component-level specs unless a screen becomes complex enough that implementation
intent is no longer obvious from code.
