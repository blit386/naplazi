// The pickup reveal (TASK-017): the moment a buried item gets shown to the
// player. Treasures.ts finds and digs up an item, but a buried thing that
// just silently increments a counter would be an unsatisfying payoff - this
// file is what makes the find actually LAND: the item appears centred on
// screen at its full "reveal" size, holds still for a beat so the player can
// register what it was, then slides down and off, all driven by
// Treasures.onCollect() (see src/game.ts's init(), which wires the two
// together - this file never imports Treasures.ts itself).
//
// UNLIKE every other system under src/game/, this file does NOT live in
// world space. Beach.ts's coordinate contract (worldX/worldY, depthToScreenY,
// scrolling with WORLD_SCROLL_SPEED_PX_PER_SEC) describes things that are
// PART of the scrolling sand - decoration, buried items, footprints. A
// reveal is not part of the sand at all: it is a fixed on-screen banner that
// says "look what you found", independent of wherever on the strip the item
// actually was. So it never scrolls, never has a worldX/worldY of its own,
// and is positioned directly in screen pixels from the moment it spawns.
// The one thing it DOES borrow from the coordinate contract is the player's
// fixed screenY (via depthToScreenY(PLAYER_WORLD_Y), same as Player.ts computes
// for itself) - purely as a boundary to stay above, not as a position it lives at.
//
// World slots or HUD slots? WORLD. This was not really a free choice: the
// sprite this file draws, ITEMS_LARGE_SHEET, is indexed (see
// loadSpriteSheets() in src/sprites.ts) against the SAME palette every other
// world object uses, with the SAME OBJECT_* ramp slot numbers baked into its
// pixels as ITEMS_SHEET (the buried-item art the reveal is a bigger copy of -
// see src/sprites.ts's own comment on why the two sheets share one index
// order). Drawing it just replays whatever colors those object-ramp slots
// currently hold - there is no "pick HUD colors instead" option once the PNG
// is already indexed that way. It is also the thematically right choice: a
// found starfish is still a beach object, not a piece of UI chrome, so
// letting it dim toward evening exactly like the sand and the player do (see
// TASK-015's palette fade over WORLD_RAMP_START..END in src/palette/palette.ts)
// reads as "the same starfish, held up in the same light", not as a
// UI overlay bolted on top of the scene.

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { cellRect, ITEM_LARGE_CELL, ITEMS_LARGE_SHEET } from '../sprites';
import { depthToScreenY, PLAYER_WORLD_Y } from './Beach';
import { HUD_BAND_HEIGHT_PX } from './Player';

// Everything only this file cares about. Tweak freely; nothing outside this
// file reads PICKUP directly.
const PICKUP = {
    // How long, in seconds, a freshly spawned reveal sits perfectly still in
    // the centre of its band before it starts sliding down. This is the
    // "let the player actually register what it was" beat TODO.md/PLAN.md
    // both call for - too short and the item flashes past unread; too long
    // and a fast player who is already digging up the next one feels like the
    // game is stalling on them.
    holdSeconds: 0.6,

    // How fast a reveal slides down once its hold time is up, in pixels per
    // second. Combined with the vertical band height (CONFIG.horizonY down to
    // the player's fixed screen row - see the band comment on the
    // PickupReveal class below), this decides the whole animation's total
    // lifetime: raising this makes the exit feel snappier and frees up a
    // pooled slot sooner; lowering it makes the item linger longer as it
    // leaves.
    exitSpeedPxPerSec: 70,

    // How many reveals can be "in flight" (holding or sliding) at once. A
    // fixed pool, never grown - see the class comment below for why a
    // circular "reuse the most-finished slot" strategy is enough, and never
    // needs to allocate a 7th slot even if a 7th collect happens before the
    // first six have finished.
    maxConcurrent: 6,

    // Extra vertical offset, in pixels, applied to each reveal that spawns
    // while an earlier one is still active - so two (or more) reveals
    // triggered close together in time land on visibly different rows
    // instead of drawing exactly on top of one another (which would read as
    // one reveal, or worse, flicker between the two as draw order settles
    // frame to frame). Small on purpose: enough to tell them apart, not so
    // much that a heavily stacked burst of finds pushes the later ones out of
    // the safe band (see the clamp in spawn() below, which is the real
    // guarantee against that).
    stackOffsetPx: 6,
} as const;

// One pooled reveal slot. `active` doubles as "is there anything to update or
// draw here at all" - an inactive slot is just inert memory waiting to be
// reused, never touched by update()/render() below.
interface Reveal {
    active: boolean;
    kind: number; // indexes ITEMS_LARGE_SHEET - which item this reveal is showing
    // The Y position (screen pixels) this reveal HOLDS at before it starts
    // sliding - fixed for this reveal's whole lifetime (see stackOffsetPx
    // above for why two reveals can have different baseY values).
    baseY: number;
    // The reveal's current, possibly-mid-slide Y position (a float - floored
    // only at the draw call, same rounding rule Beach.ts's coordinate
    // contract uses for worldY).
    currentY: number;
    // Seconds since this reveal spawned. Compared against PICKUP.holdSeconds
    // to decide "still holding" vs. "sliding", and used again to pick which
    // pooled slot to reuse first if every slot is busy (see spawn() below).
    elapsedSeconds: number;
}

// Clamps `value` into [min, max] - a plain, reusable version of Beach.ts's
// clamp01 (which is hard-coded to [0, 1]); this file needs an arbitrary
// pixel range instead.
function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

// Half the reveal sprite's own size, in pixels - used to centre it on a
// point and to keep its full extent (not just its centre) inside the safe
// band below. ITEMS_LARGE_SHEET's cells are square, so one constant covers
// both axes.
const HALF_ITEM_SIZE = Math.floor(ITEM_LARGE_CELL / 2);

// The pickup reveal pool: a fixed number of "look what you found" banners,
// each independently timed, drawn centred in a screen-space band that never
// overlaps the HUD above it or the player below it.
//
// THE SAFE BAND: PLAN.md/TODO.md ask for the reveal to sit "in the centre of
// the screen", but this game's centre column also has to stay clear of two
// things that must never be covered - the HUD strip along the very top
// (Player.ts's HUD_BAND_HEIGHT_PX, read by every tap-vs-movement decision in
// this game) and the player figure near the bottom. Rather than trusting
// "the screen's centre" to happen to miss both, this file defines its own
// band explicitly: from CONFIG.horizonY (already guaranteed to sit below the
// HUD strip - see the module-load assertion right below this comment) down
// to the player's own fixed screen row (depthToScreenY(PLAYER_WORLD_Y), the
// exact same computation Player.ts caches for itself as `screenY`). Every
// reveal - holding or sliding - is centred and clamped to stay inside that
// band, so "does not cover the HUD or the player" holds by construction, not
// by hoping the numbers happen to work out.
export class Pickup {
    private readonly itemsLargeSheet: SpriteSheet;

    // Fixed horizontal centre for every reveal (screen never changes size
    // after configure() - see CLAUDE.md's hot-reload notes) - computed once,
    // not every frame.
    private readonly centerScreenX: number;

    // The safe band's top and bottom edges, in screen pixels - both fixed
    // for the lifetime of this instance, for the same reason centerScreenX
    // is.
    private readonly bandTopY: number;
    private readonly bandBottomY: number;
    // The vertical middle of the safe band - where a single, unstacked
    // reveal holds itself.
    private readonly bandCenterY: number;

    // A fixed-size pool of reveal slots, built once and mutated in place -
    // spawning a new reveal never allocates a new object, it claims an
    // existing (inactive, or least-recently-spawned) slot instead. See
    // spawn() below for the reuse rule.
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

    // Deactivates every pooled reveal. src/game.ts's restart() calls this
    // (alongside every other system's reset()) so a mid-slide reveal from the
    // previous run can never carry over and hang in the air on the very
    // first frame of a fresh one (TODO.md's own completion checklist for
    // TASK-014-style restarts calls this out generally; TASK-017/018 apply
    // the same rule to their own new state).
    reset(): void {
        for (let i = 0; i < this.reveals.length; i += 1) {
            (this.reveals[i] as Reveal).active = false;
        }
    }

    // A read-only snapshot of the reveal pool, INCLUDING inactive slots - the same role
    // Beach.ts's getFootprintSnapshot()/getDecorationSnapshot() and Treasures.ts's
    // getTreasureSnapshot() already play for their own pools: this is what proves the pool's own
    // array length never grows past PICKUP.maxConcurrent no matter how many items get collected, and
    // it is handy scaffolding for verifying "two reveals in flight at once" externally. Neither
    // update() nor render() ever calls this.
    getRevealSnapshot(): ReadonlyArray<Readonly<Reveal>> {
        return this.reveals;
    }

    // Spawns a new reveal for the given item kind, claiming a pooled slot -
    // never allocating one. Called directly from src/game.ts's
    // treasures.onCollect() listener, in the SAME synchronous call Treasures
    // already incremented its own collectedCount in (see Treasures.update():
    // `this._collectedCount += 1` runs, then `this.notifyCollect(...)` runs,
    // both before the collected item is recycled) - so by the time this
    // method's caller even runs, the counter this task's brief cares about
    // ("increment at spawn, not after the animation finishes") has already
    // ticked up. This file does not need to touch the counter itself at all;
    // it only has to make sure the VISUAL reveal actually appears in that
    // same instant, which spawning synchronously here guarantees.
    spawn(kind: number): void {
        // One pass over the small, fixed pool: count how many reveals are
        // currently active (to offset a stacked spawn - see
        // PICKUP.stackOffsetPx above) and, at the same time, remember both
        // the first free slot (if any) and whichever ACTIVE slot is furthest
        // along (closest to finishing on its own) as a fallback. No
        // allocation - just three running numbers over an array built once
        // in the constructor.
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

        // Prefer an empty slot; only when the whole pool is busy (every one
        // of PICKUP.maxConcurrent reveals still in flight - a burst of finds
        // faster than the pool can drain) does this reuse the slot nearest
        // its own natural end. Either way the pool never grows past
        // maxConcurrent, so a very fast run of collects degrades gracefully
        // (the oldest-looking reveal is replaced a little early) instead of
        // allocating, or silently dropping the newest find on the floor.
        const slot = this.reveals[freeIndex !== -1 ? freeIndex : mostFinishedIndex] as Reveal;

        // Stagger concurrent reveals downward from the band's centre so a
        // burst of finds reads as "several", not "one, blinking" - then clamp
        // the result back inside the safe band (see the class comment above)
        // so even a heavily stacked burst never pushes a reveal into the HUD
        // strip above or past the player's row below.
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

    // Advances every active reveal by one frame: holds it still for
    // PICKUP.holdSeconds, then slides it down at PICKUP.exitSpeedPxPerSec
    // until it has fully passed the band's bottom edge, at which point it is
    // deactivated (freed back into the pool - see spawn() above). Called
    // once a frame from src/game.ts's update() - never from render().
    update(deltaSeconds: number): void {
        for (let i = 0; i < this.reveals.length; i += 1) {
            const reveal = this.reveals[i] as Reveal;
            if (!reveal.active) {
                continue;
            }

            reveal.elapsedSeconds += deltaSeconds;
            const slideSeconds = reveal.elapsedSeconds - PICKUP.holdSeconds;
            reveal.currentY = slideSeconds <= 0 ? reveal.baseY : reveal.baseY + slideSeconds * PICKUP.exitSpeedPxPerSec;

            // "Left the bottom edge" means the sprite's own TOP edge has
            // moved past the band's bottom bound - i.e. the whole sprite, not
            // just its centre point, has cleared the safe band. Only then is
            // it discarded; discarding one frame earlier could still show a
            // sliver of the sprite inside the band on the very last visible
            // frame.
            if (reveal.currentY - HALF_ITEM_SIZE > this.bandBottomY) {
                reveal.active = false;
            }
        }
    }

    // Draws every active reveal at its current (possibly mid-slide)
    // position. Draws only - no state changes. Called once a frame from
    // src/game.ts's render(), BEFORE Player.render() - see src/game.ts's own
    // comment on why the reveal is drawn under the player rather than over
    // it: even though the band clamp above already keeps a reveal from ever
    // reaching the player's row, drawing order is a second, belt-and-braces
    // guarantee that "never covers the player" holds even if a future tuning
    // change ever narrowed the band.
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

// Defensive, module-load-time check (same pattern src/hud/Watch.ts already
// uses for its own watch sprite): the whole "never covers the HUD"
// guarantee above rests on CONFIG.horizonY sitting at or below
// HUD_BAND_HEIGHT_PX's own top boundary - that is, the safe band's TOP edge
// must already be clear of the reserved HUD strip. True today (horizonY is
// 90, HUD_BAND_HEIGHT_PX is 24), but if either number is ever retuned without
// the other, this throws loudly at startup instead of silently letting a
// reveal be drawn underneath the counter/watch plates.
if (CONFIG.horizonY < HUD_BAND_HEIGHT_PX) {
    throw new Error(
        `Pickup.ts: CONFIG.horizonY (${CONFIG.horizonY}) is above HUD_BAND_HEIGHT_PX ` +
            `(${HUD_BAND_HEIGHT_PX}) - the pickup reveal's safe band would start inside the reserved HUD strip.`,
    );
}
