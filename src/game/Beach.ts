// The scrolling beach: sky, sand, and loose decoration (litter, cup rings,
// specks). This file is also the home of the game's coordinate system - read
// the big comment block below before placing anything (a decoration, a
// buried item in TASK-010, a footprint in TASK-018, ...) anywhere in the
// world. Every other system that has a position in the game world imports
// its rules from here.
//
// ============================================================================
// COORDINATE SYSTEM CONTRACT - read this before touching worldX/worldY
// anywhere under src/game/. TASK-010 (buried items), TASK-017 (the pickup
// reveal) and TASK-018 (footprints) all place things in this same space, so
// the rules below are not just Beach's internal bookkeeping - they are the
// shared language every future system speaks.
//
// worldX - horizontal position, in the SAME units as screen pixels. There is
//   no horizontal camera transform in this game (the beach never scrolls
//   sideways), so `screenX = Math.floor(worldX)` always, with no extra math.
//   Valid range for anything meant to be visible is [0, CONFIG.logicalWidth).
//
// worldY - think of it as an overhead, top-down measurement: "how many
//   ground-plane pixels away from the horizon is this thing, as if you were
//   looking straight down at the sand". It uses the SAME scale as worldX (a
//   worldY of 10 is the same real distance as a worldX of 10) - it is a
//   ground-plane pixel, not a screen pixel. It runs from 0 (an object has
//   just spawned at the horizon, about to become visible) to WORLD_DEPTH (an
//   object has reached the player's feet, about to be recycled).
//
//   Because worldX and worldY share one scale, two world-space points can
//   always be compared with a plain Euclidean distance (e.g.
//   `Math.hypot(dx, dy)`) as a real ground-plane distance. That is exactly
//   what TASK-010's "find the nearest buried item to the detector head"
//   search is meant to compute, and why DETECTOR's *Px-suffixed fields
//   (detectRadiusPx, collectRadiusPx, ...) can be compared directly against
//   it without any unit conversion.
//
// depth -> screenY mapping (depthToScreenY, exported below): this is the
//   perspective PROJECTION from that overhead ground-plane view down onto
//   the tilted, over-the-shoulder view the player actually sees. It squashes
//   the worldY axis into the visible screen band [horizonY, logicalHeight)
//   using a power curve: near worldY=0 the curve is shallow (a big worldY
//   step barely moves the object on screen -> reads as "far away, slow");
//   near worldY=WORLD_DEPTH the curve is steep (the same worldY step moves
//   the object a lot -> reads as "close, fast"). The exponent that shapes
//   this lives in BEACH.perspectiveExponent below. depthToScreenY returns a
//   float - ALWAYS Math.floor it at the drawing call site, never before (see
//   "the rounding trap" next).
//
// The rounding trap (this task's flagged blocking risk): scroll speed is
//   applied to worldY as a float, every frame, via `worldY += scrollSpeed *
//   deltaSeconds`. If that accumulation were floored every frame - instead
//   of just once, at the very end, right before a draw call - an object near
//   the horizon (where depthToScreenY's slope is close to zero) would floor
//   back to the exact same screenY frame after frame and visibly stop
//   moving, even though it is still (correctly) advancing in world space.
//   Every worldX/worldY held by this file, Player.ts, and Detector.ts is a
//   plain `number` (a float) for exactly this reason; only the last step,
//   right before a draw call, ever calls Math.floor.
//
// Fixed-depth objects (the player): it does not scroll, so it sits at one
//   constant worldY, exported below as PLAYER_WORLD_Y, and therefore
//   projects to one constant screenY forever (see Player.ts, which calls
//   depthToScreenY(PLAYER_WORLD_Y) exactly once and caches the result).
//
//   The detector head is NOT fixed-depth, though it is anchored to the
//   player: it is a full, ordinary point in world space, (headWorldX,
//   headWorldY), computed by rotating a rod of length rodLengthPx around the
//   player BY THIS FILE'S RULES, not by a screen-only cosmetic nudge -
//   swinging the rod sideways changes headWorldX (same worldX scale as
//   everything else), and swinging it toward/away from "pointing at the
//   horizon" changes headWorldY by moving it toward 0 (see Detector.ts's
//   headWorldY getter). Because it is a real world-space point like any
//   buried item, TASK-010's "distance from the head to the nearest item" is
//   an ordinary Euclidean distance between two world points - no unit
//   conversion, and no risk of the drawn rod pointing at a different pixel
//   than the one gameplay math measures from (Detector.ts's render() draws
//   headWorldX/headWorldY's projection directly, with nothing else added).
//
// Recycling: any object whose worldY has reached or passed WORLD_DEPTH has
//   scrolled past the player and is wrapped back toward the horizon by
//   SUBTRACTING WORLD_DEPTH from its worldY (never resetting to exactly 0),
//   so a fast scroll speed does not bunch every recycled object at the same
//   depth. Its worldX (and any other per-object random attribute) is
//   re-rolled from the shared Rng at the same time, so the recycled object
//   reads as a brand new one - see spawnDecorations()/update() below.
// ============================================================================

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
import type { Rng } from '../rng/Rng';
import { cellRect, DECORATIONS_SHEET, FOOTPRINT_SHEET } from '../sprites';

// Everything only this file cares about. Tweak freely; nothing outside this
// file reads BEACH directly (the handful of values other systems DO need -
// WORLD_DEPTH, PLAYER_WORLD_Y, depthToScreenY - are exported separately,
// below, as the game's shared coordinate contract).
const BEACH = {
    // How fast the world scrolls toward the player, in world units (ground-
    // plane pixels, see the contract above) per second. Raising this makes
    // every object's journey from horizon to feet shorter, so decoration
    // (and later buried items) streams past faster.
    //
    // BALANCE NOTE (TASK-010/011 QA round): was 70. A full-day simulation
    // (src/game/Treasures.ts + src/game/Detector.ts driven headlessly for
    // CONFIG.dayLengthSeconds, see this round's report) found a player who
    // never moves at all ("passive") collected MORE than a player who only
    // follows the beep tempo - the one signal this game gives you. At
    // scrollSpeed=70, every buried item's whole approach - from entering
    // DETECTOR.silenceThresholdPx to reaching the player - took under a
    // second, too little time to react to a beep and step into position
    // before the item was gone. Slowing the scroll does two things at once:
    // it gives a listening player enough time per approach to actually
    // aim, AND it lowers the total number of "free" passes-by-the-fixed-
    // centre a standing-still player benefits from over one day (fewer laps
    // = fewer unearned finds). Both push in the same direction, which is
    // why this is the single strongest lever for this problem - see
    // itemCount's own balance note in Treasures.ts for the other half.
    scrollSpeed: 40,

    // The size of the virtual depth axis, in world units, from the horizon
    // (0) to the player's feet (worldDepth). Deliberately close in magnitude
    // to CONFIG.logicalWidth, so a Euclidean distance between two world
    // points (TASK-010's nearest-item search) behaves like a real, undistorted
    // ground distance rather than something that needs its own unit
    // conversion. Raising it stretches out how long an object spends
    // looking "far away" near the horizon before the perspective curve
    // starts moving it quickly.
    worldDepth: 260,

    // Shapes the depth -> screenY curve (see depthToScreenY below). 1 would
    // be a perfectly linear scroll with no perspective feel at all. Above 1,
    // objects near the horizon (small worldY) barely move on screen while
    // objects near the player (worldY close to worldDepth) move fast - a
    // cheap fake-perspective look that needs no sprite scaling (the engine
    // cannot scale sprites - see PLAN.md section 9, Non-goals). 2-3 reads as
    // a believable ground-level perspective; much higher looks like nothing
    // moves at all until the very last moment.
    perspectiveExponent: 2.2,

    // How many decoration pieces exist on the strip at once. Raising this
    // makes the sand feel busier and more cluttered; 0 leaves it bare.
    decorationCount: 18,

    // Where the player (and the detector rod's base) sits, as a fraction of
    // worldDepth. 1.0 would put the player exactly on the bottom edge of the
    // screen; keeping it a little under 1 leaves a strip of sand (and room
    // for footprints and the rod) visible below the player's feet.
    playerDepthFraction: 0.88,

    // TASK-018: how many footprints can be "live" (stamped, not yet scrolled
    // past the player) at once - a fixed-capacity CIRCULAR BUFFER, not a
    // plain growing array. Without a cap, a long run's worth of side-steps
    // (Player.ts fires onStepComplete every stepDurationSeconds a direction
    // is held, as little as 0.12s apart) would keep piling footprints up for
    // the rest of CONFIG.dayLengthSeconds, and update()/render() below would
    // have to walk an ever-longer list every single frame - exactly the
    // "performance collapse in a long game" risk TODO.md's own blocking-risk note
    // for this task calls out by name. Capped and reused instead: the oldest
    // stamped footprint is silently overwritten by stampFootprint() below
    // once every slot is full (see nextFootprintSlot's own comment), which
    // is invisible to the player anyway - a footprint this old has almost
    // always already scrolled past WORLD_DEPTH and been culled by update()
    // long before the ring could wrap around and reclaim its slot. Sized
    // comfortably above "how many footprints fit on screen from horizon to
    // feet at once" (a step every stepWidthPx across the band, over the time
    // it takes one footprint to scroll the full worldDepth) so the cap is
    // never actually visible as popping or thinning of the trail during
    // ordinary play - it only ever bites during pathological "step on every
    // single frame" stress testing.
    footprintCapacity: 24,
} as const;

// --- The shared coordinate contract - see the big comment above. -----------

// The far end of the world's depth axis. An object's worldY lives in
// [0, WORLD_DEPTH); see depthToScreenY for how that turns into a screen row.
export const WORLD_DEPTH = BEACH.worldDepth;

// How fast every world-space object scrolls toward the player, in world
// units per second (see BEACH.scrollSpeed above for the full explanation).
// Exported so any other system that keeps its own pool of world-space
// objects - buried items in Treasures.ts (TASK-010) chief among them -
// scrolls at EXACTLY the same rate as the sand and decoration around it,
// instead of keeping a second, possibly-drifting copy of this number.
export const WORLD_SCROLL_SPEED_PX_PER_SEC = BEACH.scrollSpeed;

// The fixed depth the player (and the detector rod's base) sits at. Not the
// full worldDepth - see BEACH.playerDepthFraction above for why.
export const PLAYER_WORLD_Y = BEACH.worldDepth * BEACH.playerDepthFraction;

// Clamps a fraction to [0, 1]. depthToScreenY uses this so a worldY that is
// momentarily outside [0, WORLD_DEPTH) (for example, one more frame of
// accumulation before the owning system wraps it - see the contract above)
// still projects to a sane screen position instead of drawing somewhere
// wildly off-canvas.
function clamp01(value: number): number {
    if (value < 0) {
        return 0;
    }
    if (value > 1) {
        return 1;
    }
    return value;
}

// The depth -> screenY projection every system in src/game/ shares. Pure and
// stateless: same worldY in, same screenY out, always. Returns a FLOAT - the
// caller floors it right before drawing (see "the rounding trap" above).
export function depthToScreenY(worldY: number): number {
    const normalizedDepth = clamp01(worldY / BEACH.worldDepth);
    const visibleBandHeight = CONFIG.logicalHeight - CONFIG.horizonY;
    return CONFIG.horizonY + normalizedDepth ** BEACH.perspectiveExponent * visibleBandHeight;
}

// One scattered piece of decoration. `kind` indexes DECORATIONS_SHEET (see
// src/sprites.ts): 0 = litter, 1 = cup ring, 2 = speck. The sheet's fourth
// cell is reserved/empty, so DECORATION_KIND_COUNT below deliberately stops
// one short of the sheet's full cell count.
interface Decoration {
    worldX: number;
    worldY: number;
    kind: number;
}

// Derived from the sheet's own geometry (4 columns x 1 row, last cell
// reserved) instead of a bare "3", so a future extra decoration sprite only
// has to change src/sprites.ts, not this number too.
const DECORATION_KIND_COUNT = DECORATIONS_SHEET.columns * DECORATIONS_SHEET.rows - 1;

// One footprint stamp (TASK-018), a world-space object exactly like a
// Decoration above - it scrolls at the same WORLD_SCROLL_SPEED_PX_PER_SEC and
// projects through the same depthToScreenY(). `active` is what makes the
// fixed-size pool below a circular buffer instead of a plain list: a slot
// with active === false holds stale data from some earlier footprint that
// has already scrolled off (or was never stamped at all yet) and is skipped
// entirely by update()/render() - see stampFootprint()/spawnFootprintPool()
// below.
interface Footprint {
    worldX: number;
    worldY: number;
    active: boolean;
}

// Top-to-bottom slot order for the sky and sand bands drawn below. Sky goes
// deepest-at-the-top to warmest-at-the-horizon; sand goes darkest-near-the-
// water (just below the horizon) to brightest-near-the-player's-feet - see
// the ramp comments in src/palette/palette.ts for the same ordering.
const SKY_BAND_SLOTS = [SKY_ZENITH, SKY_UPPER, SKY_MID, SKY_HORIZON, SKY_GLOW] as const;
const SAND_BAND_SLOTS = [SAND_SHADOW, SAND_WET, SAND_DARK, SAND_MID, SAND_LIGHT, SAND_HIGHLIGHT] as const;

// One precomputed horizontal band: a screen rectangle plus the palette slot
// to fill it with.
interface Band {
    rect: Rect2i;
    slot: number;
}

// Splits [top, bottom) into `slots.length` equal-height bands and pairs each
// with its palette slot, in order. Cumulative (not per-band) rounding keeps
// neighboring bands from leaving a 1px gap or overlap between them.
//
// Called only at MODULE LOAD time below (SKY_BANDS/SAND_BANDS), never from
// render(): CONFIG.horizonY/logicalWidth/logicalHeight never change after
// configure() runs (editing configure() forces a full page reload - see
// CLAUDE.md), so the ten-plus Rect2i objects this produces are exactly the
// same on every single frame. Building them once here, instead of inside
// render(), is what keeps the sky/sand drawing allocation-free in the hot
// path - render() below just replays this fixed list every frame.
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

// Draws an already-built band list. No allocation - just replays the
// Rect2i/slot pairs buildBands() produced once at module load.
function drawBands(bands: readonly Band[]): void {
    for (let i = 0; i < bands.length; i += 1) {
        const band = bands[i] as Band;
        BT.drawRectFill(band.rect, band.slot);
    }
}

// The scrolling beach strip: sky above the horizon, sand below it, and a
// fixed-size pool of decoration scattered across the sand that continuously
// recycles as it scrolls past the player. Buried items (TASK-010) ended up
// living in their own file, src/game/Treasures.ts, but follow this exact
// same fixed-pool, world-space shape.
export class Beach {
    // The shared random number generator (see src/rng/Rng.ts) - passed in,
    // never created here, so CONFIG.seed keeps describing the whole run.
    private readonly rng: Rng;

    // The loaded, palette-indexed decoration sheet (see src/sprites.ts).
    // Passed in from src/game.ts's init(), which is the only place sprite
    // sheets are loaded.
    private readonly decorationsSheet: SpriteSheet;

    // The loaded, palette-indexed footprint stamp sheet (TASK-018) - passed
    // in the same way as decorationsSheet above.
    private readonly footprintSheet: SpriteSheet;

    // A fixed-size pool of decoration pieces, built once and mutated in
    // place every frame (see update()) - never reallocated, so scrolling the
    // beach does not allocate anything in the hot path.
    private decorations: Decoration[];

    // TASK-018: the footprint trail's circular buffer - a fixed-size pool,
    // built once (all slots inactive) and mutated in place forever after,
    // exactly like `decorations` above. Unlike decorations (which are always
    // ALL present from the very first frame, just scattered), footprints
    // start out entirely inactive - nothing has been stamped yet - and only
    // become active one at a time, as stampFootprint() is called.
    private readonly footprints: Footprint[];

    // The next slot stampFootprint() will (over)write, cycling
    //0..footprintCapacity-1 forever. This - not a "find a free slot" search -
    // is what makes this a CIRCULAR buffer: the slot index always advances,
    // so the OLDEST footprint (the one stamped longest ago, whether it is
    // still active or has already scrolled off and gone inactive on its own)
    // is always the next one silently overwritten once every slot has been
    // used at least once.
    private nextFootprintSlot: number;

    constructor(rng: Rng, decorationsSheet: SpriteSheet, footprintSheet: SpriteSheet) {
        this.rng = rng;
        this.decorationsSheet = decorationsSheet;
        this.footprintSheet = footprintSheet;
        this.decorations = this.spawnDecorations();
        this.footprints = this.buildFootprintPool();
        this.nextFootprintSlot = 0;
    }

    // Rebuilds the decoration pool from scratch, using whatever the shared
    // Rng's current state is, and clears every footprint. TASK-014 calls
    // this (alongside every other system's reset()) to put the beach back to
    // its starting shape without reloading the page - TODO.md TASK-018's own
    // completion checklist requires a restart to leave no footprint hanging
    // over from the previous run, exactly the same guarantee TASK-014
    // already asks every other per-run system for.
    reset(): void {
        this.decorations = this.spawnDecorations();
        for (let i = 0; i < this.footprints.length; i += 1) {
            (this.footprints[i] as Footprint).active = false;
        }
        this.nextFootprintSlot = 0;
    }

    // Stamps a new footprint at the given world position, claiming the next
    // slot in the circular buffer (see nextFootprintSlot's own comment).
    // Never allocates - every Footprint object already exists, built once in
    // buildFootprintPool() below. Called from src/game.ts's init(), wired
    // directly to Player.onStepComplete() - this file never imports
    // Player.ts itself (the same "introduced only in src/game.ts" pattern
    // every other cross-system wiring in this project already follows - see
    // Treasures.onCollect()'s own doc comment for the same rule).
    stampFootprint(worldX: number, worldY: number): void {
        const slot = this.footprints[this.nextFootprintSlot] as Footprint;
        slot.worldX = worldX;
        slot.worldY = worldY;
        slot.active = true;
        this.nextFootprintSlot = (this.nextFootprintSlot + 1) % BEACH.footprintCapacity;
    }

    // Advances every decoration piece's depth by one frame's worth of scroll
    // and recycles anything that has scrolled past the player, then does the
    // same for every ACTIVE footprint - except a footprint that scrolls past
    // WORLD_DEPTH is simply deactivated (freed back into the circular
    // buffer), never wrapped back to the horizon like decoration is. A
    // footprint is a one-off record of "the player stood here at this
    // moment" - wrapping it back to worldY=0 would make it reappear at the
    // horizon as if the player had just walked past there too, which is not
    // what happened. Called once a frame from src/game.ts's update() - never
    // from render().
    update(deltaSeconds: number): void {
        for (let i = 0; i < this.decorations.length; i += 1) {
            const decoration = this.decorations[i] as Decoration;
            decoration.worldY += BEACH.scrollSpeed * deltaSeconds;
            if (decoration.worldY >= WORLD_DEPTH) {
                // Subtract, don't reset to 0 - see "Recycling" in the
                // coordinate contract above for why that matters.
                decoration.worldY -= WORLD_DEPTH;
                decoration.worldX = this.rng.next() * CONFIG.logicalWidth;
                decoration.kind = this.rng.nextInt(0, DECORATION_KIND_COUNT);
            }
        }

        for (let i = 0; i < this.footprints.length; i += 1) {
            const footprint = this.footprints[i] as Footprint;
            if (!footprint.active) {
                continue; // empty slot - nothing stamped here yet, or already scrolled off
            }
            footprint.worldY += BEACH.scrollSpeed * deltaSeconds;
            if (footprint.worldY >= WORLD_DEPTH) {
                footprint.active = false; // scrolled past the player's feet - gone for good, not recycled
            }
        }
    }

    // Draws the sky, the sand, and every decoration piece, in that order, so
    // decoration always sits on top of the sand beneath it. Called once a
    // frame from src/game.ts's render() - never changes any state.
    render(): void {
        // Sky: everything above the horizon. Nothing below CONFIG.horizonY
        // is ever touched by this call, so the sky can never bleed onto the
        // sand (or vice versa for the sand call right after it).
        drawBands(SKY_BANDS);
        // Sand: everything at or below the horizon, down to the bottom edge
        // of the screen.
        drawBands(SAND_BANDS);

        // Footprints (TASK-018): drawn right on top of the bare sand, before
        // decoration and BEFORE Player.render() runs (src/game.ts calls
        // beach.render() in full before player.render() - see that file's
        // render() method), which is what "draw them UNDER the figure" (TODO.md
        // TASK-018) actually means in practice - no extra draw-order
        // bookkeeping needed here beyond simply being part of this method.
        // A footprint is a small, symmetric, NON-ROTATING stamp (see
        // src/sprites.ts's own comment on FOOTPRINT_SHEET) - it is drawn
        // identically regardless of which direction the step that made it
        // went, exactly like the detector tip and buried items never rotate
        // either (the engine has no rotated sprite draw at all - PLAN.md
        // section 9).
        for (let i = 0; i < this.footprints.length; i += 1) {
            const footprint = this.footprints[i] as Footprint;
            if (!footprint.active) {
                continue;
            }
            // Same floor-only-at-the-draw-call rule as decoration below.
            const screenX = Math.floor(footprint.worldX);
            const screenY = Math.floor(depthToScreenY(footprint.worldY));
            BT.drawSprite(this.footprintSheet, cellRect(FOOTPRINT_SHEET, 0), new Vector2i(screenX, screenY));
        }

        for (let i = 0; i < this.decorations.length; i += 1) {
            const decoration = this.decorations[i] as Decoration;
            // Floor only here, at the very last step before drawing - see
            // "the rounding trap" in the coordinate contract above. Drawing
            // with the TOP-LEFT corner at (screenX, screenY) - rather than,
            // say, centering the sprite on the point - guarantees a
            // decoration at worldY=0 draws AT the horizon line and never
            // above it, since screenY is monotonically non-decreasing in
            // worldY and worldY never goes negative.
            const screenX = Math.floor(decoration.worldX);
            const screenY = Math.floor(depthToScreenY(decoration.worldY));
            BT.drawSprite(
                this.decorationsSheet,
                cellRect(DECORATIONS_SHEET, decoration.kind),
                new Vector2i(screenX, screenY),
            );
        }
    }

    // A read-only snapshot of the current decoration layout. render() never
    // calls this - it exists so "the same seed produces the same beach" can
    // be checked directly (see this task's completion checklist in TODO.md)
    // without reaching into a private field, and it is handy scaffolding for
    // any future minimap or debug view.
    getDecorationSnapshot(): ReadonlyArray<Readonly<Decoration>> {
        return this.decorations;
    }

    // Builds BEACH.decorationCount decoration pieces, scattered across the
    // FULL depth range (not all starting at worldY=0) so the beach looks
    // populated from the very first frame instead of needing a few seconds
    // to scroll decoration into view. Every position and kind comes from the
    // shared Rng, so the exact same seed always produces the exact same
    // layout (see docs/basics.md-style determinism note in Rng.ts).
    private spawnDecorations(): Decoration[] {
        const decorations: Decoration[] = [];
        for (let i = 0; i < BEACH.decorationCount; i += 1) {
            decorations.push({
                worldX: this.rng.next() * CONFIG.logicalWidth,
                worldY: this.rng.next() * WORLD_DEPTH,
                kind: this.rng.nextInt(0, DECORATION_KIND_COUNT),
            });
        }
        return decorations;
    }

    // Builds the footprint circular buffer's BEACH.footprintCapacity slots,
    // all inactive - nothing has been stamped yet at construction time. Every
    // one of these objects lives for the entire lifetime of this Beach
    // instance; stampFootprint()/update() only ever flip fields on them, they
    // are never replaced or pushed alongside.
    private buildFootprintPool(): Footprint[] {
        const footprints: Footprint[] = [];
        for (let i = 0; i < BEACH.footprintCapacity; i += 1) {
            footprints.push({ worldX: 0, worldY: 0, active: false });
        }
        return footprints;
    }

    // A read-only snapshot of the footprint pool, INCLUDING inactive slots -
    // this is what proves the pool's own array length (not just how many
    // happen to be active right now) never grows past
    // BEACH.footprintCapacity no matter how long a run goes on (see this
    // task's completion checklist in TODO.md: "the number of live footprints is capped
    // from above", verified by checking `.length` stays constant here). render()
    // and update() never call this - it exists purely for that kind of
    // external verification, the same role getDecorationSnapshot() above
    // already plays for the decoration pool.
    getFootprintSnapshot(): ReadonlyArray<Readonly<Footprint>> {
        return this.footprints;
    }
}
