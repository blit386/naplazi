# Beach Detector

A tiny beach treasure-hunting game, and the default starter project for `create-blit386`. You walk a stretch of sand
with a metal detector, follow the beeps, and dig up whatever the sea left behind before the day runs out.

This file is three things at once:

1. **A game design document** - what the game is and how it plays.
2. **A Claude Code brief** - the initial prompt an AI agent reads to scaffold and build the project.
3. **A living document** - agents update it as the code changes, so it always describes the game as it actually is. See
   _Keeping this document alive_ at the end.

The code is meant to be read by a curious twelve-year-old. Every subsystem is a small, self-contained file you can
delete. Every tunable number lives in a named constant with a comment, never inline. That is the whole point of the
template: open a file, change a number, see what happens.

---

## 1. The feel

Portrait phone screen. You are a little figure planted near the bottom, facing away from the camera, sweeping a metal
detector over the sand. The beach slides down past you from the horizon - slowly up near the skyline, then faster as it
reaches your feet, so it reads as a low, over-the-shoulder view rather than a flat top-down scroll. The sky sits above
the horizon and changes colour as the day passes.

You do not turn and you do not walk forward. You **step sideways**. Tapping or holding the left or right half of the
screen steps you that way, and the same input swings the detector rod that way too, up to a limit. Buried things drift
down toward you on the sand; you line yourself up and the detector does the rest.

You have two real minutes. In that time the clock runs from 6 in the morning to 10 at night. When night falls the watch
beeps and the game ends. Dig up as much as you can.

---

## 2. Core loop

1. A buried item scrolls down from the horizon (invisible under the sand).
2. The detector beeps - faster the closer the **detector head** is to it.
3. You step left or right to line up, swinging the rod over the spot.
4. When the collector passes over the item, it is dug up automatically.
5. The item pops up in the centre of the screen so you see what you found, then slides down and off the bottom edge. The
   counter goes up by one.
6. Repeat until the watch beeps at 22:00.

There is no failing a dig, no wrong target, no timeout. Everything buried is worth collecting, and everything is worth
exactly one point. The challenge is time and positioning, nothing else.

---

## 3. Screen layout

```
+-----------------------------+
|  [00]                 [watch]|   top corners: counter (left), watch (right)
|                             |   sky (colour = time of day)
|- - - - - - - - - - - - - - -|   horizon line
|          . o    ~           |   sand: decoration + buried items (hidden)
|       ~        .            |   scrolls down, slow near horizon -> fast near feet
|                             |
|            [found!]         |   collected item reveal (centre, then slides down)
|                             |
|            (player)         |   player: fixed vertical position, steps L/R
|         \___ detector       |   rod = lines, tip = a small non-rotating sprite
|                             |
+=============================+   <- animated border pulses with the beep
```

The exact aspect ratio does not matter - the device may letterbox. Only two things are anchored: the **horizon height**
(so sky and sand split cleanly) and the two **top-corner HUD** elements (which just need to stay visible, not
pixel-perfect).

---

## 4. Systems

### 4.1 The beach (scrolling strip)

The whole world is one tall vertical strip - a "noodle" - that scrolls downward. It carries two kinds of thing: cheap
pixel **decoration** (scattered litter, cup rings, dark specks) and occasional buried **items** (starfish, can, shell,
coin, and friends), which are invisible under the sand until dug.

The scroll is **not linear**. Rows near the horizon crawl; rows near your feet race. A single `depth -> screenY` mapping
with a tunable exponent gives the fake-perspective feel and lets us show a real horizon and sky. Objects are stored in
world space (a `worldY` down the strip and a `worldX` across it) and projected to the screen each frame; anything above
the horizon is culled.

Note: the engine has no rotated **or scaled** sprite draw today, so perspective lives entirely in _scroll speed_, not in
sprite size. Items stay the same pixel size at every depth. If a scaled draw appears later, a horizon LOD (swap to a
smaller sprite up top) is an easy upgrade - out of scope for now.

### 4.2 The player

Fixed vertical position near the bottom. Left/right input moves the player in discrete **side-steps** across the width
of the strip, clamped to the playable band. No rotation, ever. Footprints drop behind the player as it moves and scroll
away with the sand (also un-rotated - just a small stamp sprite).

### 4.3 The detector

Drawn as **lines** (the rod) with a small **non-rotating sprite** at the tip (a coil or ring). The rod swings left or
right with the movement input, up to a maximum angle, at a limited turn speed - so aiming is deliberate, not instant.
When there is no input the rod eases back toward centre.

The **detector head** is the tip of the rod. Its world position is what the beep measures from - not the player's body.
Swinging the rod to the correct side is therefore a real action with a real payoff, even though it takes a moment.

### 4.4 Detection and beeping

Each frame, find the nearest buried item to the **detector head** in world space. Map that distance to a beep interval:

- Beyond a **silence threshold**: no beep at all.
- At the edge of the **detection radius**: the slowest interval.
- Right on top of it: the fastest interval.
- In between: interpolate along a tunable curve (linear to start; a squared curve makes the last few pixels feel more
  urgent).

The beep is a short synthesized tick (see audio). It plays at a **constant, prominent volume** - no ducking against
ambience, because that would muddy the one signal the player relies on.

### 4.5 Feedback channels

Most people play phone games muted, so the beep is never the only signal. Three channels, all driven by the same beep
timing, all toggleable in config:

1. **Audio** - the tick itself.
2. **Visual** - the screen-edge **border pulses** on each beep, and the **detector tip blinks** in time. This is also
   the accessibility baseline for the whole template, so keep it solid.
3. **Haptic** - a short phone **vibration** on each beep boundary (`navigator.vibrate`, guarded - it silently does
   nothing where unsupported).

### 4.6 Collection

Digging is automatic and instant - no timeout, no dig button. When the collector gets within a small collect radius of a
buried item, it is removed from the world and a pickup reveal is spawned.

**Collector point (design toggle).** Whether "the collector" means the detector head or the player's body changes how
the game feels, so it is a single config flag rather than a silent choice:

- `head` _(recommended default)_ - you collect where the detector is. Aiming the rod matters for collecting, not just
  for the beep. This matches real metal detecting and rewards the swing.
- `body` - you collect where your feet are; the rod only ever informs. Simpler, but the rod becomes cosmetic.

Set `COLLECTION_MODE` once and the collision test uses that point. Everything else is identical.

**Settled.** The shipped game uses `COLLECTION_MODE = 'head'` (`src/game/Detector.ts`) - both branches were built and
played, and `'head'` read better: aiming the rod visibly mattered for collecting, not only for the beep. `'body'` still
exists as a one-line toggle for anyone who wants to compare the two feels, but it is not what a fresh checkout runs.

### 4.7 The pickup reveal

On collection the found item appears in the **centre** of the screen at full size (so the player registers what it was),
holds briefly, then **slides down** and off the bottom edge. The counter increments when the reveal spawns.

### 4.8 The day clock

Two real minutes map to game time 6:00 -> 22:00. The clock exposes:

- the current game time (for the watch),
- a normalized `dayProgress` in `[0, 1]`,
- a **phase** (morning / noon / evening) derived from thresholds,
- an **end-of-day** event that fires the watch beep and ends the game.

The clock must **pause when the tab loses focus** (visibility change), so a phone call or a tab switch does not silently
burn the two minutes.

### 4.9 Time-of-day colour (palette effects)

Colour is the main way the player feels time passing. BLIT386 is palette-first, so this is a palette job, not a
per-sprite job:

- Sprites use only a few indices each, packed into **contiguous ramps**: a sand ramp, a sky ramp, an object ramp - all
  inside one shifting range.
- The clock drives a **palette fade** across those ramps toward the next phase's colours (a range-limited fade so the
  fade only touches the world ramps).
- HUD indices live **outside** the faded range, so the counter and watch stay readable at every hour, including the dim
  ends of the day.

Keep it to a few phase keyframes (morning, noon, evening) with fades between - that is enough to sell it, and cheaper
than a per-minute gradient.

### 4.10 Audio

No music. Two things only:

- **SFX** - the detector tick and the pickup sound, generated with `AudioClip.synth` (waveform + short envelope). Cheap,
  no files, easy to tune.
- **Ambience** - a light bed that changes with the phase (gulls by day, cicadas toward evening, and so on). Prefer
  `AudioClip.synth` where it sounds fine; fall back to short looping **MP3** samples for anything synthesis cannot fake.
  Cross-fade on phase change.

All volumes (master, sfx, ambience) live in config. Audio is locked by the browser until a user gesture, so the **title
screen tap** both starts the game and unlocks audio - see UI.

### 4.11 HUD

Zero text - everything is bitmaps, English-only (no localization anywhere):

- **Counter** (top-left): bitmap digits, current collected count.
- **Watch** (top-right): a small **old-CASIO-style** face - a plain sprite plus a digital readout built from bitmap
  digits `0`-`9` and a `:` colon. No branded or copyrighted design. It shows the game time and **beeps at 22:00**,
  ending the game.

### 4.12 Screen flow

- **Title** - tap to start (also unlocks audio). Shows the game name; no text instructions if a bitmap can carry it.
- **Play** - everything above.
- **Results** - final count, the run's **seed**, the **high score**, and a tappable **restart** region. High score
  persists in `localStorage`. Restart resets state without a page reload; whether it re-rolls the seed is a config flag.

### 4.13 Seeded RNG

One seeded PRNG owns all randomness (buried item placement, decoration scatter). The seed lives in config and is shown
on the results screen, so any run is reproducible - handy for debugging and for comparing two playthroughs.

---

## 5. Config philosophy

The template teaches by inviting the reader to change numbers. So:

- **No magic numbers.** Every meaningful value is a named constant with a comment saying what it does and what happens
  if you change it.
- **Shared values -> `src/config.ts`.** Only things more than one system needs: display size, day length, seed, master
  volumes, palette phase times.
- **Local values -> a `CONFIG` block at the top of the owning class.** If only the detector cares about it, it lives at
  the top of `Detector.ts`.

Representative `src/config.ts` (illustrative when this was written; the built `src/config.ts` matches it field for field
and value for value - nothing here needed to change):

```ts
// Shared, cross-system settings. One-file place to change the "shape" of the
// game. Anything only one system uses lives at the top of that system's class.

export const CONFIG = {
  // --- Screen ---------------------------------------------------------------
  // Logical (pixel-art) resolution. Portrait. The device may letterbox this;
  // that is fine. Bigger = more detail but more pixels to push.
  logicalWidth: 180,
  logicalHeight: 320,
  // Where the sky meets the sand, measured from the top in logical pixels.
  horizonY: 90,

  // --- The day --------------------------------------------------------------
  // One full playthrough in real seconds. Two minutes by default.
  dayLengthSeconds: 120,
  // Game-time bounds shown on the watch, in minutes since midnight.
  dayStartMinutes: 6 * 60, // 06:00
  dayEndMinutes: 22 * 60, // 22:00

  // --- Randomness -----------------------------------------------------------
  // Change this to get a completely different beach. Shown on the results
  // screen so you can replay the exact same run.
  seed: 1337,
  // Re-roll the seed on restart, or replay the same beach every time?
  reseedOnRestart: true,

  // --- Volume (0 = silent, 1 = full) ---------------------------------------
  masterVolume: 0.8,
  sfxVolume: 1.0, // the beep is meant to be loud and clear
  ambienceVolume: 0.35,

  // --- Feedback channels (turn any off to compare) --------------------------
  beepAudio: true,
  beepBorderPulse: true,
  beepDetectorBlink: true,
  beepHaptic: true,

  // --- Palette phase times (0..1 across the day) ----------------------------
  // Used by the clock, the palette fader, and the ambience switcher.
  phaseNoonAt: 0.5,
  phaseEveningAt: 0.8,
} as const;
```

Representative local block, top of `Detector.ts`:

```ts
// Everything about the detector rod and its beep. Tweak freely.
const DETECTOR = {
  rodLengthPx: 46, // how far the head reaches from the player
  maxAngleDeg: 70, // how far left/right the rod can swing
  turnSpeedDegPerSec: 140, // how fast it swings toward your input
  returnSpeedDegPerSec: 90, // how fast it eases back to centre when idle

  detectRadiusPx: 64, // beeping starts inside this ring
  silenceThresholdPx: 80, // no beep at all beyond this
  beepIntervalFastMs: 90, // right on top of an item
  beepIntervalSlowMs: 700, // at the very edge of the ring
  beepCurvePower: 2, // 1 = linear, 2 = urgent near the target

  collectRadiusPx: 8, // how close the collector must be to dig it up
};

// Which point does the digging? See PLAN.md section 4.6.
const COLLECTION_MODE: 'head' | 'body' = 'head';
```

Built `Detector.ts` matches every field above and adds exactly one more, `blinkHighlightMaxPaddingPx` (the "just beeped"
highlight ring's size, added once the feedback channels in section 4.5 needed it) - everything else in this sketch
shipped unchanged. `COLLECTION_MODE` is also a settled decision now, not an open toggle: the game ships with `'head'`,
and section 4.6 records why.

---

## 6. Suggested module map

Each file is small and removable. Fold two together if it reads more simply - clarity beats ceremony.

This map is illustrative, not final, and the built game did not follow it exactly in two respects worth calling out up
front:

- **The entry file is `src/game.ts`, not `main.ts` below.** `index.html`, `.blit/manifest.json`, and `CLAUDE.md` all
  already pointed at `src/game.ts` before a single system existed, so that is what `bootstrap(Game)` lives in today;
  `main.ts` never got created. See `CLAUDE.md`'s Architecture section for the real, current module list.
- **Assets live under `public/sprites/`, a sibling of `src/` - not in an `assets` folder nested inside `src/` the way
  the tree below once suggested.** BLIT386 loads sprite sheets from root-relative URLs
  (`SpriteSheet.load('/sprites/x.png')`), and the `blit386()` Vite plugin's default `assetDirs` watches `public/` for
  hot-replace - a folder under `src/` would neither load nor hot-replace. `tools/make-sprites.mjs` (run via
  `pnpm sprites`) is what paints the PNGs in that folder.

```
PLAN.md                 this document (living)
README.md               kid-friendly intro (the scaffolder writes a starter)
index.html
vite.config.ts
package.json
public/
  sprites/
    ...                 sprite sheets, bitmap digit font, painted by tools/make-sprites.mjs
src/
  main.ts               bootstrap, wiring, the Title / Play / Results state machine
                        (built as game.ts instead - see the note above)
  config.ts             shared cross-system settings (section 5)
  rng/
    Rng.ts              one seeded PRNG for the whole game
  palette/
    palette.ts          ramps + the time-of-day fade driver
  game/
    DayClock.ts         real time -> game time, phase, pause-on-blur, end-of-day
    Beach.ts            the scrolling strip: perspective mapping, decoration
    Treasures.ts        seeded placement, collection test, spawns pickups
    Player.ts           side-step movement, footprints, draw
    Detector.ts         rod angle (lagged, limited), head position, beep timing
    Signals.ts          the three feedback channels off one beep clock
    Pickup.ts           centre reveal + slide-down-and-out
  hud/
    Counter.ts          top-left bitmap count
    Watch.ts            top-right CASIO-style face + digital time + end beep
  audio/
    Sfx.ts              synth beep + pickup sound
    Ambience.ts         phase ambience, cross-fade
  ui/
    TitleScreen.ts      tap to start (unlocks audio)
    ResultsScreen.ts    score, seed, high score (localStorage), restart
```

---

## 7. Build order and the one-day cut

Two people, one day. Build in layers so there is always something playable.

**MVP - the playable core (aim: first half of the day).**

- Bootstrap, config, seeded RNG.
- Scrolling beach with the perspective speed gradient (decoration only).
- Player side-steps, clamped to the band.
- Detector rod (lines + tip sprite), swing with limit and turn speed.
- Buried items placed by seed; nearest-to-head distance; beep timing.
- Automatic collection; counter increments.
- Day clock; watch shows time; end-of-day ends the game.
- Title (tap to start) and Results (count + restart).

Definition of done for MVP: you can start, hunt by beep, collect items, watch the clock run out, see a score, and
restart - all from one tap.

**Second layer - the beach comes alive.**

- Time-of-day palette fade (morning / noon / evening) and sky colour.
- Footprints behind the player.
- The three feedback channels (border pulse, detector blink, haptic).
- The pickup reveal animation.
- High score in `localStorage`; seed shown on results.

**Stretch - if there is time.**

- Phase ambience via `AudioClip.synth` (gulls, cicadas), cross-faded.
- Richer decoration and a wider item set.

**Dropped, not built: a post-process pass (a light CRT preset).** An earlier draft of this list had one for flavour. It
was removed rather than built: it directly conflicts with this project's own hard rule (`AGENTS.md`/`CLAUDE.md`, "No
fullscreen post-process effects") - a CRT pass needs WebGPU and does not run on the Canvas 2D fallback this engine falls
back to, so it would silently break the game for anyone on the fallback path. See `TODO.md` TASK-020 for the decision.

**Rough split.** One person owns the world and motion (Beach, Player, Detector, Treasures); the other owns presentation
and shell (palette/clock, HUD/Watch, Signals, Title/Results, audio). They meet at `main.ts`.

---

## 8. Assets to make

All original, all ours - this template is copied into every generated game, so nothing borrowed can ride along. Keep
each sprite to a few palette indices.

- Player figure (facing away).
- Detector tip sprite (coil / ring), non-rotating.
- Footprint stamp.
- Buried items: starfish, can, shell, coin, plus room for more.
- Decoration bits: litter, cup rings, dark specks.
- Bitmap digit font `0`-`9` and `:` for the counter and watch.
- Watch face sprite (generic CASIO-style, no branding).
- Ambience MP3s for anything synthesis cannot fake.

---

## 9. Non-goals

Called out so nobody rebuilds them by reflex:

- No sprite rotation and no sprite scaling (engine has neither yet). Nothing turns; the shadow does not skew.
- No false signals or junk targets - every buried thing is a keeper.
- No item rarity or scoring weight - everything is worth one.
- No depth-as-difficulty and no spawn-density curve - density is constant.
- No music.
- No localization - English bitmaps only.

---

## 10. Keeping this document alive

This file is the source of truth for _intent_. The code is the source of truth for _behaviour_. They must not drift.

- **When code changes behaviour, update this file in the same change.** New system, renamed file, changed default,
  dropped feature - reflect it here.
- **Keep the config sketch in section 5 honest.** If `config.ts` gains or loses a field that matters, update the sketch
  (it need not be exhaustive, but it must not lie).
- **Move decisions out of "toggle" limbo once they are settled.** If `COLLECTION_MODE` gets locked to one value in
  practice, say so here.
- **Do not write here:** transient TODOs, per-commit notes, or anything with a date on it - those belong in issues or
  commit messages. This file describes the game as it stands, not the history of how it got there.
- **If this file and the code disagree, that is a bug.** Fix whichever is wrong and note it.

---

## 11. Turning this template into another game

This is a starter, not a finished product. To make a different game from it:

- Change the numbers in `config.ts` first - it is the fastest way to feel the engine.
- Delete whole files from `src/game/` and `src/hud/` you do not need; each is built to come out cleanly.
- Swap the assets in `public/sprites/` and update the ramps in `palette/palette.ts`.
- Rewrite this document to describe _your_ game. It is the first prompt the next agent will read.
