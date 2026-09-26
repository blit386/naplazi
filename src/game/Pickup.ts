/**
 * The pickup reveal: the moment a find lands. The item appears at reveal size in the middle of the
 * screen, holds for a beat, then slides down and off. Driven by Treasures.onCollect() via game.ts.
 *
 * Unlike the rest of src/game/ this is screen space, not world space: a reveal is a banner, not part
 * of the sand, so it never scrolls and has no worldX/worldY. It only borrows the player's screen row
 * as a boundary to stay above.
 *
 * It draws with world palette slots because ITEMS_LARGE_SHEET is indexed against the same OBJECT_*
 * slots as the buried-item art; a found starfish dims toward evening like everything else.
 */

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { cellRect, ITEM_LARGE_CELL, ITEMS_LARGE_SHEET } from '../sprites';
import { depthToScreenY, PLAYER_WORLD_Y } from './Beach';
import { HUD_BAND_HEIGHT_PX } from './Player';

const PICKUP = {
    /** Seconds a reveal sits still before sliding. Too short flashes past unread; too long stalls a fast player. */
    holdSeconds: 0.6,

    /** Slide speed once the hold is over. With the band height, this sets a reveal's total lifetime. */
    exitSpeedPxPerSec: 70,

    /** Pool size. A seventh find before six have finished reuses the most-finished slot; nothing allocates. */
    maxConcurrent: 6,

    /** Row offset per concurrent reveal, so a burst of finds reads as several rather than one flickering banner. */
    stackOffsetPx: 6,
} as const;

/** A pooled slot. Inactive slots are inert and skipped. */
interface Reveal {
    active: boolean;
    /** Indexes ITEMS_LARGE_SHEET. */
    kind: number;
    /** The hold row, fixed for this reveal's lifetime. */
    baseY: number;
    /** Current row, a float while sliding; floored at the draw call. */
    currentY: number;
    /** Decides holding vs sliding, and which busy slot to reuse first. */
    elapsedSeconds: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/** Half the sprite size; the cells are square. */
const HALF_ITEM_SIZE = Math.floor(ITEM_LARGE_CELL / 2);

/**
 * The reveal pool. Every reveal is centred and clamped inside a safe band from CONFIG.horizonY
 * (below the HUD strip, asserted at module load) down to the player's screen row, so it can cover
 * neither by construction.
 */
export class Pickup {
    private readonly itemsLargeSheet: SpriteSheet;

    /** Fixed layout, computed once: the screen never resizes after configure(). */
    private readonly centerScreenX: number;
    private readonly bandTopY: number;
    private readonly bandBottomY: number;
    private readonly bandCenterY: number;

    /** Fixed pool, mutated in place. */
    private readonly reveals: Reveal[];

    constructor(itemsLargeSheet: SpriteSheet) {
        this.itemsLargeSheet = itemsLargeSheet;
        this.centerScreenX = Math.floor(CONFIG.logicalWidth / 2) - HALF_ITEM_SIZE;

        this.bandTopY = CONFIG.horizonY;
        this.bandBottomY = Math.floor(depthToScreenY(PLAYER_WORLD_Y));
        this.bandCenterY = Math.floor((this.bandTopY + this.bandBottomY) / 2);

        this.reveals = [];
        for (let i = 0; i < PICKUP.maxConcurrent; i += 1) {
            this.reveals.push({
                active: false,
                kind: 0,
                baseY: this.bandCenterY,
                currentY: this.bandCenterY,
                elapsedSeconds: 0,
            });
        }
    }

    /** Deactivates everything, so a mid-slide reveal cannot hang over into a new run. */
    reset(): void {
        for (let i = 0; i < this.reveals.length; i += 1) {
            (this.reveals[i] as Reveal).active = false;
        }
    }

    /** For tests, inactive slots included: proves the pool never grows past maxConcurrent. */
    getRevealSnapshot(): ReadonlyArray<Readonly<Reveal>> {
        return this.reveals;
    }

    /**
     * Claims a slot for `kind`. Runs synchronously inside Treasures' collect notification, after its
     * counter has already incremented, so the reveal and the count appear on the same frame.
     */
    spawn(kind: number): void {
        // One pass: count active reveals (for stacking), find a free slot, and remember the most
        // finished active slot as the fallback.
        let activeCount = 0;
        let freeIndex = -1;
        let mostFinishedIndex = 0;
        let mostFinishedElapsed = -1;
        for (let i = 0; i < this.reveals.length; i += 1) {
            const reveal = this.reveals[i] as Reveal;
            if (!reveal.active) {
                if (freeIndex === -1) {
                    freeIndex = i;
                }
                continue;
            }
            activeCount += 1;
            if (reveal.elapsedSeconds > mostFinishedElapsed) {
                mostFinishedElapsed = reveal.elapsedSeconds;
                mostFinishedIndex = i;
            }
        }

        const slot = this.reveals[freeIndex !== -1 ? freeIndex : mostFinishedIndex] as Reveal;

        // Stack downward from the band centre, then clamp back inside the band.
        const stackIndex = Math.min(activeCount, PICKUP.maxConcurrent - 1);
        const offsetY = stackIndex * PICKUP.stackOffsetPx;
        const baseY = clamp(
            this.bandCenterY + offsetY,
            this.bandTopY + HALF_ITEM_SIZE,
            this.bandBottomY - HALF_ITEM_SIZE,
        );

        slot.active = true;
        slot.kind = kind;
        slot.baseY = baseY;
        slot.currentY = baseY;
        slot.elapsedSeconds = 0;
    }

    /** Holds, then slides down until the whole sprite has cleared the band's bottom edge, then frees the slot. */
    update(deltaSeconds: number): void {
        for (let i = 0; i < this.reveals.length; i += 1) {
            const reveal = this.reveals[i] as Reveal;
            if (!reveal.active) {
                continue;
            }

            reveal.elapsedSeconds += deltaSeconds;
            const slideSeconds = reveal.elapsedSeconds - PICKUP.holdSeconds;
            reveal.currentY = slideSeconds <= 0 ? reveal.baseY : reveal.baseY + slideSeconds * PICKUP.exitSpeedPxPerSec;

            if (reveal.currentY - HALF_ITEM_SIZE > this.bandBottomY) {
                reveal.active = false;
            }
        }
    }

    /** game.ts calls this before Player.render(), so a reveal can never cover the figure even if the band were retuned. */
    render(): void {
        for (let i = 0; i < this.reveals.length; i += 1) {
            const reveal = this.reveals[i] as Reveal;
            if (!reveal.active) {
                continue;
            }
            const screenY = Math.floor(reveal.currentY) - HALF_ITEM_SIZE;
            BT.drawSprite(
                this.itemsLargeSheet,
                cellRect(ITEMS_LARGE_SHEET, reveal.kind),
                new Vector2i(this.centerScreenX, screenY),
            );
        }
    }
}

// The safe band's top edge must clear the HUD strip. Throw at startup rather than draw under the counter.
if (CONFIG.horizonY < HUD_BAND_HEIGHT_PX) {
    throw new Error(
        `Pickup.ts: CONFIG.horizonY (${CONFIG.horizonY}) is above HUD_BAND_HEIGHT_PX ` +
            `(${HUD_BAND_HEIGHT_PX}) - the pickup reveal's safe band would start inside the reserved HUD strip.`,
    );
}
