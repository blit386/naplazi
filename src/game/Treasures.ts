// Buried treasure: a fixed-size pool of items scattered across the beach
// strip, invisible until the collector point (see COLLECTION_MODE in
// Detector.ts) passes close enough to dig one up. See Beach.ts's coordinate
// system contract for what worldX/worldY mean and why a plain Euclidean
// distance between two world points is a real ground-plane distance here.
//
// This file never draws anything - buried means buried. TASK-017's Pickup.ts
// is what shows the player what they found, driven off onCollect() below.

import { BT } from 'blit386';
import { CONFIG } from '../config';
import { ITEMS_SHEET } from '../sprites';
import { WORLD_DEPTH, WORLD_SCROLL_SPEED_PX_PER_SEC } from './Beach';
import { DETECTOR } from './Detector';

// Everything only this file cares about. Tweak freely; nothing outside this
// file reads TREASURES directly.
const TREASURES = {
    // How many buried items exist on the strip at once. Density stays
    // constant because a collected or scrolled-past item is immediately
    // respawned elsewhere (see recycle() below) rather than removed for
    // good - the pool size never changes after construction. Deliberately
    // smaller than BEACH.decorationCount (Beach.ts) - decoration is cheap
    // background clutter, but every buried item has to be findable by ear
    // alone, so there cannot be too many competing signals at once.
    //
    // BALANCE NOTE (TASK-010/011 QA round): was 10. A full-day headless
    // simulation (see this round's report) found a player who never moves
    // ("passive") collected too close to as much as a player who actively
    // follows the beep - the beep was not paying for itself. A denser field
    // means more items are ALWAYS passing near the player's fixed centre
    // regardless of skill, which specifically inflates the passive score
    // without inflating the active one by nearly as much (an aiming player
    // is not "using up" extra items any faster than a sparser field already
    // gives them - they are bottlenecked by reaction time, not by supply).
    // Thinning the field out lowers that unearned baseline; see
    // scrollSpeed's own balance note in Beach.ts for the other half of the
    // fix. Lowering this number is always safe for the nearest-item search
    // below (see its own comment on why the search is a windowed scan, not
    // a full one) - raising it back up is the thing that would need that
    // search revisited.
    itemCount: 7,

    // How far, in world units (the same scale as worldX/worldY - see
    // Beach.ts), a buried item's worldY may differ from the collector's
    // worldY before the nearest-item search below skips it without even
    // computing a full Euclidean distance - a cheap pre-filter, not a
    // separate spatial index, which is all a pool this small needs (see
    // update() below for why the skip is always safe). Deliberately reused
    // from DETECTOR.silenceThresholdPx (Detector.ts) rather than a private
    // number of its own: the window only has to be wide enough that nothing
    // within beeping range can ever be skipped, and that range's own edge
    // IS silenceThresholdPx, so anything further apart than that in worldY
    // alone is already too far away to matter to Sfx.ts either way.
    searchWindowPx: DETECTOR.silenceThresholdPx,
} as const;

// The number of distinct buried-item kinds a freshly spawned or recycled
// item may become. Derived from ITEMS_SHEET's own geometry (see
// src/sprites.ts) instead of a bare "4": only the sheet's first row is used
// today (row two is reserved, empty space for future items - see
// src/sprites.ts's own comment on ITEMS_SHEET), so the valid kind range is
// exactly one row wide, not the whole sheet's cell count.
const ITEM_KIND_COUNT = ITEMS_SHEET.columns;

// One buried item. `kind` indexes ITEMS_SHEET / ITEMS_LARGE_SHEET (see
// src/sprites.ts) - which item TASK-017's pickup reveal shows when this one
// is dug up.
interface Treasure {
    worldX: number;
    worldY: number;
    kind: number;
}

// Fired the instant a buried item is collected - see onCollect() below.
// Carries the item's world position and kind BEFORE it gets recycled, so a
// listener (TASK-017's centre-screen reveal) knows exactly what was found
// and where.
export type TreasureCollectListener = (worldX: number, worldY: number, kind: number) => void;

// The buried-item pool: seeded placement, per-frame nearest-item search from
// the collector point, and automatic collection. Owns no sprite sheet and
// draws nothing - buried items stay invisible for their entire life in this
// file (see the header comment above).
export class Treasures {
    // A fixed-size pool of buried items, built once and mutated in place
    // every frame (see update()) - never reallocated, so hunting for the
    // nearest item does not allocate anything in the hot path.
    private items: Treasure[];

    // The ground-plane distance (world units) from the collector point to
    // the nearest item found during the most recent update() call, or
    // +Infinity when nothing fell inside TREASURES.searchWindowPx this
    // frame. Sfx.ts (TASK-011) reads this every frame through the
    // nearestDistancePx getter below to decide whether - and how fast - to
    // beep.
    private _nearestDistancePx: number;

    // How many items have been dug up so far this run. src/hud/Counter.ts
    // (TASK-013) draws this every frame via the collectedCount getter below.
    private _collectedCount: number;

    // Listeners registered via onCollect(). A plain array, built once and
    // only ever appended to - reset() does NOT clear it, because listeners
    // are wiring set up once at startup (see game.ts's init()), not per-run
    // game state.
    private readonly collectListeners: TreasureCollectListener[] = [];

    constructor() {
        this.items = this.spawnItems();
        this._nearestDistancePx = Number.POSITIVE_INFINITY;
        this._collectedCount = 0;
    }

    // Rebuilds the item pool from scratch and zeroes the counter. TASK-014
    // calls this (alongside every other system's reset()) to restart a run
    // without reloading the page. Subscribed listeners are kept - see the
    // collectListeners field comment above.
    reset(): void {
        this.items = this.spawnItems();
        this._nearestDistancePx = Number.POSITIVE_INFINITY;
        this._collectedCount = 0;
    }

    // Registers a callback to run every time an item is collected. Never
    // called from inside this file - it exists so TASK-017 (the pickup
    // reveal) and src/game.ts (which wires this event to Sfx.playCollectSound(),
    // the same "introduced only in src/game.ts" cross-system pattern every
    // other pair of systems in this project follows) have somewhere to hang
    // a response without this file needing to know either of them exists.
    onCollect(listener: TreasureCollectListener): void {
        this.collectListeners.push(listener);
    }

    // Advances every item's depth by one frame's worth of scroll, finds the
    // item nearest to the collector point, and digs it up if it is close
    // enough. `collectorWorldX`/`collectorWorldY` is the point that does the
    // digging - the detector head or the player's body, chosen by
    // COLLECTION_MODE (see Detector.ts) - computed by the caller so this
    // file stays a plain "distance to a point" system with no opinion of
    // its own about which point that is. Called once a frame from
    // src/game.ts's update() - never from render().
    update(deltaSeconds: number, collectorWorldX: number, collectorWorldY: number): void {
        // 1. Scroll every item toward the player, recycling anything that
        //    has scrolled past (same rule Beach.ts's decoration pool
        //    follows - see WORLD_SCROLL_SPEED_PX_PER_SEC's doc comment in
        //    Beach.ts for why this file reuses that exact number instead of
        //    a private copy).
        for (let i = 0; i < this.items.length; i += 1) {
            const item = this.items[i] as Treasure;
            item.worldY += WORLD_SCROLL_SPEED_PX_PER_SEC * deltaSeconds;
            if (item.worldY >= WORLD_DEPTH) {
                this.recycle(item);
            }
        }

        // 2. Find the nearest item to the collector point. No allocation:
        //    a plain indexed for-loop over the fixed pool, tracking only two
        //    numbers (best index, best squared distance) - no `new`, no
        //    `filter`/`map`/`sort`, exactly the shape docs/basics.md and
        //    TODO.md's blocking-risk note both ask for in a function that
        //    runs 60 times a second.
        let nearestIndex = -1;
        let nearestDistanceSq = Number.POSITIVE_INFINITY;
        for (let i = 0; i < this.items.length; i += 1) {
            const item = this.items[i] as Treasure;
            // Cheap pre-filter BEFORE the (more expensive, and requiring a
            // second subtraction) full 2D distance: if the item's worldY
            // alone is already further from the collector than
            // searchWindowPx, the full Euclidean distance (which can only
            // be >= this single-axis difference) is too, so it can safely
            // be skipped without ever computing dx or the square root -
            // see TREASURES.searchWindowPx's doc comment for why this skip
            // can never hide a genuinely-in-range item.
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

        // 3. Dig up the nearest item if the collector is close enough.
        //    Reads DETECTOR.collectRadiusPx directly from Detector.ts rather
        //    than keeping a second copy in TREASURES above - see
        //    Detector.ts's own comment on why every detector/beep-tuning
        //    number, collection radius included, lives in that one place.
        if (nearestIndex >= 0 && this._nearestDistancePx <= DETECTOR.collectRadiusPx) {
            const item = this.items[nearestIndex] as Treasure;
            this._collectedCount += 1;
            // Notify BEFORE recycling, so listeners (TASK-017's reveal) see
            // the item's real find position and kind, not its freshly
            // rolled replacement.
            this.notifyCollect(item.worldX, item.worldY, item.kind);
            // Recycling moves the item's worldY far outside
            // searchWindowPx of wherever the collector currently sits (see
            // recycle() below), so this exact item cannot be found - and
            // therefore cannot be double-collected - again for several
            // seconds, even on the very next frame. Combined with "only the
            // single nearest item is ever collected per update() call"
            // above, one crossing of an item can only ever increment the
            // counter by exactly one, never more.
            this.recycle(item);
        }
    }

    // A read-only snapshot of the current item layout. Nothing in this file
    // calls this - it exists so "the same seed produces the same buried
    // items" can be checked directly (see this task's completion checklist
    // in TODO.md) without reaching into a private field.
    getTreasureSnapshot(): ReadonlyArray<Readonly<Treasure>> {
        return this.items;
    }

    // The ground-plane distance (world units) from the collector point to
    // the nearest buried item as of the most recent update() call. +Infinity
    // when nothing was within TREASURES.searchWindowPx - Sfx.ts treats
    // "very far away" and "nothing nearby at all" identically (both are well
    // past DETECTOR.silenceThresholdPx), so no special-casing is needed on
    // either side of this getter.
    get nearestDistancePx(): number {
        return this._nearestDistancePx;
    }

    // How many items have been dug up so far this run.
    get collectedCount(): number {
        return this._collectedCount;
    }

    private notifyCollect(worldX: number, worldY: number, kind: number): void {
        for (let i = 0; i < this.collectListeners.length; i += 1) {
            const listener = this.collectListeners[i] as TreasureCollectListener;
            listener(worldX, worldY, kind);
        }
    }

    // Moves an item that just scrolled past the player - or was just dug up
    // - back into circulation as a brand new one. Subtracting WORLD_DEPTH
    // (never resetting to exactly 0) is the same "recycling" rule Beach.ts's
    // decoration pool follows (see the coordinate contract in Beach.ts): it
    // avoids bunching every recycled item at the same depth, and - for a
    // JUST-collected item specifically - it also has a second, load-bearing
    // effect: the collector sits near the bottom of the strip (close to
    // PLAYER_WORLD_Y), so subtracting WORLD_DEPTH sends the item to a
    // strongly negative worldY, near the top - far outside searchWindowPx of
    // the collector - which is exactly what update()'s "cannot be
    // double-collected" reasoning above depends on.
    private recycle(item: Treasure): void {
        item.worldY -= WORLD_DEPTH;
        item.worldX = BT.random.float(0, CONFIG.logicalWidth);
        item.kind = BT.random.int(0, ITEM_KIND_COUNT);
    }

    // Builds TREASURES.itemCount items, scattered across the FULL depth
    // range (not all starting at worldY=0) so buried treasure is already
    // spread out from the very first frame instead of needing several
    // seconds to scroll into range. Every position and kind comes from
    // BT.random, so the exact same seed always produces the exact same
    // buried layout.
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
