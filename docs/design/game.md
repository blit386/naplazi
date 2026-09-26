# Beach Detector - the game as it plays today

A tiny beach treasure-hunting game. You walk a stretch of sand with a metal detector, follow the beeps, and dig up
whatever the sea left behind before the day runs out.

This file describes the game `src/game.ts` runs, checked against `src/` on 2026-09-26. The code is the source of truth
for behavior; this file is the source of truth for intent. Where they disagree, fix whichever is wrong. Work that is
planned but not built lives in [`roadmap.md`](./roadmap.md), never here.

Section numbers match the original design brief, so a comment in `src/` that says "PLAN.md section 4.6" means section
4.6 of this file.

---

## 1. The feel

Portrait phone screen. You are a little figure near the bottom, facing away from the camera, sweeping a metal detector
over the sand. The beach slides down past you from the horizon - slowly near the skyline, faster as it reaches your
feet, so it reads as a low, over-the-shoulder view rather than a flat top-down scroll. The sky above the horizon changes
color as the day passes.

You do not turn and you do not walk forward. You **step sideways**: holding the left or right half of the screen (or
A/D, or the arrow keys) steps you that way, and the same input swings the detector rod that way, up to a limit. Buried
things drift down toward you; you line up and the detector does the rest.

You have two real minutes, in which the watch runs from 06:00 to 22:00. At 22:00 the watch beeps and the run ends.

## 2. Core loop

1. A buried item scrolls down from the horizon, invisible under the sand.
2. The detector beeps - faster the closer the **detector head** is to it.
3. You step left or right to line up, swinging the rod over the spot.
4. When the detector head passes within 8 px of the item, it is dug up automatically.
5. The item pops up in the middle of the screen, holds briefly, then slides down and away. The counter goes up by one.
6. Repeat until the watch beeps at 22:00.

No failed digs, no wrong targets, no timeout. Everything buried is worth exactly one point. The challenge is time and
positioning.

## 3. Screen layout

Logical resolution 180 x 320, portrait; the device may letterbox it.

```
+-----------------------------+
| [00]                 [watch]|   top 24 px: HUD band - counter left, watch right; taps here do not steer
|                             |   sky, five color bands (color = time of day)
|- - - - - - - - - - - - - - -|   horizon, y 90
|          . o    ~           |   sand, six color bands, down to the bottom edge:
|       ~        .            |   decoration and buried items (hidden), scrolling down
|            [found!]         |   pickup reveal, centred between horizon and player
|            (player)         |   player row, about y 263
|         \___ o              |   rod = a line, tip = a small non-rotating sprite
+=============================+   border pulses with the beep
```

## 4. Systems

### 4.1 The beach (scrolling strip)

`src/game/Beach.ts`. The world is one vertical strip 260 px deep that scrolls down at 40 px/s. It carries cheap
decoration (18 pieces: litter, cup rings, dark specks) and footprints; buried items live in `Treasures.ts` on the same
strip.

The scroll is not linear: `depthToScreenY()` maps depth to screen Y with exponent 2.2, so rows near the horizon crawl
and rows near the feet race. Objects are stored in world space and projected each frame; anything that scrolls past the
bottom is recycled to the top with a fresh random position and kind.

The engine has no rotated or scaled sprite draw, so perspective lives only in scroll speed; sprites are the same size at
every depth.

### 4.2 The player

`src/game/Player.ts`. Fixed row at 88 % of the strip depth. Holding a direction takes discrete 14 px side-steps, 0.12 s
each, repeated for as long as it is held, clamped so the detector head never leaves the screen. A pointer held within 6
px of the centre line stands still. Every finished step stamps a footprint (a ring buffer of 24) that scrolls away with
the sand. The figure never rotates.

### 4.3 The detector

`src/game/Detector.ts`. The rod is a line from the player to the head, with a small non-rotating coil sprite at the tip.
It swings toward the held direction at 140 deg/s up to 70 deg, and eases back to centre at 90 deg/s when nothing is
held. The rod is 46 px long.

The **detector head** is the rod's tip. Its world position is what beeping and collecting measure from, so swinging the
rod to the correct side is a real action with a real payoff.

### 4.4 Detection and beeping

Each frame `Treasures.ts` finds the nearest buried item to the detector head, and `computeBeepIntervalMs()` in
`src/audio/Sfx.ts` maps that distance to a beep interval:

- beyond 80 px: silence;
- at the 64 px detection radius: 700 ms;
- right on top: 90 ms;
- in between: a squared curve, so the last few pixels feel urgent.

The tick (square wave, 1500 Hz, 0.05 s) plays at a constant, prominent volume; nothing ducks against it.

### 4.5 Feedback channels

`src/game/Signals.ts` fans the one beep clock out to three channels, each behind its own `CONFIG.beep*` flag:

1. **Audio** - the tick.
2. **Visual** - up to three rings pulse around the screen edge, and a highlight ring blinks around the detector tip;
   both fade over 0.16 s. This is the accessibility baseline, so the game is playable muted.
3. **Haptic** - a 30 ms `navigator.vibrate` on every beep, guarded; it does nothing where unsupported.

### 4.6 Collection

Digging is automatic and instant. When the collector is within 8 px of an item, the item is collected and recycled to
the top of the strip. The collector is the detector head: `COLLECTION_MODE = 'head'` in `Detector.ts`. The `'body'`
alternative still works as a one-line switch, but `'head'` is the settled choice - it makes aiming the rod matter.

### 4.7 The pickup reveal

`src/game/Pickup.ts`. On collection a 24 px version of the item appears centred between the horizon and the player,
holds 0.6 s, then slides down at 70 px/s and disappears at the player row. Up to six reveals can overlap, stacked 6 px
apart. The counter increments when the reveal spawns. The game keeps running underneath.

### 4.8 The day clock

`src/game/DayClock.ts`. 120 real seconds map to 06:00-22:00. It exposes the game time, `dayProgress` in 0-1, a phase
(morning, noon, evening, night at 0.3, 0.6, and 0.85 of the day), a phase-change event, and a day-end event that plays
the watch alarm, stops the ambience, saves the high score, and shows the results.

The clock pauses while the tab is hidden, through a `visibilitychange` listener that survives hot reload without
doubling up. A single update is capped at 0.25 s, so a long frame cannot skip the day.

### 4.9 Time-of-day color (palette effects)

`src/palette/palette.ts`. A 64-slot palette: slots 1-27 are the world (sky 1-5, sand 6-11, objects 12-27), 28-33 the
HUD, the rest free. Each phase is a keyframe; on every phase change `startPhaseTransition()` fades only slots 1-27
toward it with `BT.paletteFadeRange` (4 s, ease-in-out). The HUD slots never fade, so the counter and watch stay
readable at night. A restart clears palette effects and sets the morning palette again.

### 4.10 Audio

No music.

- **SFX** (`src/audio/Sfx.ts`): the tick, a rising pickup chime, and a watch alarm, all synthesized with
  `AudioClip.synth` at startup.
- **Ambience** (`src/audio/Ambience.ts`): one synthesized loop per phase, cross-faded over 2 s on each phase change, at
  `CONFIG.ambienceVolume` per voice (the engine has no ambience bus). It starts on the first play frame where audio is
  actually unlocked, and stops at the end of the day and on restart.

Audio stays locked until the first tap, so the title-screen tap both starts the game and unlocks sound.

### 4.11 HUD

Zero text - bitmaps only, drawn with `drawDigitString()` from `src/sprites.ts`:

- **Counter** (top left, `src/hud/Counter.ts`): the collected count on a small plate.
- **Watch** (top right, `src/hud/Watch.ts`): a generic digital-watch face with `HH:MM` in bitmap digits.

### 4.12 Screen flow

A three-state machine in `src/game.ts`: title -> play -> results -> play (never back to the title).

- **Title** (`src/ui/TitleScreen.ts`): a blinking play icon over the running beach; a tap anywhere starts and unlocks
  audio. The game name is not shown.
- **Play**: everything above.
- **Results** (`src/ui/ResultsScreen.ts`): three icon rows - found (magnifier), best (star), seed (die) - and a restart
  button. The high score lives in `localStorage` (`src/ui/HighScore.ts`), guarded so private browsing degrades to "no
  persistence". Restart resets every system without a page reload and re-rolls the seed when `CONFIG.reseedOnRestart` is
  on.

### 4.13 Seeded RNG

All randomness (item and decoration placement) goes through the engine's shared `BT.random`. Add `?seed=N` to the URL to
replay a beach; the results screen shows the run's seed.

## 5. Config philosophy

The game teaches by inviting the reader to change numbers:

- **No magic numbers.** Every meaningful value is a named constant with a comment saying what it does and what happens
  when it changes.
- **Shared values** go in `CONFIG` in `src/config.ts` - only what more than one system reads.
- **Local values** go in a small const block at the top of the owning file (`BEACH`, `PLAYER`, `DETECTOR`, `SFX`, ...).

`src/config.ts` also holds lane, sea, and signal-bar fields for the redesign in `roadmap.md`; today only the unwired
modules read them.

## 6. Module map

```
src/
  game.ts              bootstrap, wiring, the title / play / results state machine
  config.ts            shared settings (section 5)
  sprites.ts           sprite sheet geometry, loading, drawDigitString()
  playtest.ts          dev-only window.__game for pnpm run play
  palette/palette.ts   slot layout, phase keyframes, the phase fade
  game/                Beach, Player, Detector, Treasures, Signals, Pickup, DayClock
  hud/                 Counter, Watch
  audio/               Sfx, Ambience
  ui/                  TitleScreen, ResultsScreen, HighScore, Tap
public/sprites/        nine PNG sheets painted by tools/make-sprites.mjs (pnpm run sprites)
```

Systems never import each other's events; `game.ts` is the only place two systems meet. `Lanes`, `Backpack`, `Haptics`,
`Pause` (in `src/game/`) and `SignalBar` (in `src/hud/`) exist for the redesign but are not wired in yet; see
`roadmap.md`.

## 7. How it was built

Built in layers during the July 2026 jam so there was always something playable: first the playable core (beach, player,
detector, treasures, beeping, clock, title and results), then the living beach (palette fade, footprints, the three
feedback channels, the pickup reveal, high score and seed), then the stretch goal (phase ambience). A post-process CRT
pass was dropped rather than built: it needs WebGPU and would break the Canvas 2D fallback.

## 8. Assets

All original, painted by `tools/make-sprites.mjs` from the palette (see `tools/make-sprites.md`): the player facing
away, the detector coil, a footprint, four items in two sizes (starfish, can, shell, coin), three decorations, digits
`0`-`9` and `:`, the watch face, and five icons (magnifier, star, die, play, restart). Every sheet leaves empty cells to
grow into.

## 9. Non-goals

- No sprite rotation or scaling (the engine has neither). Nothing turns or changes size with depth.
- No false signals or junk targets; every buried thing is a keeper.
- No rarity or scoring weight; everything is worth one.
- No difficulty or density curve; density is constant.
- No fullscreen post-process effects.
- No music.
- No localization and no text on screen.
