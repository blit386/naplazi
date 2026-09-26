/** Top-left HUD: the collected count as bitmap digits on a plate. The HUD renders no text anywhere. */

import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { HUD_INK, HUD_PAPER } from '../palette/palette';
import { DIGIT_CELL_HEIGHT, DIGIT_CELL_WIDTH, drawDigitString } from '../sprites';

const COUNTER = {
    /** Screen corner to plate edge. */
    marginPx: 4,
    /** Plate edge to digits. */
    paddingPx: 2,
} as const;

/** Draws whatever count game.ts hands in; Treasures owns the number. */
export class Counter {
    private readonly digitsSheet: SpriteSheet;

    constructor(digitsSheet: SpriteSheet) {
        this.digitsSheet = digitsSheet;
    }

    /** The plate grows with the digit count; only the watch uses fixed-width formatting. */
    render(collectedCount: number): void {
        const text = String(collectedCount);
        const digitsWidth = text.length * DIGIT_CELL_WIDTH;

        const plateRect = new Rect2i(
            COUNTER.marginPx,
            COUNTER.marginPx,
            digitsWidth + COUNTER.paddingPx * 2,
            DIGIT_CELL_HEIGHT + COUNTER.paddingPx * 2,
        );
        BT.drawRectFill(plateRect, HUD_PAPER);
        BT.drawRect(plateRect, HUD_INK);

        const digitsPos = new Vector2i(COUNTER.marginPx + COUNTER.paddingPx, COUNTER.marginPx + COUNTER.paddingPx);
        drawDigitString(this.digitsSheet, text, digitsPos);
    }
}
