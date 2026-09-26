/**
 * Top-right HUD: one digital wristwatch sprite with the live HH:MM drawn into its LCD window. The
 * window's geometry (WATCH_LCD_*) lives in sprites.ts, shared with the painter that punches the hole.
 * Draws whatever minute game.ts hands in; DayClock owns the time.
 */

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { HUD_BAND_HEIGHT_PX } from '../game/Player';
import { cellRect, drawDigitString, WATCH_LCD_PADDING_PX, WATCH_LCD_X, WATCH_LCD_Y, WATCH_SHEET } from '../sprites';

const WATCH = {
    /** Screen edge to case edge; matches Counter's margin. */
    marginPx: 4,
} as const;

// The case must fit the HUD band, or it would draw into the playable area. Throw at load, not silently.
if (WATCH_SHEET.cellHeight > HUD_BAND_HEIGHT_PX) {
    throw new Error(
        `Watch.ts: watch sprite (${WATCH_SHEET.cellHeight}px tall) no longer fits inside ` +
            `HUD_BAND_HEIGHT_PX (${HUD_BAND_HEIGHT_PX}px) - resize one or the other.`,
    );
}

/** "6" -> "06". */
function padTwoDigits(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
}

/** "HH:MM". The modulo wraps a day past midnight; today's CONFIG never reaches it. */
function formatGameTime(gameTimeMinutes: number): string {
    const totalMinutes = Math.floor(gameTimeMinutes) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${padTwoDigits(hours)}:${padTwoDigits(minutes)}`;
}

/**
 * Anchored to BT.displaySize, read once in the constructor: the getter clones a Vector2i on every read,
 * and the screen never resizes after configure().
 */
export class Watch {
    private readonly watchSheet: SpriteSheet;
    private readonly digitsSheet: SpriteSheet;

    /** Fixed once the screen size is known. */
    private readonly casePos: Vector2i;
    private readonly digitsPos: Vector2i;

    constructor(watchSheet: SpriteSheet, digitsSheet: SpriteSheet) {
        this.watchSheet = watchSheet;
        this.digitsSheet = digitsSheet;

        const caseX = BT.displaySize.x - WATCH.marginPx - WATCH_SHEET.cellWidth;
        // Centred in the HUD band rather than flush with the top edge.
        const caseY = Math.floor((HUD_BAND_HEIGHT_PX - WATCH_SHEET.cellHeight) / 2);
        this.casePos = new Vector2i(caseX, caseY);

        // The LCD inset plus the pale margin the digits keep inside it.
        this.digitsPos = new Vector2i(
            caseX + WATCH_LCD_X + WATCH_LCD_PADDING_PX,
            caseY + WATCH_LCD_Y + WATCH_LCD_PADDING_PX,
        );
    }

    render(gameTimeMinutes: number): void {
        BT.drawSprite(this.watchSheet, cellRect(WATCH_SHEET, 0), this.casePos);
        drawDigitString(this.digitsSheet, formatGameTime(gameTimeMinutes), this.digitsPos);
    }
}
