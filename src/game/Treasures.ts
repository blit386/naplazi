/**
 * Buried items: a fixed pool scattered across the strip, invisible until the collector point comes
 * within DETECTOR.collectRadiusPx. Draws nothing; Pickup.ts shows what was found via onCollect().
 */

import { BT } from 'blit386';
import { CONFIG } from '../config';
import { ITEMS_SHEET } from '../sprites';
import { WORLD_DEPTH, WORLD_SCROLL_SPEED_PX_PER_SEC } from './Beach';
import { DETECTOR } from './Detector';

const TREASURES = {
    /**
     * Items on the strip at once. Was 10: a headless full-day simulation found a stationary player
     * scored nearly as well as one following the beep, because a dense field keeps items passing the
     * fixed centre regardless of skill. Fewer items lower that unearned baseline (see also
     * BEACH.scrollSpeed).
     */
    itemCount: 7,

    /**
     * Items whose worldY differs from the collector's by more than this are skipped before the full
     * distance is computed. Reuses silenceThresholdPx: anything further apart on one axis alone is
     * already outside beeping range.
     */
    searchWindowPx: DETECTOR.silenceThresholdPx,
} as const;

/** Only the sheet's first row holds items; the second is reserved. */
const ITEM_KIND_COUNT = ITEMS_SHEET.columns;

/** `kind` indexes ITEMS_SHEET and ITEMS_LARGE_SHEET. */
interface Treasure {
    worldX: number;
    worldY: number;
    kind: number;
}

/** Fired before the collected item is recycled, so listeners see the real find position and kind. */
export type TreasureCollectListener = (worldX: number, worldY: number, kind: number) => void;

export class Treasures {
    /** Fixed-size pool, mutated in place. */
    private items: Treasure[];

    /** Distance to the nearest item as of the last update(), or +Infinity when none was within the search window. */
    private _nearestDistancePx: number;

    private _collectedCount: number;

    /** Startup wiring, not per-run state: reset() leaves it alone. */
    private readonly collectListeners: TreasureCollectListener[] = [];

    constructor() {
        this.items = this.spawnItems();
        this._nearestDistancePx = Number.POSITIVE_INFINITY;
        this._collectedCount = 0;
    }

    /** Rebuilds the pool from BT.random's current state and zeroes the counter. Listeners are kept. */
    reset(): void {
        this.items = this.spawnItems();
        this._nearestDistancePx = Number.POSITIVE_INFINITY;
        this._collectedCount = 0;
    }

    /** game.ts wires the chime and the pickup reveal here. */
    onCollect(listener: TreasureCollectListener): void {
        this.collectListeners.push(listener);
    }

    /**
     * Scrolls every item, finds the nearest one to the collector point, and collects it if it is within
     * DETECTOR.collectRadiusPx. The caller picks the collector point (head or body, see
     * COLLECTION_MODE), so this file stays a plain distance-to-a-point system.
     */
    update(deltaSeconds: number, collectorWorldX: number, collectorWorldY: number): void {
        for (let i = 0; i < this.items.length; i += 1) {
            const item = this.items[i] as Treasure;
            item.worldY += WORLD_SCROLL_SPEED_PX_PER_SEC * deltaSeconds;
            if (item.worldY >= WORLD_DEPTH) {
                this.recycle(item);
            }
        }

        // Allocation-free scan; the per-axis pre-filter skips the multiply and sqrt for far items.
        let nearestIndex = -1;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.items.length; i += 1) {
            const item = this.items[i] as Treasure;
            const dy = item.worldY - collectorWorldY;
            if (Math.abs(dy) > TREASURES.searchWindowPx) {
                continue;
            }
            const dx = item.worldX - collectorWorldX;
            const distanceSq = dx * dx + dy * dy;
            if (distanceSq < nearestDistanceSq) {
                nearestDistanceSq = distanceSq;
                nearestIndex = i;
            }
        }
        this._nearestDistancePx = nearestIndex >= 0 ? Math.sqrt(nearestDistanceSq) : Number.POSITIVE_INFINITY;

        // Notify before recycling, so listeners see the real item. Recycling then moves it far outside
        // the search window, so one crossing can never count twice.
        if (nearestIndex >= 0 && this._nearestDistancePx <= DETECTOR.collectRadiusPx) {
            const item = this.items[nearestIndex] as Treasure;
            this._collectedCount += 1;
            this.notifyCollect(item.worldX, item.worldY, item.kind);
            this.recycle(item);
        }
    }

    /** For tests: lets "same seed, same items" be checked without touching a private field. */
    getTreasureSnapshot(): ReadonlyArray<Readonly<Treasure>> {
        return this.items;
    }

    /** +Infinity when nothing is nearby; Sfx.ts treats that the same as "very far". */
    get nearestDistancePx(): number {
        return this._nearestDistancePx;
    }

    /** Items dug up this run. */
    get collectedCount(): number {
        return this._collectedCount;
    }

    private notifyCollect(worldX: number, worldY: number, kind: number): void {
        for (let i = 0; i < this.collectListeners.length; i += 1) {
            const listener = this.collectListeners[i] as TreasureCollectListener;
            listener(worldX, worldY, kind);
        }
    }

    /**
     * Subtracting WORLD_DEPTH (not resetting to 0) avoids bunching recycled items at one depth and, for
     * a just-collected item near the player, sends it far away from the collector.
     */
    private recycle(item: Treasure): void {
        item.worldY -= WORLD_DEPTH;
        item.worldX = BT.random.float(0, CONFIG.logicalWidth);
        item.kind = BT.random.int(0, ITEM_KIND_COUNT);
    }

    /** Scatters across the full depth so items are in range from frame one. */
    private spawnItems(): Treasure[] {
        const items: Treasure[] = [];
        for (let i = 0; i < TREASURES.itemCount; i += 1) {
            items.push({
                worldX: BT.random.float(0, CONFIG.logicalWidth),
                worldY: BT.random.float(0, WORLD_DEPTH),
                kind: BT.random.int(0, ITEM_KIND_COUNT),
            });
        }
        return items;
    }
}
