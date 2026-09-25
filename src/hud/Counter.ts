// The top-left HUD widget: how many buried items have been dug up so far,
// drawn as a small readable "plate" (see HUD_PAPER's doc comment in
// src/palette/palette.ts, "light plate behind the counter and watch face")
// with the count on top from DIGITS_SHEET - see drawDigitString in
// src/sprites.ts for the shared glyph-drawing helper this file and
// Watch.ts both call, kept in ONE place rather than two copies (this task's
// own brief, TODO.md TASK-013).
//
// Zero text anywhere: no BT.systemPrint, only sprites - PLAN.md section
// 4.11 asks for exactly that.

import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { HUD_INK, HUD_PAPER } from '../palette/palette';
import { DIGIT_CELL_HEIGHT, DIGIT_CELL_WIDTH, drawDigitString } from '../sprites';

// Everything only this file cares about. Tweak freely.
const COUNTER = {
    // Gap, in logical pixels, from the screen's own top-left corner to the
    // plate's outer edge.
    marginPx: 4,
    // Gap, in logical pixels, from the plate's edge to the digits drawn
    // inside it.
    paddingPx: 2,
} as const;

// The counter: draws the collected-item count as bitmap digits on a small
// plate, top-left. No state of its own beyond the loaded sheet -
// Treasures.ts owns collectedCount; this file only ever draws whatever
// number src/game.ts hands it this frame, the same "draw, do not own"
// contract Watch.ts follows for the game time.
export class Counter {
    private readonly digitsSheet: SpriteSheet;

    constructor(digitsSheet: SpriteSheet) {
        this.digitsSheet = digitsSheet;
    }

    // Draws the plate and the digit string for `collectedCount`. Draws only
    // - no state changes - called once a frame from src/game.ts's render(),
    // after every world system, so the HUD always sits on top of the beach.
    render(collectedCount: number): void {
        // Plain String(), not a fixed zero-padded width - TODO.md only asks
        // for fixed "always two digits" formatting on the WATCH's HH:MM (see
        // Watch.ts's formatGameTime()), never on this running count. That is
        // deliberate: Treasures.ts's buried items are recycled and can be
        // dug up again and again over one run (see its own comment on why
        // itemCount does not cap collectedCount), so this plate is free to
        // grow from one digit to two, then three, exactly when the count
        // actually reaches that many, rather than reserving fixed room for
        // digits that might never appear.
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
