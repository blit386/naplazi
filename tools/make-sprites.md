# How `tools/make-sprites.mjs` works

`tools/make-sprites.mjs` paints every PNG under `public/sprites/` from the same layout and colors the game already uses.
Run it with `pnpm run sprites`, which is `node --experimental-strip-types tools/make-sprites.mjs`. The type-stripping
flag lets the script import `src/sprites.ts` and `src/palette/palette.ts` directly, so there is no second copy of the
sheet sizes or the color table.

The PNGs it writes are committed. The game never draws from this script at runtime. It loads those files.

## Why the script exists

BLIT386 sprites do not store RGB. A pixel is a palette slot. At startup, `loadSpriteSheets()` in `src/sprites.ts` loads
each PNG and calls `sheet.indexize(palette)`, which matches every opaque pixel to a slot by exact RGB.

That match only stays correct if the bytes in the PNG are the same RGB values stored in the palette. The script enforces
that in two ways:

- It paints with `colorOf(slot)`, which reads the slot from `buildPalette(REFERENCE_PHASE)`. `REFERENCE_PHASE` is the
  one fixed phase used for authoring. Later in the day the slot values change, but the slot a pixel resolved to does
  not.
- It writes the PNG itself, with only the three required chunks (`IHDR`, `IDAT`, `IEND`). A normal PNG library often
  adds a color-profile chunk (`iCCP`, `gAMA`, or `sRGB`). A browser can then shift the decoded RGB to match that
  profile, and `indexize()` either throws or lands on the wrong slot.

Before any drawing, it also checks that no two painted slots share the same RGB in that reference phase.
`Palette.findColor` returns the first exact match, so a collision would silently index the later slot as the earlier
one.

The encoder uses a fixed zlib level, so running the script twice produces byte-identical files. A re-run that did not
change any art does not touch git.

## What it reads, and what that constrains

It imports two kinds of data:

- From `src/sprites.ts`: sheet URLs, cell sizes, columns and rows, and named cell indices (`PLAYER_SHEET`, `ITEM_COIN`,
  `WATCH_LCD_*`, and so on). `sheetSize()` and `cellRect()` tell it how big each canvas is and where each cell sits.
- From `src/palette/palette.ts`: slot constants (`OBJECT_SKIN`, `HUD_INK`, and the rest) and `buildPalette()`.

Because Node imports those files with type stripping and no bundler, both files may only import `blit386`, and they must
stay erasable TypeScript: no enums, no parameter properties. A palette or layout edit that breaks that also breaks
`pnpm run sprites`.

## How a sheet gets painted

The script keeps a tiny RGBA buffer (`createImage` / `setPixel`) and a few primitives: `fillRect`, `disk`, `ring`,
`arcRing`, `fillPolygon`, plus `paintArt`, which stamps ASCII rows through a character-to-color legend. `.` leaves a
pixel transparent. `mirrorHalf` doubles a left half so the player, can, and shell are exactly symmetric. `upscaleRegion`
copies `items.png` into `items-large.png` at 2x with nearest-neighbor blocks, because the engine cannot scale a sprite
at draw time.

Each sheet is one block that builds an image and calls `savePng(SHEET.url, image)`:

| File | What it is |
| --- | --- |
| `player.png` | 16x24 figure from behind, mirrored ASCII art |
| `detector-head.png` | 8x8 radial coil. The engine cannot rotate sprites, so the tip has to look the same at any angle |
| `footprint.png` | 4x4 symmetric stamp |
| `watch.png` | Case, buttons, and LCD window sized from `WATCH_LCD_*`. Digits are not baked in |
| `items.png` | 4x2 grid of 12x12 cells: starfish, can, shell, coin. Second row left empty |
| `items-large.png` | Same four items, 24x24, copied and doubled from `items.png` |
| `decorations.png` | Litter, cup ring, speck. Fourth cell empty |
| `digits.png` | 0-9 and a colon, 5x7 ink inside a 6x8 cell. The script asserts that ink size matches `DIGIT_GLYPH_WIDTH` and `DIGIT_GLYPH_HEIGHT` |
| `icons.png` | Magnifier, star, die, play triangle, restart arrow. HUD colors only, so the day/night fade (slots 1-27) never recolors the title and results screens |

World sprites use object and sand slots. Icons and the watch use HUD slots (28-33), which stay fixed all day.

## How the game uses the result

`init()` in `src/game.ts` awaits `loadSpriteSheets(palette)`. That loads every URL from `public/sprites/` in parallel,
then `indexize`s each sheet. Systems then draw a cell with `BT.drawSprite(sheet, cellRect(SHEET, index), position)`: the
player, the detector tip, footprints, buried items, the pickup reveal, the watch digits, and the title and results
icons.

While `pnpm run dev` is running, saving a PNG under `public/` hot-replaces that sheet. Regenerating the set with
`pnpm run sprites` is the same path: the pictures update without a page reload, as long as the sheet size did not
change.

Edit this script when the pixel art itself changes. Edit `src/sprites.ts` when a sheet's grid or a cell index changes,
and `src/palette/palette.ts` when a slot's color changes. After either of those, run `pnpm run sprites` again so the
committed PNGs match.
