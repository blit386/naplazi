---
name: test-the-game
description:
  Play-test the game in a real browser to check that a change works, reproduce a bug, or see what is on screen. Use
  whenever you changed gameplay, input, drawing, or anything the player sees, or the user asks to test, try, play, or
  check the game, even if they just say 'does it work now?' or 'try it'.
---

# Test the game

Open the game in the browser you already have, press keys, and read the game's numbers to check that it does what you
expect.

The game draws everything into one `<canvas>`, so a page snapshot or accessibility tree shows nothing useful: there are
no buttons or text on the page to read. Read the game's state through JavaScript instead of guessing from pixels.

## When to use

Use this after a change to gameplay, input, or drawing, to reproduce a bug the user described, or when the user says
"test it", "try it", "play it", or "does it work now?"

## Steps

1. Start the dev server with the `run` skill (`pnpm run dev`). Leave it running.
2. Open the game with a fixed seed: `http://localhost:5173/?nosplash&seed=42` (use the port the server printed).
   - `seed=42` makes every random roll the same on every run, so two tests can be compared. Any whole number works.
   - `nosplash` skips the BLIT386 splash. A dev build already skips it, so this matters for a built game you open with
     `vite preview`. If the game's `configure()` sets `isSplashEnabled`, that setting wins over the URL.
   - Add `&backend=software` when the browser has no WebGPU, or to test what players without WebGPU get. `software` is
     the only value it accepts.
3. Give the canvas keyboard focus without clicking it: run `document.querySelector('canvas').focus()` in the page. The
   game opens on its title screen, which waits for a press anywhere. Start it with a real mouse press held for about 100
   ms (a press that is over within one game step, 1/60 s, is never seen). Once playing, the player steers with the arrow
   keys or A and D, or with a held mouse button on the left or right half of the screen. Mouse hover does not steer.
4. Read the state. Run this JavaScript in the page:

   ```js
   window.__game.state();
   ```

   It returns plain data, for example
   `{ ticks, screen, seed, collected, dayProgress, gameTimeMinutes, phase, player: { x, y }, detectorHead: { x, y }, nearestTreasurePx, ... }`.
   `screen` is `title`, `play` or `results`. Read it twice about a second apart: `ticks` should have grown by about 60,
   and once playing `dayProgress` climbs from 0 to 1 over two real minutes.

5. Press keys, then read the state again. Keys use `KeyboardEvent.code` names: `KeyA`, `KeyD`, `ArrowLeft`,
   `ArrowRight`. Player 0 uses W, A, S, D out of the box; this game also maps the left and right arrow keys. The game
   runs in real time (about 60 steps a second), so read the state after a key press instead of assuming how far
   something moved.
6. Grab an exact frame when you need to see the picture:

   ```js
   await window.__game.frame(); // a PNG data URL of the next frame
   ```

   This is sharper than a browser screenshot: it is the game's own pixels, not scaled by the page.

## What a healthy run looks like

- `ticks` climbs between two reads.
- The browser console shows no errors.
- The numbers you meant to change moved the way you expected (`screen` went from `title` to `play` after the press,
  `player.x` went down while `KeyA` was held, `collected` went up after walking over a buried item).
- The same seed and the same key presses give the same state. Seeded things (where items are buried, how the day clock
  advances per tick) match exactly, on WebGPU and on the software renderer alike. Things you steered can differ by a
  step or two, because a key press lands in real time, not on an exact tick.

## Using your browser

The steps above need a browser tool that can run JavaScript in the page and press keys:

- **Claude desktop app browser pane:** navigate to the URL, run the snippets with its JavaScript tool, press keys with
  its keyboard action.
- **Cursor's built-in browser:** it can open the page and take screenshots, but it cannot run JavaScript or press keys,
  so it cannot read `window.__game`. Use the terminal script below instead.

## From the terminal (works in any assistant)

`pnpm run play` does all of the steps above in one command: it starts the dev server, opens the game in the Chrome or
Edge on this computer, focuses the canvas, runs your steps in order, and prints one JSON line per step.

```sh
pnpm run play -- --seed 42 wait:800 click:90:160 wait:1500 state hold:ArrowRight:600 state shot
```

- Steps: `wait:<ms>`, `press:<key>`, `hold:<key>:<ms>`, `move:<x>:<y>`, `click:<x>:<y>` (game pixels; holds the button
  100 ms), `state`, `shot[:<file.png>]` (saved under `screenshots/`, ignored by git), `eval:<expression>`.
- Options: `--seed <n>`, `--backend software`, `--url <url>` (use a server that is already running), `--headed` (show
  the window). `pnpm run play -- --help` lists them all.
- The run passed only if the last line is `"errors":[]` and the exit code is 0. Any error the page logs fails it.
- Timing is steadier than a browser tool: all steps run in one process, with no pause between tool calls.

## Notes

- `window.__game` is set up by `src/playtest.ts`, and the snapshot it returns is `Game.playtestState()` in
  `src/game.ts`. Add a field there (and to `PlaytestState`) when you need to check something new. Keep it plain numbers,
  strings, and arrays so a browser tool can print it. Positions in the state are world coordinates, not screen pixels.
- An older game without `window.__game` still has `window.BT` in a dev build: `BT.ticks`, `BT.activeBackend`, and
  `BT.captureFrame()` (it returns a PNG `Blob`) work straight away. See `use-dev-mode`.
- Both `window.__game` and `window.BT` exist only while the dev server runs the game. A built game has neither.
- `?seed=` reaches the game's own generator (`src/rng/Rng.ts`) through `readSeedParam()` in `src/playtest.ts`. It only
  helps if every random roll goes through that generator (or `BT.random`), never `Math.random()`. A restart rolls the
  next seed from the same generator, so the whole session stays reproducible. See `use-random`.
- If the browser pane or tab is hidden, the browser slows the page down and `ticks` climbs slowly. Keep it visible while
  testing anything that depends on timing.
- If nothing happens when you press keys, the canvas has lost focus, or the game is still on the title screen (check
  `screen` in the state). Focus the canvas again with `document.querySelector('canvas').focus()`.
