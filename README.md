# naplazi - Beach Detector

A tiny beach treasure-hunting game built with [BLIT386](https://www.npmjs.com/package/blit386). You walk a stretch of
sand with a metal detector, follow the beeps, and dig up whatever the sea left behind before the day runs out.

## Run it

You need [Node.js](https://nodejs.org) installed once (download the big LTS button). Then, in this folder:

```bash
pnpm install
pnpm run dev
```

A web address like `http://localhost:5173` appears. Open it in your browser to play.

## How to play

Tap the pulsing badge in the middle of the screen to start (this is also what turns the sound on - browsers keep every
game silent until you touch or click something).

- Phone or tablet: press and hold the left or right half of the screen, below the counter and watch strip at the very
  top. The player steps that way, and the detector rod swings the same direction.
- Computer: click and hold the left or right half of the game window with the mouse, or use the left and right arrow
  keys (or `A` and `D`).

Walk until the detector's beep speeds up, then line yourself up until it is as fast as it gets - that means you are
standing right over something buried. Walk over it and it digs up on its own; no button to press. The item pops up in
the middle of the screen so you can see what you found, then slides away, and the counter in the top-left corner goes up
by one.

The watch in the top-right corner shows the in-game time. Two real minutes run from 06:00 to 22:00; when the watch
reaches 22:00 it beeps and the day ends. The results screen shows how many things you found this run, your best-ever
count on this browser, and the random seed that produced this exact beach - tap the circular-arrow button to play again.

There is nothing to fail: everything buried is worth digging up, and everything is worth exactly one point. The only
challenge is finding things before time runs out.

## Change the game

Every tunable number lives in a named constant with a comment explaining what it does - open a file, change a number,
save, and your browser updates by itself. Editing `update()` or `render()` (or a module-level constant they use) keeps
the game running with your current progress intact; editing `init()` or a constructor re-runs setup instead. A few
things to try:

- `src/config.ts` - the shared settings: `dayLengthSeconds` (how long a run lasts), `seed` and `reseedOnRestart` (which
  beach you get, and whether restarting rolls a new one), the volume sliders, and the four `beep*` flags that switch the
  sound, border pulse, detector blink and vibration feedback channels on or off one at a time.
- `src/game/Detector.ts` - the `DETECTOR` block: `rodLengthPx`, `maxAngleDeg` and `turnSpeedDegPerSec` shape how the rod
  swings; `detectRadiusPx`, `silenceThresholdPx`, `beepIntervalFastMs`, `beepIntervalSlowMs` and `beepCurvePower` shape
  how the beep speeds up as you get closer. The same file also has `COLLECTION_MODE: 'head' | 'body'` - `'head'` (the
  default) digs up whatever the detector's tip is over; `'body'` digs up whatever is under your own feet instead.
- `src/palette/palette.ts` - every color in the game as a named palette slot, three lighting phases (morning, noon,
  evening) worth. Change a color here and everything drawn with that slot recolors.
- `public/sprites/*.png` - the pixel art itself. Edit a PNG directly, or regenerate the whole set with
  `pnpm run sprites` (see `tools/make-sprites.mjs`); either way, the picture updates in the running game without a page
  reload.

More about hot reload: `docs/hot-reload.md`.

## Helpful commands

- `pnpm run dev` - start the game (the everyday command).
- `pnpm run build` - create the static production site in `dist/`.
- `pnpm run preflight` - everything CI checks: format, types, spelling, unused code, and a build.
- `pnpm run sprites` - regenerate every sprite sheet in `public/sprites/` from `tools/make-sprites.mjs`.
- `pnpm run play -- --seed 42 wait:1000 state` - play-test in a real browser from the terminal (see
  `pnpm run play -- --help`).
- `npx blit run` - the same thing as `pnpm run dev`, the friendly way.
- `npx blit doctor` - check your setup if something seems off.
- `npx blit upgrade` - update BLIT386 to the latest version.

The `blit` helper is installed inside this project, not on your whole computer, so it needs `npx` in front (it means
"run the helper that lives in this project"). Typing plain `blit` would say "command not found."

## Peek behind the scenes

While the game runs, you can open the engine overlay - a small panel showing frames per second and which renderer is
active. This game turns it off in `configure()` because it draws its own HUD; set `isOverlayEnabled: true` there to get
it back.

- Keyboard: press the key just below Esc, in the very top-left corner of your keyboard. On US keyboards it is printed
  with `` ` `` and `~`. Classic PC games like Quake used that exact key to open their command console, and BLIT386 keeps
  the tradition. The engine listens for the key's position, not the symbol printed on it - on some keyboard layouts the
  `~` symbol sits somewhere else entirely, but the overlay key is still the one below Esc.
- No keyboard, or can't find the key? Click or tap the bottom-left corner of the game screen instead. That works
  everywhere: phones, tablets, the Steam Deck.

## Share your game

When you want to show your game to a friend:

```bash
pnpm run build
```

This packs everything into a `dist/` folder - a plain website, no server needed. Drag that folder onto a free static
host such as [Netlify Drop](https://app.netlify.com/drop) or [Cloudflare Pages](https://pages.cloudflare.com), and you
get a link anyone can open.

## When something breaks

It will - that is normal. Open `docs/when-something-breaks.md`. It explains how to read error messages and walks through
the usual suspects: blank screens, "command not found," forgotten `await`, and more.

## Learn more

- `AGENTS.md` - a short home base for you or an AI assistant, plus this game's accumulated engine notes.
- `CLAUDE.md` - the same for Claude Code, including a map of the `src/` folders.
- `docs/` - nine friendly guides: getting started, the game loop, drawing, input, colors, randomness and world
  generation, sound, hot reload, and fixing problems.
- [blit386.dev](https://blit386.dev) - the full BLIT386 documentation site. If you set up Claude Code or Cursor, it can
  search this site directly - that is what the `.mcp.json` file here (Claude Code) or `.cursor/mcp.json` (Cursor) is
  for.
- [blit386.dev/llms.txt](https://blit386.dev/llms.txt) - the whole site's contents as one plain text file, handy for
  skimming or pasting into a chat.

## License

ISC - see `LICENSE`. Made by Václav Vančura ([@vancura](https://github.com/vancura)) and Jan Černý
([@chemix](https://github.com/chemix)).
