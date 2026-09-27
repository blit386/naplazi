# AGENTS.md - working on a BLIT386 game

<!-- blit-kit:managed:start -->
<!-- Everything between the managed markers is owned by @blit386/kit and will be rewritten by a future
     `npx blit agents sync`. Put your own notes in the "Your notes" section below the end marker. -->

This file is the home base for anyone (a person or an AI assistant) working on this game. It is short on purpose: it
tells you how a BLIT386 game is shaped, the rules to follow, and which doc to open when you need detail. Read the linked
doc only when the task needs it - do not load everything at once.

BLIT386 is a palette-first 2D pixel engine. You draw with small whole-number coordinates and numbered colors, and the
engine puts pixels on a `<canvas>`. It runs on WebGPU when available and falls back to plain Canvas 2D otherwise, so a
game always renders.

## The shape of every game

A game is one class with up to four methods, handed to `bootstrap()`:

```js
import { bootstrap, BT, Color32, Rect2i, Vector2i } from 'blit386';

class Game {
  // configure() {}              // optional; omit to use the default 320x240 screen at 60 FPS
  async init() {
    // runs once at startup; load assets and set up colors here
    return true; // return true when setup succeeded
  }
  update() {} // runs ~60 times a second; read input, move things, change state
  render() {} // runs ~60 times a second; draw the current frame
}

bootstrap(Game);
```

`update()` decides what happens; `render()` only draws. Keep them separate.

## Hard rules (do not break these)

- Whole numbers for positions and sizes. Use `Vector2i(x, y)` for points and `Rect2i(x, y, w, h)` for boxes. Never pass
  raw floats as screen coordinates.
- Use the `BT` namespace for everything the engine does (`BT.clear`, `BT.drawRectFill`, `BT.isDown`, ...). Do not reach
  for internal classes.
- Colors are palette slots. Create a palette, put colors in numbered slots (slot 0 is always transparent, so start at
  1), and draw with those numbers. See `docs/palette.md`.
- `await` async loads. Anything that loads (fonts, sprites) returns a promise; forgetting `await` is the most common
  beginner bug.
- No fullscreen post-process effects in a starter. Effects like CRT need WebGPU and do not run on the Canvas 2D
  fallback. Keep starters working everywhere.
- Sound waits for the player. Browsers refuse to play audio until someone clicks, taps, or presses a key, so a game is
  silent until then - that is the web's rule, not a bug. `BT.musicPlay` is remembered and starts on the first
  interaction; `BT.soundPlay` before it is dropped. See `docs/audio.md`.
- No emoji anywhere in code, comments, or text.

## When you need detail, open the right doc

| You want to... | Read |
| --- | --- |
| Install Node, run the game, edit your first line | `docs/getting-started.md` |
| Understand init/update/render, timing, orientation | `docs/basics.md` |
| Clear the screen, draw rectangles, lines, text | `docs/drawing.md` |
| Read the keyboard, mouse, or a gamepad | `docs/input.md` |
| Make and use colors (palette, slots) | `docs/palette.md` |
| Roll dice, pick, shuffle, or seed a run so it repeats | `docs/random.md` |
| Generate terrain, caves, or patterns you can walk back to | `docs/random.md` (Terrain and patterns) |
| Play sound effects and music, or fix a silent game | `docs/audio.md` |
| Keep playing while you edit code or assets | `docs/hot-reload.md` |
| Tell a dev build from a release build (debug HUDs, cheat keys) | `docs/hot-reload.md` (Telling a dev build from a release build) |
| Show a loading screen while assets load | `docs/basics.md` (Waiting for assets) |
| Turn off the BLIT386 splash, or see it during development | `docs/basics.md` (The splash) |
| Fix a blank screen, an error, a broken change | `docs/when-something-breaks.md` |

When these local docs come up short, the live documentation at https://blit386.dev has the full engine reference, and
this game already knows how to query it:

- Ask the `blit386-docs` MCP server. If you set up Claude Code or Cursor, it is already configured (`.mcp.json` for
  Claude Code, `.cursor/mcp.json` for Cursor) and gives your assistant two tools: `search_docs` (full-text search - page
  titles, URLs, and excerpts) and `get_docs_summary` (the whole site's contents in one compact block).
- No MCP server? Fetch https://blit386.dev/llms.txt for the same summary as one plain text file.
- Reading a page? Request its URL with the header `Accept: text/markdown` and the site returns markdown instead of HTML
  \- far less to wade through.

The `ask-the-docs` skill walks an assistant through all three. The source code lives at
https://github.com/blit386/blit386 - go there only when the documentation itself does not answer the question.

## Running the game

From the project folder:

- `npm run dev` (or `pnpm run dev`) - start the game and open it in your browser.
- `npx blit run` - the same thing, the friendly way.
- `npx blit doctor` - check your setup if something seems off.
- `npx blit upgrade` - update BLIT386 to the latest version (and offer to fix any renamed API names for you).
- `npx blit migrate` - update old BLIT386 names in your game to the current ones (and enable hot reload on blit386
  1.4.0+). Add `--write` to apply the changes.

The `blit` helper is installed inside the project (it ships with `@blit386/kit`), so it is not on the system PATH.
Always invoke it through `npx blit ...` (or `pnpm exec blit ...`); plain `blit` only works inside package scripts.

While the dev server is running, most saves hot-reload instead of wiping the page: edits to `update()` / `render()` keep
your score and position; edits to `init()` re-run setup (optional `onHotReload` can copy fields across - see the
commented example in `src/game.js` / `src/game.ts`); edits to `configure()` screen settings reload the page; files under
`public/` swap in place. Details: `docs/hot-reload.md`.

## Good habits

- Change one small thing, then look at the browser. Fast loops beat big rewrites.
- Keep `update()` cheap: it runs 60 times a second. Avoid creating lots of new objects every frame in hot paths.
- The starter game (`src/game.js`, or `src/game.ts` in a TypeScript project) is yours to change. Read its comments
  first; they explain every line. Prefer starting from scratch over editing the starter around your idea? Run
  `npx blit clean` to replace it with an empty `init`/`update`/`render` skeleton - same shape, no demo code.
- Prefer method-body edits while you tweak gameplay so hot reload keeps state. Reach for `onHotReload` only when you
  edit `init()` a lot and care about carrying score (or similar) across the re-init.

## Working with an AI assistant

If you use Claude Code, open `CLAUDE.md` for the full project guide. Rules loaded automatically from `.claude/rules/`
tell Claude the engine's naming conventions. Skills in `.claude/skills/` are loaded on demand. `.mcp.json` points Claude
Code at the BLIT386 documentation server; Claude Code asks once whether to allow it, and saying yes lets your assistant
search the live docs.

If you use Cursor, `.cursor/rules/` loads rules automatically when you open the project, and `.cursor/mcp.json` points
it at the same documentation server.

For other assistants (Zed, Copilot, Windsurf, and others), this file is your assistant's home base.

Did not set up an assistant when you started the game? Run `npx blit agents add claude` or `npx blit agents add cursor`
to add its files now.

Run `npx blit agents sync` after a kit update (`npx blit upgrade`) to refresh the assistant files.

<!-- blit-kit:managed:end -->

## Your notes

Everything below the managed end marker is yours. Write down decisions, todos, or project-specific rules here - for
yourself or for your AI assistant. Kit updates (`npx blit agents sync`) rewrite only the managed part above and never
touch this section.

### Engine notes from building Beach Detector

Traced by reading the engine source while building the game (blit386 1.4.0). Only the `update()` note has been
re-checked against 1.7.0; look at the engine before you rely on the others for something new.

#### `update()` runs with no safety net

Each rendered frame the engine runs its `update()` steps (at most 8 catch-up steps), then `render()`, then schedules the
next `requestAnimationFrame` - all with no `try`/`catch` around any of it. If `update()`, or anything it calls, throws,
the loop never reaches the next frame: the game freezes on the last drawn frame, with no error overlay and no restart,
until the page is reloaded.

So anything that runs inside `update()` and calls something not 100% guaranteed never to throw (browser APIs above all:
storage, vibration, anything device-dependent) must be guarded. This is why a few things in `src/` look extra defensive:

- `src/game/Signals.ts` wraps `navigator.vibrate(...)` in `try`/`catch` - the method can exist and still throw (a
  cross-origin iframe without permission, some WebViews).
- `src/game/DayClock.ts` clamps its divisor with `Math.max(1, CONFIG.dayLengthSeconds)`, so a typo of `0` gives "day
  permanently over" instead of a `NaN` that would reach the watch's digit string, which `drawDigitString()` deliberately
  throws on.
- `src/ui/HighScore.ts` wraps every `localStorage` read and write - a full quota or private browsing must degrade to "no
  persistence", not stop the game.

#### The debug overlay is on by default; this game turns it off

`isOverlayEnabled` defaults to `true`, so a fresh scaffold draws the FPS/backend/palette overlay on top of everything.
`configure()` returns `isOverlayEnabled: false` because the game draws its own bitmap HUD. With the flag `false` the
overlay object is never built, so nothing can toggle it back on at runtime: to see it again, change `configure()` (a
full page reload, since it is a hardware setting).

#### Palette value changes: never call `BT.spritesRefresh()`

`BT.paletteSet()` prints "Active palette structure changed. Call BT.spritesRefresh()" whenever at least one sprite sheet
is loaded, whether or not the palette layout really changed. This game calls `paletteSet()` in `init()` (no sheets yet,
so no warning) and again in `restart()` (sheets loaded, so the warning prints on every restart). Ignore it: the palette
layout - which slot means what - never changes here, only slot values do (`buildPalette()`, `startPhaseTransition()`,
`BT.paletteFadeRange`). `spritesRefresh()` is for a changed layout, and after a value-only change it can drop a sheet
from the engine's registry. `src/palette/palette.ts` and `src/sprites.ts` carry the same warning in their headers.

#### Menu taps and pointer input

`BT.isPointerActive(slot)` is not "the button is down". For the mouse (slot 0) it turns `true` on every plain mouse move
over the canvas and only clears when the pointer leaves, so it reads as hover. The reliable signals are:

- `BT.isDown(BT.BTN_POINTER_A, slot)` - held: the left mouse button (slot 0) or a touch or pen contact (slots 1-3).
- `BT.isPressed(BT.BTN_POINTER_A, slot)` - the press edge, true only on the one `update()` tick the pointer goes from up
  to down. `src/ui/Tap.ts` and `Player.ts` both use it: a screen tap changes one lane, and holding does not keep
  stepping. Checking all four slots is what makes one function work for a phone tap and a desktop click.

A press that starts and ends between two `update()` ticks (under 1/60 s) is never seen. The `click` step of
`pnpm run play` therefore holds the button for 100 ms.

#### Keyboard defaults, and `BT.inputMap` replaces

The engine's built-in keyboard map gives player 0 the WASD keys and player 1 the arrow keys. This game has one player,
so `init()` calls:

```ts
BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft');
BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight');
```

Both calls name the default key and the arrow key together on purpose: `BT.inputMap` sets a button's whole key list, it
does not append to it. A call naming only `'ArrowLeft'` would silently un-map `KeyA`. Safe to run on every `init()` (hot
reload re-runs it): it always sets the same two lists.

#### Audio unlock is not synchronous with the gesture

`BT.isAudioUnlocked` does not turn `true` inside the same `pointerdown` or `keydown` handler that starts the unlock: it
flips only after the browser's `audioContext.resume()` settles, at least a microtask later. `BT.soundPlay` in that gap
is silently dropped and, unlike `BT.musicPlay`, not remembered. The one-shot sounds never hit this, because nothing
plays on the exact frame a screen transition is detected. The looping ambience does: `game.ts` sets
`ambiencePendingStart` on the tap frame and starts the bed on the first later `'play'` frame where `BT.isAudioUnlocked`
reads `true` (about two frames in practice). If a new system must play a sound tied to a first interaction, copy that
"check every frame until unlocked" pattern.

#### `AudioClip.synth` is capped at 60 seconds

`SynthParams.duration` throws above 60 s. Every clip here is far shorter (the longest ambience loop is 6 s), and
`Ambience.ts` loops a short clip with `BT.soundPlay({ loop: true })` instead. A background bed longer than a minute
would have to be a sound file in `public/`.

#### Input listeners live on the `<canvas>`

The pointer and keyboard subsystems (and the audio-unlock listener) attach to the canvas element, not `window` or
`document`. Synthetic DOM events dispatched anywhere else are never seen; dispatch them on `#blit386-canvas`. (Only the
tab-`blur` handler is on `window`.) `pnpm run play` drives real mouse and keyboard input through the browser, so it does
not hit this.

#### Hot reload and modules outside `src/game.ts`

`docs/hot-reload.md` only covers the game class. The `blit386()` plugin injects its accept handler into exactly one
module: the one containing `bootstrap(` (`src/game.ts`). Editing any module `game.ts` imports bubbles up to that
handler, and the engine then decides between a full re-init and a methods-only swap by string-diffing the class source
of `game.ts` alone. So:

- Editing only the body of a function or class in a helper module (say the math in `Beach.ts`) leaves `game.ts`'s text
  unchanged, gets a methods-only swap, and does not re-run `init()`. Objects already stored on `this` (`this.beach`,
  `this.beach`, ...) keep running the old code.
- Code called fresh every frame from `update()` or `render()` (a free function imported from a helper) does pick the
  edit up immediately, because ES module bindings are live.
- To force a re-init after changing a helper module's internals: also touch `game.ts`'s `init()`, constructor or a field
  initializer in the same save (even whitespace works), or reload the page.
