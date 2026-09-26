/**
 * The scrolling beach: sky and sand bands, recycled decoration, and the footprint trail. Also home of
 * the world coordinate system every file under src/game/ shares.
 *
 * worldX is a screen pixel: there is no horizontal camera, so `screenX = Math.floor(worldX)`.
 *
 * worldY is a top-down ground-plane distance from the horizon, on the same scale as worldX, from 0
 * (just spawned at the horizon) to WORLD_DEPTH (at the player's feet, about to be recycled). Because
 * both axes share one scale, `Math.hypot(dx, dy)` between two world points is a real ground distance,
 * and the DETECTOR.*Px radii compare against it directly.
 *
 * depthToScreenY() projects worldY onto the screen band [horizonY, logicalHeight) with a power curve:
 * shallow near the horizon (far, slow), steep near the player (close, fast). It returns a float. Floor
 * only at the draw call: worldY accumulates `scrollSpeed * deltaSeconds` every frame, and flooring the
 * accumulator itself would freeze objects near the horizon, where the curve's slope is close to zero.
 *
 * The player sits at the fixed PLAYER_WORLD_Y. The detector head is a real world point rotated around
 * it (see Detector.ts), so head-to-item distance needs no unit conversion.
 *
 * Recycling subtracts WORLD_DEPTH from worldY rather than resetting to 0, so recycled objects do not
 * bunch at one depth. worldX and any per-object attribute are re-rolled from BT.random at the same
 * time.
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
    /**
     * World units per second toward the player. Was 70: a headless full-day simulation found a player
     * who never moved out-collected one who followed the beep, because each item's approach took under
     * a second. Slower gives time to aim and fewer free passes past a stationary player.
     */
    scrollSpeed: 40,

    /** Depth of the world axis, horizon to feet. Close to logicalWidth so Euclidean distances stay undistorted. */
    worldDepth: 260,

    /** Exponent of the depth -> screenY curve. 1 is linear; 2-3 reads as ground-level perspective. */
    perspectiveExponent: 2.2,

    /** Decoration pieces on the strip at once. */
    decorationCount: 18,

    /** Where the player stands, as a fraction of worldDepth. Under 1 leaves sand visible below the feet. */
    playerDepthFraction: 0.88,

    /**
     * Footprint ring-buffer size. Steps can fire every 0.12s for the whole day, so an unbounded list
     * would grow the per-frame loops without limit. The oldest slot is overwritten once the ring is
     * full; sized so that only ever happens to footprints that have long since scrolled off.
     */
    footprintCapacity: 24,
} as const;

/** Far end of the depth axis. worldY lives in [0, WORLD_DEPTH). */
export const WORLD_DEPTH = BEACH.worldDepth;

/** Exported so Treasures.ts scrolls its items at exactly the sand's rate. */
export const WORLD_SCROLL_SPEED_PX_PER_SEC = BEACH.scrollSpeed;

/** The fixed depth of the player and of the detector rod's base. */
export const PLAYER_WORLD_Y = BEACH.worldDepth * BEACH.playerDepthFraction;

/** Keeps a worldY one frame past [0, WORLD_DEPTH) projecting on-screen. */
function clamp01(value: number): number {
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}

/** The shared depth -> screenY projection. Pure. Returns a float; floor it at the draw call. */
export function depthToScreenY(worldY: number): number {
    const normalizedDepth = clamp01(worldY / BEACH.worldDepth);
    const visibleBandHeight = CONFIG.logicalHeight - CONFIG.horizonY;
    return CONFIG.horizonY + normalizedDepth ** BEACH.perspectiveExponent * visibleBandHeight;
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

    /** Claims the next ring-buffer slot. Wired to Player.onStepComplete() in game.ts. */
    stampFootprint(worldX: number, worldY: number): void {
        const slot = this.footprints[this.nextFootprintSlot] as Footprint;
        slot.worldX = worldX;
        slot.worldY = worldY;
        slot.active = true;
        this.nextFootprintSlot = (this.nextFootprintSlot + 1) % BEACH.footprintCapacity;
    }

    /**
     * Scrolls decoration (recycled past WORLD_DEPTH) and active footprints (deactivated past it, never
     * wrapped: a footprint records where the player actually stood).
     */
    update(deltaSeconds: number): void {
        for (let i = 0; i < this.decorations.length; i += 1) {
            const decoration = this.decorations[i] as Decoration;
            decoration.worldY += BEACH.scrollSpeed * deltaSeconds;
            if (decoration.worldY >= WORLD_DEPTH) {
                decoration.worldY -= WORLD_DEPTH;
                decoration.worldX = BT.random.float(0, CONFIG.logicalWidth);
                decoration.kind = BT.random.int(0, DECORATION_KIND_COUNT);
            }
        }

        for (let i = 0; i < this.footprints.length; i += 1) {
            const footprint = this.footprints[i] as Footprint;
            if (!footprint.active) {
                continue;
            }
            footprint.worldY += BEACH.scrollSpeed * deltaSeconds;
            if (footprint.worldY >= WORLD_DEPTH) {
                footprint.active = false;
            }
        }
    }

    /** Sky, sand, footprints, decoration, in that order. game.ts draws the player afterwards, so footprints land under the figure. */
    render(): void {
        drawBands(SKY_BANDS);
        drawBands(SAND_BANDS);

        for (let i = 0; i < this.footprints.length; i += 1) {
            const footprint = this.footprints[i] as Footprint;
            if (!footprint.active) {
                continue;
            }
            const screenX = Math.floor(footprint.worldX);
            const screenY = Math.floor(depthToScreenY(footprint.worldY));
            BT.drawSprite(this.footprintSheet, cellRect(FOOTPRINT_SHEET, 0), new Vector2i(screenX, screenY));
        }

        for (let i = 0; i < this.decorations.length; i += 1) {
            const decoration = this.decorations[i] as Decoration;
            // Drawn by its top-left corner, so a piece at worldY=0 sits on the horizon line, never above it.
            const screenX = Math.floor(decoration.worldX);
            const screenY = Math.floor(depthToScreenY(decoration.worldY));
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

    /** Scatters across the full depth so the beach is populated from frame one. */
    private spawnDecorations(): Decoration[] {
        const decorations: Decoration[] = [];
        for (let i = 0; i < BEACH.decorationCount; i += 1) {
            decorations.push({
                worldX: BT.random.float(0, CONFIG.logicalWidth),
                worldY: BT.random.float(0, WORLD_DEPTH),
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
