# Beach Detector - roadmap

Everything planned but not built, checked against `src/` on 2026-09-26. What the game does today is in
[`game.md`](./game.md). When an item here ships, describe the result in `game.md` and delete the item from this file.

There are two independent tracks: the **redesign** (a different way to play) and **code cleanup** (same game, simpler
code). The redesign rewrites most of the files the cleanup touches, so do the cleanup after it, or inside the task that
rewrites each file.

---

## Part 1 - The redesign

A rethink written after the jam (the "grill session"). The player no longer steers the detector; the game becomes about
reading the signal and choosing a lane.

### The idea

- **The figure walks on its own**, forward, at a constant pace; the player cannot stop it or speed it up.
- **Five invisible lanes.** A tap on the left or right half of the screen moves one lane. Holding does nothing extra.
  That is the only control.
- **The detector swings on its own**, left to right and back, independent of input. You do not aim it, you listen to it:
  when the head swings over something buried, the beeps get denser, and _when_ in the swing they do tells you which side
  it is on.
- **You dig at your feet.** Stand in the right lane when a treasure reaches you and it is yours; miss it and it vanishes
  silently.
- **Every find stops the game** and opens a panel showing what you found and how many of it are in your backpack. The
  clock stops too, so looking costs nothing.
- **The sea is visible**: a band under the horizon and a vertical strip of water down the left edge, marking the edge of
  the playfield.

### The rules, with the numbers

**Layout.** 180 x 320. Horizon at y 90; sea band y 90-107; sand from y 108; the player row at y 276; the signal bar from
y 288 down. Horizontally: sea strip x 0-17, then five 30 px lanes (centres 33, 63, 93, 123, 153), then 12 px of sand. A
run starts in lane 2.

**Walking and the beach.** `worldY` is measured in **seconds of walking**: the player advances one unit per second, so
the `worldY` gap between a treasure and the player is simply "seconds until it reaches my feet". Projection:
`u = (object.worldY - player.worldY) / 8` (0 = at the feet, 1 = at the horizon), then
`screenY = 276 - (276 - 108) * u ^ (1 / 2.2)`. A treasure takes 8 s from horizon to feet.

**Lane moves.** A move animates over 0.15 s. One extra tap is queued during a move, so a quick double tap skips two
lanes. A tap outward from an edge lane is ignored. Keyboard: one step per press of left/right or A/D.

**Detector swing.** `angle = 45 deg * sin(2 * pi * t / 1.2 s)`, rod 68 px from a pivot at y 262, so the head reaches
+-48 px (1.6 lanes) sideways. The head passes any spot twice per cycle: a fresh reading every ~0.6 s.

**Signal.** Each frame, the target is the nearest treasure that is **ahead** of the player row and at most 3 s away; a
treasure that has passed drops out at once. No target means silence and an empty bar. From the target:

| quantity | carries | range |
| --- | --- | --- |
| beep tempo | how exactly the **head** is over it | 110 ms (dead on) to 700 ms (60 px off), silent beyond 90 px; linear |
| volume | how **far** it is | 25 % (3 s away) to 100 % (at the feet); curve power 1.5 |
| pitch | the same, second channel | 1.0 to 2.0 times a 440 Hz clip |
| stereo pan | where the **head** is | -0.6 to +0.6, from the head's offset / 48 px |

Tempo does not depend on distance: a far but well-aimed target beeps fast and quietly, a near but badly aimed one slowly
and loudly.

**Feedback channels.** Sound; the **signal bar** at the bottom (a marker tracks the head's position, a column above it
shows signal strength - the visual twin of volume and pan, drawn in HUD slots so night never hides it); the tip blinks
on each beep; **haptics only on events** - a new target in range (20 ms), a dig (40 ms), the end of the day (3 x 60 ms).
No screen-border pulse: at a fast tempo it would flash the whole screen eight times a second.

**Treasures.** Each sits on a lane centre +-6 px. Gaps are generated in walking seconds: at least 4.0 s, 4.5 s on
average, about 27 per run; a good player collects 18-24. The minimum gap is longer than the 3 s warning window, so there
is never more than one target in range. Six types, drawn uniformly: starfish, shell, coin, can, glass shard, key.
Density is constant.

**Collection.** When a treasure crosses the player row, measure the sideways distance: within 14 px it is dug up,
otherwise it is removed without a sound. 14 px safely covers the +-6 px jitter, so standing in the right lane always
collects.

**Find panel and backpack.** A dig stops walking, scrolling, the swing, and the clock. The figure raises the find over
its head (0.2 s) and a wordless panel slides in: the item sprite, its backpack count as `x 3`, and a NEW badge on the
first find of a type. It holds 4.0 s for a new type and 1.5 s for a known one; a tap closes it early; it slides out in
0.25 s and walking resumes exactly where it stopped. The counter increments when the panel appears. The backpack lasts
one run (counts per type plus a "seen today" flag) and is shown on the results screen. A real session grows to about
2.5-3.5 minutes.

**Pause.** Losing focus (`visibilitychange`) pauses the whole game - scrolling, swinging, sound - dims the screen, and
waits for a tap. The find panel uses the same pause, without dimming.

**Screens.** Title: the game name, tap anywhere to start. Pause: dimmed, tap to resume. Results: the total, a board of
the six types with counts (unfound types as grey silhouettes), best score, seed, and tap anywhere to restart. Labels are
icons, never words.

**HUD.** A two-digit counter; the watch shows `HH:MM` with the colon blinking once a second.

**Not in the redesign.** No control over walking speed; no persistent collection across runs (only the high score); no
onboarding in the first version.

### What already exists

- **Done and in the game:** the four-phase palette and its fade, the day clock with four phases, phase ambience, the
  bitmap HUD and digits, sprite loading, footprints, title and results screens, and `CONFIG` fields for lanes, the sea,
  and the signal bar.
- **Written but not wired in** (listed under `ignore` in `knip.json`; delete each entry when its file gets used):
  - `src/game/Lanes.ts` - lane centre, clamp, x-to-lane, playable range. Correct as written.
  - `src/game/Backpack.ts` - per-run counts and first-find flag for six types. Correct as written.
  - `src/hud/SignalBar.ts` - `renderSignalBar(strength, headNormalizedX)`.
  - `src/game/Haptics.ts` - the three event vibrations. Calls `navigator.vibrate` **without** `try`/`catch`; wrap it
    before wiring, because a throw inside `update()` freezes the game for good.
  - `src/game/Pause.ts` - pause state with a reason. Needs fixing before use: it resumes by itself when the tab comes
    back instead of waiting for a tap, registers a new listener on every hot reload (copy `DayClock.ts`'s
    `AbortController` pattern), and covers the screen with opaque `HUD_PAPER` instead of dimming.

### Tasks, in build order

Each task replaces the matching part of `game.md` when it lands.

1. [ ] **Walking and lanes.** Rewrite `Player.ts` for lane moves (tap edges only, one queued step, 0.15 s) on top of
       `Lanes.ts`. Change `Beach.ts` to walking-seconds `worldY` and the projection above. Footprints follow the drawn
       position so lane changes show.
2. [ ] **The sea.** Draw the sea band and the left water strip; the sand band starts at y 108. Add a slowly moving surf
       line and a one-pixel wobble on the strip's edge.
3. [ ] **Self-swinging detector.** Rewrite `Detector.ts`: sine swing from the pivot, independent of input; expose the
       head position and the normalized swing phase (-1 to 1) for pan and the signal bar.
4. [ ] **Treasures in lanes.** Rewrite `Treasures.ts`: gaps in walking seconds, lane plus jitter, six types, collect at
       the feet within 14 px, silent removal on a miss; expose the nearest treasure ahead and a dig event carrying the
       type. Remove `COLLECTION_MODE` and the collect/beep fields from `DETECTOR`.
5. [ ] **Signal.** New `src/game/Signal.ts` that owns target selection, the beep clock, and the four quantities, plus a
       "new target in range" event. It replaces `computeBeepIntervalMs()` in `Sfx.ts` and the beep clock that
       `Signals.ts` reads. `Sfx` plays the beep with `{ volume, pitch, pan }` from a 440 Hz clip.
6. [ ] **Feedback channels.** Wire `SignalBar` and `Haptics` (events only). Keep the tip blink. Remove the border pulse,
       the per-beep vibration, and `CONFIG.beepBorderPulse`.
7. [ ] **Pause.** Fix and wire `Pause.ts`; the day clock, systems, and beeping all stop through it.
8. [ ] **Find panel and backpack.** New `FoundPanel.ts` replacing `Pickup.ts`, using the pause; wire `Backpack`; the
       counter reads the backpack total.
9. [ ] **HUD and screens.** Blinking watch colon, two-digit counter, the game name on the title, a pause state, the
       results board of six types, tap anywhere to restart.
10. [ ] **Assets.** Add to `tools/make-sprites.mjs`: the figure holding a find overhead, the glass shard and key (both
        sizes), the NEW badge, and grey silhouettes for the results board.
11. [ ] **Optional - onboarding.** Only if first players do not get the controls: a wordless loop on the title (figure,
        swinging detector, a hand tapping left and right), and/or the first treasure of each run always in the player's
        lane. Both behind a config flag.

---

## Part 2 - Code cleanup

From a review of the current code. None of these change behavior.

1. [ ] **Trim historical comments.** In progress in the working tree (uncommitted comment-only edits across `src/`).
       Keep the teaching comments (`CLAUDE.md` asks for that density); cut task history, QA notes, and engine traces -
       the engine notes that matter already live in `AGENTS.md`. Tick this once no comment cites `TASK-nnn`.
2. [ ] **Name the phases of `Game`.** Split `src/game.ts` into short named methods: `wireEvents()`, `updatePlay()`,
       `renderWorld()`, `renderHud()`, and `finishRun()` for the end-of-day callback. Merge the two `onCollect`
       listeners into one handler. Make the fields `private`.
3. [ ] **Load in parallel.** After `BT.paletteSet(palette)`, run `loadSpriteSheets`, `Sfx.create`, and `Ambience.create`
       with one `Promise.all`.
4. [ ] **Untangle shared constants.** Several modules import a constant from an unrelated system: `HUD_BAND_HEIGHT_PX`
       comes from `Player` (used by `Pickup` and `Watch`), the projection from `Beach`, the beep tuning from `Detector`
       (used by `Sfx` and `Treasures`). Move true shared invariants into a small shared module. Much of this goes away
       with redesign tasks 1-5.
5. [ ] **Delete dead snapshot getters.** `getTreasureSnapshot()`, `getDecorationSnapshot()`, `getFootprintSnapshot()`,
       and `getRevealSnapshot()` have no callers; play-testing reads `window.__game.state()` instead.
6. [ ] **Validate config once.** A `validateConfig()` called at the start of `init()`, replacing the two module-level
       checks in `Watch.ts` and `Pickup.ts`, so a bad value fails at startup rather than mid-game.
7. [ ] **Unit tests for pure logic - your call.** The project has no test runner on purpose; checks are
       `pnpm run preflight` and play-testing with `pnpm run play`. If one is added, start with the beep curve, the day
       clock phases, the watch time format, the high-score parsing, and the projection.

**Decided: leave as is.**

- The explicit order of `update()` calls and the explicit list of `reset()` calls in `restart()` - both carry real
  ordering and make every new system a deliberate addition.
- The two collector ternaries in `update()` - an object per frame would be worse.
- UI geometry computed locally in each constructor - no layout framework.
- `ambiencePendingStart`, the `try`/`catch` around browser APIs, and never calling `BT.spritesRefresh()` after a palette
  fade - see `AGENTS.md`, "Your notes".
- No ECS, dependency injection, or generic event bus.
