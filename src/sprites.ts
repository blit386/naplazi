/**
 * Sprite sheet geometry: which PNGs exist, how each is cut into equal cells, and named cell indices.
 * The pixel art lives in tools/make-sprites.mjs (which imports these same objects to size its
 * canvases); the colors live in palette/palette.ts. This file may only import from 'blit386' and must
 * stay erasable TypeScript, because the sprite generator runs it through Node type stripping.
 */

import { BT, type Palette, Rect2i, SpriteSheet, Vector2i } from 'blit386';

/** A sheet's grid plus where to load it from. Plain data, shared with tools/make-sprites.mjs. */
export interface SpriteGrid {
    /** Root-relative; the engine serves assets from public/. */
    readonly url: string;
    readonly cellWidth: number;
    readonly cellHeight: number;
    readonly columns: number;
    readonly rows: number;
}

function grid(url: string, cellWidth: number, cellHeight: number, columns: number, rows: number): SpriteGrid {
    return { url, cellWidth, cellHeight, columns, rows };
}

/** The player, seen from behind, one pose. */
export const PLAYER_SHEET = grid('/sprites/player.png', 16, 24, 1, 1);

/** The detector tip, radially symmetric: BT.drawSprite cannot rotate, so the tip must look right at every rod angle. */
export const DETECTOR_HEAD_SHEET = grid('/sprites/detector-head.png', 8, 8, 1, 1);

/** Symmetric for the same reason: stamped without rotating or flipping. */
export const FOOTPRINT_SHEET = grid('/sprites/footprint.png', 4, 4, 1, 1);

/** Buried items. Only the first row is used; the second is reserved so items can be added without renumbering. */
export const ITEM_CELL = 12;
export const ITEMS_SHEET = grid('/sprites/items.png', ITEM_CELL, ITEM_CELL, 4, 2);

/** The same items at twice the size, for the pickup reveal (the engine cannot scale at draw time). Same index order as ITEMS_SHEET. */
export const ITEM_LARGE_CELL = 24;
export const ITEMS_LARGE_SHEET = grid('/sprites/items-large.png', ITEM_LARGE_CELL, ITEM_LARGE_CELL, 4, 2);

/** Item indices, shared by both item sheets. 4-7 are the reserved second row. */
export const ITEM_STARFISH = 0;
export const ITEM_CAN = 1;
export const ITEM_SHELL = 2;
export const ITEM_COIN = 3;

/** Sand decoration. Cell 3 is reserved. */
export const DECORATION_CELL = 8;
export const DECORATIONS_SHEET = grid('/sprites/decorations.png', DECORATION_CELL, DECORATION_CELL, 4, 1);
export const DECORATION_LITTER = 0;
export const DECORATION_CUP_RING = 1;
export const DECORATION_SPECK = 2;

/** Digits 0-9 plus a colon at index 10, fixed cell width, for the text-free HUD. */
export const DIGIT_CELL_WIDTH = 6;
export const DIGIT_CELL_HEIGHT = 8;
export const DIGITS_SHEET = grid('/sprites/digits.png', DIGIT_CELL_WIDTH, DIGIT_CELL_HEIGHT, 11, 1);
export const DIGIT_COLON_INDEX = 10;

/**
 * Inked extent of a glyph inside its cell: 5x7, top-left aligned, with the spare column and row as
 * kerning. Anything centring a digit string must use these, or the string lands a pixel off centre.
 */
export const DIGIT_GLYPH_WIDTH = 5;
export const DIGIT_GLYPH_HEIGHT = 7;

/**
 * The watch: a resin-style digital case with an LCD window and side buttons, no digits baked in
 * (Watch.ts draws HH:MM into the window). Every number is derived from the digit cell size, so the
 * case still fits its readout if the font changes. The WATCH_LCD_* constants are read by both the
 * painter (which punches the window) and Watch.ts (which fills it).
 */
export const WATCH_LCD_PADDING_PX = 2; // LCD margin around the digits
const WATCH_CASE_BORDER_PX = 4; // case thickness between the window and the edge
export const WATCH_BUTTON_WIDTH_PX = 2; // side buttons, left and right
const WATCH_TIME_LENGTH = '00:00'.length;
// Sized to the inked extent: the last glyph's kerning column paints nothing.
export const WATCH_LCD_WIDTH =
    (WATCH_TIME_LENGTH - 1) * DIGIT_CELL_WIDTH + DIGIT_GLYPH_WIDTH + WATCH_LCD_PADDING_PX * 2;
export const WATCH_LCD_HEIGHT = DIGIT_GLYPH_HEIGHT + WATCH_LCD_PADDING_PX * 2;
/** Window top-left inside the cell. The case is symmetric, so these also give the cell size. */
export const WATCH_LCD_X = WATCH_BUTTON_WIDTH_PX + WATCH_CASE_BORDER_PX;
export const WATCH_LCD_Y = WATCH_CASE_BORDER_PX;
export const WATCH_SHEET = grid(
    '/sprites/watch.png',
    WATCH_LCD_X * 2 + WATCH_LCD_WIDTH,
    WATCH_LCD_Y * 2 + WATCH_LCD_HEIGHT,
    1,
    1,
);

/** Title and results icons, painted in HUD slots only so the day fade never touches them. Cells 5-7 are reserved. */
export const ICON_CELL = 12;
export const ICONS_SHEET = grid('/sprites/icons.png', ICON_CELL, ICON_CELL, 4, 2);
export const ICON_FOUND = 0; // magnifying glass: items found this run
export const ICON_BEST = 1; // star: best across runs
export const ICON_SEED = 2; // die: which beach
export const ICON_PLAY = 3; // triangle: tap to start
export const ICON_RESTART = 4; // circular arrow: play again

/** Row-major cell index to the rectangle BT.drawSprite expects. */
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

/**
 * Draws '0'-'9' and ':' from DIGITS_SHEET, one cell per character with no extra gap. Throws on any
 * other character rather than drawing a garbage cell. Returns the width drawn.
 */
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

/** Full PNG size of a sheet, for tools/make-sprites.mjs. */
export function sheetSize(sheetGrid: SpriteGrid): Vector2i {
    return new Vector2i(sheetGrid.columns * sheetGrid.cellWidth, sheetGrid.rows * sheetGrid.cellHeight);
}

/** Every sheet, loaded and indexed, so init() awaits one call. */
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

/**
 * Loads every sheet in parallel and indexes each against `palette` by exact RGB. A sprite painted
 * with a color missing from the palette throws here, at startup. Never followed by
 * BT.spritesRefresh().
 */
export async function loadSpriteSheets(palette: Palette): Promise<SpriteSheets> {
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

    for (const sheet of Object.values(sheets)) {
        sheet.indexize(palette);
    }

    return sheets;
}
