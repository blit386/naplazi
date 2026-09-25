// Sprite sheet layout: which PNG files exist, how each one is cut into a
// fixed grid of equal-sized cells, and named indices for the cells that
// matter. This file owns the *geometry* only - the actual pixel art lives in
// tools/make-sprites.mjs (which paints the PNGs) and the actual *colors* live
// in src/palette/palette.ts (which this file never duplicates).
//
// Why a separate file from src/palette/palette.ts? That file answers "what
// color is slot N"; this one answers "where in which PNG is sprite N" - two
// different questions with two different lifetimes (colors change every time
// of day, sheet geometry never does once an asset ships). Splitting them
// keeps each file answerable by reading only its own top-to-bottom pass.
//
// Every sheet below is a plain grid: `columns` cells across, `rows` cells
// down, each cell exactly `cellWidth` x `cellHeight` pixels. `cellRect()`
// turns a cell index into the Rect2i `BT.drawSprite` wants, so every future
// system (Player, Detector, Treasures, HUD Counter/Watch, ...) asks this file
// for a rectangle instead of hand-computing `index * cellWidth` itself.

import { BT, type Palette, Rect2i, SpriteSheet, Vector2i } from 'blit386';

// A sheet's grid shape plus where to load it from. Deliberately not a class -
// this is pure data, and tools/make-sprites.mjs imports the very same objects
// to know exactly what size PNG to paint (see that file's imports from here).
export interface SpriteGrid {
    readonly url: string; // root-relative path; BLIT386 loads assets from public/, see docs
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly columns: number;
    readonly rows: number;
}

function grid(url: string, cellWidth: number, cellHeight: number, columns: number, rows: number): SpriteGrid {
    return { url, cellWidth, cellHeight, columns, rows };
}

// --- Sheets -----------------------------------------------------------------
// Single-sprite "sheets" (a 1x1 grid) still go through the same SpriteGrid
// shape as the multi-cell ones below, so every sheet is read the same way.

// The player, seen from behind, one fixed pose. 16 wide x 24 tall - big
// enough to read as a person on a 180-wide screen, small enough to leave
// most of the screen for the beach around it.
export const PLAYER_SHEET = grid('/sprites/player.png', 16, 24, 1, 1);

// The detector's tip: a coil/ring, drawn radially symmetric on purpose - see
// tools/make-sprites.mjs. BT.drawSprite has no rotation parameter (checked in
// blit386.d.ts; TODO.md TASK-009 calls this out), so a sprite that looks the
// same at any angle is the only way to swing the rod without the tip looking
// wrong.
export const DETECTOR_HEAD_SHEET = grid('/sprites/detector-head.png', 8, 8, 1, 1);

// A footprint stamp, also symmetric (see tools/make-sprites.mjs) - the same
// reason as the detector head: it is stamped down without rotating or
// flipping, whichever way the player just stepped.
export const FOOTPRINT_SHEET = grid('/sprites/footprint.png', 4, 4, 1, 1);

// Buried items, small size: a 4x2 grid of 12x12 cells. Only the first row is
// used today; the second row is reserved (fully transparent) so a future
// task can add more items without resizing the sheet or renumbering anything
// that already reads from it.
export const ITEM_CELL = 12;
export const ITEMS_SHEET = grid('/sprites/items.png', ITEM_CELL, ITEM_CELL, 4, 2);

// The same items again, twice the size, for the "pickup reveal" (TASK-017):
// the engine cannot scale a sprite up at draw time (see PLAN.md section 9,
// Non-goals), so the bigger version has to exist as its own real sprite.
// Same grid shape, same index order as ITEMS_SHEET - index 0 in one is
// always the large version of index 0 in the other.
export const ITEM_LARGE_CELL = 24;
export const ITEMS_LARGE_SHEET = grid('/sprites/items-large.png', ITEM_LARGE_CELL, ITEM_LARGE_CELL, 4, 2);

// Item indices - shared between ITEMS_SHEET and ITEMS_LARGE_SHEET.
export const ITEM_STARFISH = 0;
export const ITEM_CAN = 1;
export const ITEM_SHELL = 2;
export const ITEM_COIN = 3;
// Indices 4-7 are the reserved, empty second row of both item sheets.

// Loose decoration scattered on the sand: litter, a cup-ring stain, and a
// dark speck. A 4x1 grid of 8x8 cells; the fourth cell is reserved.
export const DECORATION_CELL = 8;
export const DECORATIONS_SHEET = grid('/sprites/decorations.png', DECORATION_CELL, DECORATION_CELL, 4, 1);
export const DECORATION_LITTER = 0;
export const DECORATION_CUP_RING = 1;
export const DECORATION_SPECK = 2;
// Index 3 is reserved (empty) for future decoration.

// Bitmap digits 0-9 plus a colon, one row, fixed cell width - exactly what
// TODO.md TASK-013's Counter and Watch need to draw numbers without any
// text/font rendering (PLAN.md section 4.11 asks for zero text in the HUD).
export const DIGIT_CELL_WIDTH = 6;
export const DIGIT_CELL_HEIGHT = 8;
export const DIGITS_SHEET = grid('/sprites/digits.png', DIGIT_CELL_WIDTH, DIGIT_CELL_HEIGHT, 11, 1);
// Indices 0-9 are the matching digit; index 10 is the colon.
export const DIGIT_COLON_INDEX = 10;
// How much of a cell a glyph actually INKS: every glyph is painted 5 wide x 7
// tall, left- and top-aligned inside its 6x8 cell, and the spare right column
// plus bottom row are kerning space (see the glyph art in
// tools/make-sprites.mjs, which asserts these two numbers against it). Named
// here because the difference matters to anything that CENTRES a digit string
// instead of just placing it: the last glyph of a string contributes its
// kerning column too, so a run of digits looks a pixel left of centre if the
// cell size is used as the ink size. WATCH_LCD_WIDTH/HEIGHT below is the one
// place today that cares.
export const DIGIT_GLYPH_WIDTH = 5;
export const DIGIT_GLYPH_HEIGHT = 7;

// The watch: ONE generic digital wristwatch in the "cheap resin LCD" style - a
// dark case with a pale LCD window punched into it and four side buttons; no
// hands, no dial. No digits are baked into the PNG: TASK-013's Watch.ts draws
// the live HH:MM into that window from DIGITS_SHEET above. Generic shape only,
// no logo and no branded design, per TODO.md TASK-006.
//
// The HUD used to carry an analog dial drawn NEXT TO a separate digital plate -
// two watches side by side in one corner, which read as clutter. It is one
// widget now, so the window the digits land in became shared geometry rather
// than a number Watch.ts and tools/make-sprites.mjs each guess at on their own:
// the WATCH_LCD_* constants below are the single description of that window,
// read by the painter (which punches the hole) and by Watch.ts (which fills it).
//
// Declared down here, after DIGIT_CELL_WIDTH/HEIGHT rather than up beside the
// other sheets, because every number below is DERIVED from the digit cell size:
// the LCD window is the "HH:MM" string plus a quiet margin, and the case is
// that window plus its resin border and its buttons. Change the font's cell
// size and the watch still fits its readout, with no second number to update.
export const WATCH_LCD_PADDING_PX = 2; // pale LCD margin around the digits
const WATCH_CASE_BORDER_PX = 4; // resin case thickness between LCD window and case edge
export const WATCH_BUTTON_WIDTH_PX = 2; // the side buttons, sticking out left and right
// "HH:MM" is always exactly 5 glyphs wide - see Watch.ts's formatGameTime().
const WATCH_TIME_LENGTH = '00:00'.length;
// The window is sized to the readout's INKED extent, not to its cell extent:
// the string advances a full cell per glyph, but the very last glyph's kerning
// column (and every glyph's kerning row) paints nothing, so counting them here
// would leave the time sitting a pixel up and to the left inside its own LCD.
export const WATCH_LCD_WIDTH =
    (WATCH_TIME_LENGTH - 1) * DIGIT_CELL_WIDTH + DIGIT_GLYPH_WIDTH + WATCH_LCD_PADDING_PX * 2;
export const WATCH_LCD_HEIGHT = DIGIT_GLYPH_HEIGHT + WATCH_LCD_PADDING_PX * 2;
// Where the LCD window's top-left pixel sits inside the sprite cell. The case
// is symmetric, so these two insets also give the cell size below.
export const WATCH_LCD_X = WATCH_BUTTON_WIDTH_PX + WATCH_CASE_BORDER_PX;
export const WATCH_LCD_Y = WATCH_CASE_BORDER_PX;
export const WATCH_SHEET = grid(
    '/sprites/watch.png',
    WATCH_LCD_X * 2 + WATCH_LCD_WIDTH,
    WATCH_LCD_Y * 2 + WATCH_LCD_HEIGHT,
    1,
    1,
);

// Small bitmap icons for the title and results screens (TODO.md TASK-014). A 4x2 grid of 12x12 cells,
// the same shape as ITEMS_SHEET above - only the first five cells are used; the last three are
// reserved (fully transparent) the same way ITEMS_SHEET/DECORATIONS_SHEET reserve room to grow.
//
// Painted using ONLY the HUD-range palette slots (HUD_INK/HUD_PAPER/HUD_ACCENT/HUD_METAL - see
// src/palette/palette.ts's slot-layout comment), never the world ramp - these two screens have no
// "time of day" of their own, so TASK-015's eventual fade (which only ever touches slots 1-27) must
// never be able to shift their colors.
export const ICON_CELL = 12;
export const ICONS_SHEET = grid('/sprites/icons.png', ICON_CELL, ICON_CELL, 4, 2);
export const ICON_FOUND = 0; // magnifying glass - "how many items this run found" (ResultsScreen.ts)
export const ICON_BEST = 1; // star - "the best count across every run this browser remembers" (ResultsScreen.ts)
export const ICON_SEED = 2; // die - "which random beach this was" (ResultsScreen.ts)
export const ICON_PLAY = 3; // right-pointing triangle - "tap here to start" (TitleScreen.ts)
export const ICON_RESTART = 4; // circular arrow - "tap here to play again" (ResultsScreen.ts)
// Indices 5-7 are reserved (empty) for future icons.

// --- Geometry helpers ---------------------------------------------------------

// Turns a cell index (row-major: left to right, then top to bottom, same
// order a book reads in) into the pixel rectangle BT.drawSprite expects.
export function cellRect(sheetGrid: SpriteGrid, index: number): Rect2i {
    const column = index % sheetGrid.columns;
    const row = Math.floor(index / sheetGrid.columns);
    return new Rect2i(
        column * sheetGrid.cellWidth,
        row * sheetGrid.cellHeight,
        sheetGrid.cellWidth,
        sheetGrid.cellHeight,
    );
}

// Draws a string of digits (and, optionally, colons) as a row of sprites cut
// from DIGITS_SHEET, one glyph per character, left to right, with no gap
// between cells (the sheet's own spare column - see the glyph art in
// tools/make-sprites.mjs - already reads as kerning space). This is the ONE
// place this game turns a number into pixels: TASK-013's Counter.ts (the
// collected-item count) and Watch.ts (the digital HH:MM readout) both call
// this instead of each hand-rolling its own "walk the string, look up a
// cell" loop, and TASK-014's src/ui/ResultsScreen.ts (count, seed, best
// score) reuses it too - see this task's own report for why it lives here in
// sprites.ts rather than under src/hud/: this file already owns DIGITS_SHEET,
// DIGIT_CELL_WIDTH, and DIGIT_COLON_INDEX (the three things this function is
// built from), and a plain "turn characters into drawn cells" helper is a
// geometry/drawing concern like cellRect() above, not a specific HUD
// widget's business - src/ui/'s eventual results screen can reach for it
// without importing from src/hud/ at all.
//
// Deliberately narrow on purpose: only '0'-'9' and ':' are drawable, because
// those are the only glyphs DIGITS_SHEET contains (PLAN.md section 4.11
// rules out any other on-screen text). Passing anything else throws
// immediately - loudly, at the exact call site with the bad text - rather
// than silently drawing whatever garbage cell index the bad character
// happened to produce.
//
// Returns the total pixel width drawn, so a caller that needs to right-align
// or centre the string (see Watch.ts) can measure it without drawing twice.
export function drawDigitString(sheet: SpriteSheet, text: string, pos: Vector2i): number {
    for (let i = 0; i < text.length; i += 1) {
        const char = text.charAt(i);
        const index = char === ':' ? DIGIT_COLON_INDEX : Number(char);
        if (!Number.isInteger(index) || index < 0 || index > DIGIT_COLON_INDEX) {
            throw new Error(`drawDigitString: "${text}" contains "${char}", which is not a drawable 0-9 or ":" glyph.`);
        }
        BT.drawSprite(sheet, cellRect(DIGITS_SHEET, index), new Vector2i(pos.x + i * DIGIT_CELL_WIDTH, pos.y));
    }
    return text.length * DIGIT_CELL_WIDTH;
}

// The full pixel size of a sheet's PNG - columns/rows times cell size. Used
// by tools/make-sprites.mjs to know how big a canvas to paint.
export function sheetSize(sheetGrid: SpriteGrid): Vector2i {
    return new Vector2i(sheetGrid.columns * sheetGrid.cellWidth, sheetGrid.rows * sheetGrid.cellHeight);
}

// --- Loading -----------------------------------------------------------------

// Every sprite sheet the game uses, loaded and indexed against the active
// palette. One object so src/game.ts's init() can await a single call
// instead of juggling eight separate promises by hand.
export interface SpriteSheets {
    player: SpriteSheet;
    detectorHead: SpriteSheet;
    footprint: SpriteSheet;
    watch: SpriteSheet;
    items: SpriteSheet;
    itemsLarge: SpriteSheet;
    decorations: SpriteSheet;
    digits: SpriteSheet;
    icons: SpriteSheet;
}

// Loads every sheet above and indexes each one against `palette` (matches
// every opaque pixel's exact RGB to a palette slot - see docs/palette.md and
// the big comment at the top of src/palette/palette.ts for why this project
// indexes by hand instead of using SpriteSheet.loadIndexed). Must be awaited
// in init(), never called from update()/render() - loading and indexing a
// sheet is way too slow to do 60 times a second.
export async function loadSpriteSheets(palette: Palette): Promise<SpriteSheets> {
    // Load every PNG in parallel - nothing here depends on another sheet
    // having finished first, so there is no reason to await them one by one.
    const [player, detectorHead, footprint, watch, items, itemsLarge, decorations, digits, icons] = await Promise.all([
        SpriteSheet.load(PLAYER_SHEET.url),
        SpriteSheet.load(DETECTOR_HEAD_SHEET.url),
        SpriteSheet.load(FOOTPRINT_SHEET.url),
        SpriteSheet.load(WATCH_SHEET.url),
        SpriteSheet.load(ITEMS_SHEET.url),
        SpriteSheet.load(ITEMS_LARGE_SHEET.url),
        SpriteSheet.load(DECORATIONS_SHEET.url),
        SpriteSheet.load(DIGITS_SHEET.url),
        SpriteSheet.load(ICONS_SHEET.url),
    ]);

    const sheets: SpriteSheets = {
        player,
        detectorHead,
        footprint,
        watch,
        items,
        itemsLarge,
        decorations,
        digits,
        icons,
    };

    // Indexing converts each sheet's RGBA pixels to palette slot numbers by
    // exact color match. If a sprite was painted with a color that is not in
    // `palette`, this throws here - at startup, loudly - instead of drawing
    // silently wrong pixels later. Never followed by BT.spritesRefresh(): see
    // the warning in src/palette/palette.ts's header comment.
    for (const sheet of Object.values(sheets)) {
        sheet.indexize(palette);
    }

    return sheets;
}
