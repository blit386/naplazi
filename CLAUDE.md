<!-- blit-kit:managed:start -->
<!-- This block is managed by @blit386/kit. Run `npx blit agents sync` to update it. Put your own notes below the end marker. -->

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

## Commands

- `pnpm run dev` - start the dev server
- `pnpm run build` - build for production
- `pnpm run format` - format the code
- `pnpm run lint` - check code style
- `npx blit doctor` - check your setup
- `npx blit upgrade` - update BLIT386

<!-- blit-kit:managed:end -->

## Your notes

Add project-specific notes for Claude here. This section is yours.

- naplazi is the test bed for blit386 engine work. When `../../blit386/packages/blit386` exists, `vite.config.js`
  aliases `blit386` to its `src/` for both dev and build, and loads the `blit386()` plugin from its `dist/` (rebuilt on
  start by the monorepo's `scripts/ensure-engine-built.mjs`). Elsewhere (CI) the npm package is used.
  `BLIT386_ENGINE=npm` forces the npm package.
- Engine source edits full-reload the page by design; game code and `public/` assets still hot-swap.
- `pnpm run deploy` builds and uploads to Cloudflare Pages (project `naplazi`) from this machine.
- Tooling mirrors blit386: pre-commit runs lint-staged (Biome, Prettier, cspell) and commitlint; pre-push and CI run
  `pnpm run preflight` (format:check, typecheck, spellcheck, knip, build). Agent edits are formatted per file by
  `scripts/format-file.sh`. New words the spellchecker flags go in `cspell.json`.
- Agents play-test with `pnpm run play` (`scripts/play.mjs`, drives the local Chrome or Edge through playwright-core):
  see the `test-the-game` skill (`.claude/skills/`, which Cursor 2.4+ reads too). Both are hand-written stand-ins until
  the kit ships `blit play` and its own skill (BT-528). Dev builds expose `window.__game.state()`; `?seed=N` repeats a
  run.
- `BLIT386_ENGINE_DIR=<path to packages/blit386>` points dev and build at another engine checkout (a worktree) instead
  of `../../blit386/packages/blit386`. Typecheck still reads the main checkout's types.

### The game

naplazi is "Beach Detector" (brought over from the July 2026 game jam repo): a portrait 180x320 game. The player
side-steps left and right across a scrolling beach with a metal detector and follows the beeps - one signal sent through
four channels: audio, a border pulse, a blinking detector tip, phone vibration - to dig up buried items before a
two-minute day (06:00 to 22:00 on the watch) runs out. Screens: title, play, results; restart goes straight back to
play. Full engine gotchas from building it are in `AGENTS.md`, "Your notes".

`src/game.ts` stays thin on purpose: it reseeds `BT.random` on restart, builds the palette, loads every sprite sheet,
constructs the systems, wires their events together (the only place two systems ever meet), and drives the screen state
machine. Everything else is one small file per concern:

- `src/config.ts` - the shared `CONFIG` (screen size, day length, seed, volumes, feedback toggles, phase thresholds). A
  value only one system needs lives in a small const block at the top of that system's own file (`DETECTOR`, `PLAYER`).
- `src/sprites.ts` - sprite sheet geometry plus `loadSpriteSheets()` and `drawDigitString()`. Geometry only; colors live
  in `src/palette/palette.ts`.
- `src/palette/palette.ts` - the 64-slot layout (slots 1-27 the world ramp that the day and night fade touches, 28-33
  the fixed HUD colors, the rest free) and the phase builder and fader.
- `src/game/` - the world: `Beach`, `Player`, `Detector`, `Treasures`, `DayClock`, `Signals`, `Pickup`.
- `src/hud/` - `Counter` and `Watch`, bitmap only, no text anywhere.
- `src/audio/` - `Sfx` (synthesized tick, chime, alarm) and `Ambience` (the phase-based bed, cross-faded).
- `src/ui/` - `TitleScreen`, `ResultsScreen`, `HighScore` (`localStorage`, guarded), `Tap` (the shared "was the screen
  just tapped" helper).
- `src/playtest.ts` - the dev-only `window.__game`. `?seed=N` is the engine's, applied to `BT.random` before `init()`.
  `Game.playtestState()` in `game.ts` is the snapshot; add a field there when a test needs to check something new.

`Backpack`, `Haptics`, `Lanes`, `Pause` (in `src/game/`) and `SignalBar` (in `src/hud/`) are written but not wired into
`game.ts` yet (find panel, item types, the five-lane grid behind `CONFIG.lane*`). `knip.json` lists them under `ignore`;
delete each entry when its file gets used.

Design docs: `docs/design/game.md` describes the game as it plays today (update it when behavior changes);
`docs/design/roadmap.md` holds the lane-based redesign that is not built yet, in build order, and the open code cleanup.

Working rules for `src/`:

- Comments are JSDoc (`/** */`) on declarations, short, and only where the code does not already say it: a non-obvious
  constraint, a tuning rationale, a cross-file contract. Do not narrate what a line does, do not cite design documents
  or task numbers, and delete a comment the moment it goes stale.
- Anything that runs inside `update()` and can throw (storage, vibration, anything device-dependent) must be guarded:
  there is no outer catch, and an uncaught throw stops the game loop for good.
- Never move logic into `render()` or drawing into `update()`. Drive timing from `BT.deltaSeconds`, not from counting
  `update()` calls.
- `pnpm run sprites` regenerates `public/sprites/*.png` from `tools/make-sprites.mjs`. That script imports
  `src/palette/palette.ts` and `src/sprites.ts` directly through Node type stripping, so those two files may only import
  `blit386` (no relative imports) and must stay erasable TypeScript (no enums or parameter properties). Regenerated PNGs
  decode to the same pixels but may differ byte-for-byte on another Node/zlib version. How the generator works is
  written up in `tools/make-sprites.md`.
- Comments citing "PLAN.md section n" mean section n of `docs/design/game.md`. `TASK-nnn` labels come from the retired
  jam task list (in git history only). The code in `src/` is the source of truth.
