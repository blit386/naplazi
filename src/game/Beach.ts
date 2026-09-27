/**
 * The scrolling beach: sky and sand bands, recycled decoration, and the footprint trail.
 *
 * worldX is a screen pixel: there is no horizontal camera, so `screenX = Math.floor(worldX)`.
 *
 * worldY is seconds of walking. The player advances one unit per second (Player.worldY), and a
 * decoration's worldY stays put, so `object.worldY - player.worldY` is seconds until it reaches the
 * feet. depthToScreenY() projects that gap: 0 at the feet (y 276), 1 at the far sand (y 108), eight
 * seconds apart. It returns a float; floor only at the draw call.
 *
 * Treasures and the detector head still measure on the pixel strip exported below. That strip is not
 * this scroll.
 */

import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import {
    SAND_DARK,
    SAND_HIGHLIGHT,
    SAND_LIGHT,
    SAND_MID,
    SAND_SHADOW,
    SAND_WET,
    SKY_GLOW,
    SKY_HORIZON,
    SKY_MID,
    SKY_UPPER,
    SKY_ZENITH,
} from '../palette/palette';
import { cellRect, DECORATIONS_SHEET, FOOTPRINT_SHEET } from '../sprites';

/** Tuning read only by this file. The shared coordinate values are exported separately below. */
const BEACH = {
    /** Seconds of walking from the feet to the far sand. */
    horizonSeconds: 8,

    /** Screen row of the player's feet. */
    feetY: 276,

    /** Screen row where a point one horizonSeconds ahead is drawn. The sea band above it is not drawn yet. */
    farSandY: 108,

    /** Exponent of the ahead-of-the-feet curve. The spec writes u ^ (1 / 2.2). */
    perspectiveExponent: 2.2,

    /**
     * Seconds a footprint stays visible below the feet. The ahead-curve is undefined for a negative
     * gap, and its slope at the feet would cross the remaining sand in a couple of frames, so the
     * trail below the feet is linear over this long.
     */
    trailSeconds: 1.5,

    /** Decoration pieces on the strip at once. */
    decorationCount: 18,

    /** Oldest stamp is overwritten once the ring is full. Sized for a lane-change trail that is still on screen. */
    footprintCapacity: 40,
} as const;

/** Screen row of the player's feet. The sprite is drawn above it. */
export const PLAYER_FEET_Y = BEACH.feetY;

/**
 * Pixel strip that Treasures and the detector head still measure on. Not the beach scroll:
 * hypot(dx, dy) there is only meaningful while both axes stay in these pixels.
 */
export const WORLD_DEPTH = 260;

/** Treasures scroll their items on the pixel strip, in pixels per second. */
export const WORLD_SCROLL_SPEED_PX_PER_SEC = 40;

/** Fixed depth of the detector rod's base on the pixel strip. */
export const PLAYER_WORLD_Y = WORLD_DEPTH * 0.88;

/** Walking-seconds span of one recycle, so a piece that passes the feet reappears at the far sand. */
const RECYCLE_SPAN_SECONDS = BEACH.horizonSeconds + BEACH.trailSeconds;

/**
 * Projects a walking-seconds worldY onto the screen, relative to the player. Pure. Returns a float;
 * floor it at the draw call.
 */
export function depthToScreenY(objectWorldY: number, playerWorldY: number): number {
    const aheadSeconds = objectWorldY - playerWorldY;

    if (aheadSeconds <= 0) {
        const belowPx = CONFIG.logicalHeight - BEACH.feetY;

        return BEACH.feetY + (-aheadSeconds / BEACH.trailSeconds) * belowPx;
    }

    const u = Math.min(1, aheadSeconds / BEACH.horizonSeconds);
    const span = BEACH.feetY - BEACH.farSandY;

    return BEACH.feetY - span * u ** (1 / BEACH.perspectiveExponent);
}

/** `kind` indexes DECORATIONS_SHEET: 0 litter, 1 cup ring, 2 speck. */
interface Decoration {
    worldX: number;
    worldY: number;
    kind: number;
}

/** The sheet's last cell is reserved, hence the -1. */
const DECORATION_KIND_COUNT = DECORATIONS_SHEET.columns * DECORATIONS_SHEET.rows - 1;

/** A world-space stamp, scrolled and projected like a Decoration. Inactive slots hold stale data and are skipped. */
interface Footprint {
    worldX: number;
    worldY: number;
    active: boolean;
}

/** Top-to-bottom: sky from zenith to horizon glow, sand from wet (near the water) to dry (near the feet). */
const SKY_BAND_SLOTS = [SKY_ZENITH, SKY_UPPER, SKY_MID, SKY_HORIZON, SKY_GLOW] as const;
const SAND_BAND_SLOTS = [SAND_SHADOW, SAND_WET, SAND_DARK, SAND_MID, SAND_LIGHT, SAND_HIGHLIGHT] as const;

/** One precomputed horizontal band. */
interface Band {
    rect: Rect2i;
    slot: number;
}

/**
 * Splits [top, bottom) into equal-height bands with cumulative rounding, so neighbors never gap or
 * overlap. Runs once at module load, so render() allocates nothing.
 */
function buildBands(top: number, bottom: number, slots: readonly number[]): Band[] {
    const totalHeight = bottom - top;
    const bandCount = slots.length;
    const bands: Band[] = [];

    for (let i = 0; i < bandCount; i += 1) {
        const bandTop = top + Math.floor((totalHeight * i) / bandCount);
        const bandBottom = top + Math.floor((totalHeight * (i + 1)) / bandCount);

        bands.push({
            rect: new Rect2i(0, bandTop, CONFIG.logicalWidth, bandBottom - bandTop),
            slot: slots[i] as number,
        });
    }

    return bands;
}

const SKY_BANDS = buildBands(0, CONFIG.horizonY, SKY_BAND_SLOTS);
const SAND_BANDS = buildBands(CONFIG.horizonY, CONFIG.logicalHeight, SAND_BAND_SLOTS);

function drawBands(bands: readonly Band[]): void {
    for (let i = 0; i < bands.length; i += 1) {
        const band = bands[i] as Band;

        BT.drawRectFill(band.rect, band.slot);
    }
}

/** Sky, sand, a fixed pool of recycling decoration, and the footprint ring buffer. */
export class Beach {
    private readonly decorationsSheet: SpriteSheet;
    private readonly footprintSheet: SpriteSheet;

    /** Fixed-size pool, mutated in place. */
    private decorations: Decoration[];

    /** Ring buffer; every slot starts inactive. */
    private readonly footprints: Footprint[];

    /** Always advances, so once every slot has been used the oldest stamp is the next one overwritten. */
    private nextFootprintSlot: number;

    constructor(decorationsSheet: SpriteSheet, footprintSheet: SpriteSheet) {
        this.decorationsSheet = decorationsSheet;
        this.footprintSheet = footprintSheet;
        this.decorations = this.spawnDecorations();
        this.footprints = this.buildFootprintPool();
        this.nextFootprintSlot = 0;
    }

    /** Rebuilds decoration from BT.random's current state and clears every footprint. Called on restart. */
    reset(): void {
        this.decorations = this.spawnDecorations();

        for (let i = 0; i < this.footprints.length; i += 1) {
            (this.footprints[i] as Footprint).active = false;
        }

        this.nextFootprintSlot = 0;
    }

    /** Claims the next ring-buffer slot. Wired to Player.onFootprint() in game.ts. */
    stampFootprint(worldX: number, worldY: number): void {
        const slot = this.footprints[this.nextFootprintSlot] as Footprint;

        slot.worldX = worldX;
        slot.worldY = worldY;
        slot.active = true;

        this.nextFootprintSlot = (this.nextFootprintSlot + 1) % BEACH.footprintCapacity;
    }

    /**
     * Recycles decoration that has passed the feet and drops footprints once they leave the trail.
     * Neither stores a velocity: the player walking forward is what scrolls them down the screen.
     */
    update(playerWorldY: number): void {
        for (let i = 0; i < this.decorations.length; i += 1) {
            const decoration = this.decorations[i] as Decoration;

            if (playerWorldY - decoration.worldY <= BEACH.trailSeconds) {
                continue;
            }

            decoration.worldY += RECYCLE_SPAN_SECONDS;
            decoration.worldX = BT.random.float(0, CONFIG.logicalWidth);
            decoration.kind = BT.random.int(0, DECORATION_KIND_COUNT);
        }

        for (let i = 0; i < this.footprints.length; i += 1) {
            const footprint = this.footprints[i] as Footprint;
            if (!footprint.active) {
                continue;
            }

            if (playerWorldY - footprint.worldY > BEACH.trailSeconds) {
                footprint.active = false;
            }
        }
    }

    /** Sky, sand, footprints, decoration, in that order. game.ts draws the player afterwards, so footprints land under the figure. */
    render(playerWorldY: number): void {
        drawBands(SKY_BANDS);
        drawBands(SAND_BANDS);

        for (let i = 0; i < this.footprints.length; i += 1) {
            const footprint = this.footprints[i] as Footprint;
            if (!footprint.active) {
                continue;
            }

            const screenX = Math.floor(footprint.worldX) - Math.floor(FOOTPRINT_SHEET.cellWidth / 2);
            const screenY = Math.floor(depthToScreenY(footprint.worldY, playerWorldY));

            if (screenY < BEACH.farSandY || screenY >= CONFIG.logicalHeight) {
                continue;
            }

            BT.drawSprite(this.footprintSheet, cellRect(FOOTPRINT_SHEET, 0), new Vector2i(screenX, screenY));
        }

        for (let i = 0; i < this.decorations.length; i += 1) {
            const decoration = this.decorations[i] as Decoration;
            const screenX = Math.floor(decoration.worldX);
            const screenY = Math.floor(depthToScreenY(decoration.worldY, playerWorldY));

            if (screenY < BEACH.farSandY || screenY >= CONFIG.logicalHeight) {
                continue;
            }

            BT.drawSprite(
                this.decorationsSheet,
                cellRect(DECORATIONS_SHEET, decoration.kind),
                new Vector2i(screenX, screenY),
            );
        }
    }

    /** For tests: lets "same seed, same beach" be checked without touching a private field. */
    getDecorationSnapshot(): ReadonlyArray<Readonly<Decoration>> {
        return this.decorations;
    }

    /** Scatters across the visible walk so the beach is populated from frame one. */
    private spawnDecorations(): Decoration[] {
        const decorations: Decoration[] = [];

        for (let i = 0; i < BEACH.decorationCount; i += 1) {
            decorations.push({
                worldX: BT.random.float(0, CONFIG.logicalWidth),
                worldY: BT.random.float(-BEACH.trailSeconds, BEACH.horizonSeconds),
                kind: BT.random.int(0, DECORATION_KIND_COUNT),
            });
        }

        return decorations;
    }

    /** All slots inactive; the objects live for the instance's lifetime. */
    private buildFootprintPool(): Footprint[] {
        const footprints: Footprint[] = [];

        for (let i = 0; i < BEACH.footprintCapacity; i += 1) {
            footprints.push({ worldX: 0, worldY: 0, active: false });
        }

        return footprints;
    }

    /** For tests, inactive slots included: proves `.length` never exceeds footprintCapacity. */
    getFootprintSnapshot(): ReadonlyArray<Readonly<Footprint>> {
        return this.footprints;
    }
}
