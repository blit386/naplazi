// The detector: a rod drawn as lines, swung left/right by the same input
// that steps the player, with a small non-rotating sprite at the tip. The
// tip's world position (the "detector head") is what TASK-010's Treasures.ts
// and TASK-011's Sfx.ts measure distance to buried items from - see Beach.ts's
// coordinate system contract for what "world position" means here.

import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { OBJECT_ACCENT, OBJECT_METAL } from '../palette/palette';
import { cellRect, DETECTOR_HEAD_SHEET } from '../sprites';
import { depthToScreenY, PLAYER_WORLD_Y } from './Beach';
import type { InputDirection } from './Player';

// Everything about the detector rod and its beep. Named DETECTOR to match the
// representative CONFIG block in PLAN.md section 5, which this follows
// field-for-field. Exported (unlike Player.ts's PLAYER or Beach.ts's BEACH)
// because PLAN.md section 5 deliberately keeps every detector- and
// beep-tuning number - rod geometry AND collection AND beep timing - in this
// ONE block, so Treasures.ts (TASK-010, collectRadiusPx) and Sfx.ts
// (TASK-011, detectRadiusPx/silenceThresholdPx/beepInterval*Ms/
// beepCurvePower) read the exact same numbers from here instead of each
// keeping its own possibly-drifting copy.
export const DETECTOR = {
    // How far the head reaches from the player, in world units (the same
    // scale as worldX and screenX - see Beach.ts's coordinate contract).
    rodLengthPx: 46,
    // How far left/right the rod can swing from pointing straight ahead.
    maxAngleDeg: 70,
    // How fast the rod swings TOWARD held input, in degrees per second.
    // Multiplied by deltaSeconds every frame, never by a frame count - see
    // CLAUDE.md's note that update() can run more or less than once per
    // rendered frame.
    turnSpeedDegPerSec: 140,
    // How fast the rod eases back to centre when nothing is held.
    returnSpeedDegPerSec: 90,

    // TASK-016: how far beyond the tip sprite's own edge the "just beeped" highlight ring reaches at
    // full intensity (tipBlinkIntensity === 1, see render() below). Shrinks toward the sprite's own
    // edge as intensity fades toward 0 - the decay timer that drives that fade lives in
    // src/game/Signals.ts, not here; this file only knows how to draw one already-decided 0..1 number.
    blinkHighlightMaxPaddingPx: 3,

    // --- Read by other files only; nothing in THIS file reads them itself.
    // Listed here anyway (rather than split off to wherever each is read) because PLAN.md's
    // representative DETECTOR block lists them alongside the fields above -
    // keeping the whole beep-tuning surface in one place. ---
    detectRadiusPx: 64, // TASK-010/011: beeping starts inside this ring - read by Sfx.ts
    silenceThresholdPx: 80, // TASK-011: no beep at all beyond this - read by Sfx.ts and Treasures.ts
    beepIntervalFastMs: 90, // TASK-011: tick interval right on top of an item - read by Sfx.ts
    beepIntervalSlowMs: 700, // TASK-011: tick interval at the very edge of the ring - read by Sfx.ts
    beepCurvePower: 2, // TASK-011: 1 = linear beep ramp, 2 = urgent near the target - read by Sfx.ts
    collectRadiusPx: 8, // TASK-010: how close the collector must be to dig something up - read by Treasures.ts
} as const;

// Which point does the digging, once TASK-010 exists: the detector head, or
// the player's own body. See PLAN.md section 4.6. `head` is the recommended
// default - aiming the rod is supposed to matter for collecting, not just
// for the beep.
export const COLLECTION_MODE: 'head' | 'body' = 'head';

// The detector head's maximum possible horizontal DISTANCE FROM THE PLAYER'S
// OWN worldX, in pixels, counting the full visible extent of the head sprite
// (not just its centre point). Reached when the rod is swung all the way to
// maxAngleDeg (sin() is largest at the edge of the rod's range) plus the
// sprite's own half-width, since the sprite is centred on the head point and
// its far edge sticks out that much further. Math.ceil rounds outward (never
// under-covers), so a caller sizing a safety margin off this number is
// always safe, never off by a fraction of a pixel.
//
// Exported so Player.ts can size its playable band's margin FROM THIS EXACT
// NUMBER, by computation - see PLAYER.bandMarginPx in Player.ts - instead of
// a hand-copied constant that could silently drift out of sync with these
// numbers. headWorldX below adds no direction-dependent offset of its own,
// so this reach is exactly symmetric left and right: one number safely
// covers both edges of the band.
export const DETECTOR_MAX_HORIZONTAL_REACH_PX = Math.ceil(
    Math.sin((DETECTOR.maxAngleDeg * Math.PI) / 180) * DETECTOR.rodLengthPx + DETECTOR_HEAD_SHEET.cellWidth / 2,
);

// Moves `current` toward `target` by at most `maxDelta`, clamping exactly
// onto the target instead of overshooting past it. Used for the rod's angle
// so it (a) stops exactly at +-maxAngleDeg and (b) eases back to exactly 0
// without ever oscillating past centre and back - a plain subtract-then-add
// step (with no clamp) would overshoot by however far the last frame's step
// was too big, which reads as a visible wobble around the target.
function moveToward(current: number, target: number, maxDelta: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) {
        return target;
    }
    return current + Math.sign(diff) * maxDelta;
}

// The detector rod: an angle that eases toward held input and back to
// centre, plus the geometry to turn that angle into a head position.
export class Detector {
    // The loaded, palette-indexed detector-head sheet (see src/sprites.ts).
    // Passed in from src/game.ts's init() - the only place sprite sheets load.
    private readonly headSheet: SpriteSheet;

    // The rod's current angle, in degrees, where 0 points straight ahead -
    // toward the horizon, away from the player, see headWorldY below -
    // positive is right, negative is left. A float, changed by a limited
    // rate every frame - never assigned directly to a target.
    private angleDeg: number;

    // The player's current worldX, refreshed every update() call (see
    // update() below) so the rod's base always tracks the player even
    // mid-step.
    private baseWorldX: number;

    constructor(headSheet: SpriteSheet) {
        this.headSheet = headSheet;
        this.angleDeg = 0;
        this.baseWorldX = CONFIG.logicalWidth / 2;
    }

    // Puts the rod back to centre, pointing straight ahead. TASK-014 calls
    // this (alongside every other system's reset()) to restart a run without
    // reloading the page. baseWorldX is corrected for real on the very next
    // update() call regardless (the engine always runs update() before
    // render() - see docs/basics.md) - reset here only as a defensive
    // default in case render() ever runs before that.
    reset(): void {
        this.angleDeg = 0;
        this.baseWorldX = CONFIG.logicalWidth / 2;
    }

    // Eases the rod's angle toward the player's held input direction, or
    // back toward centre when nothing is held. Takes the player's state as
    // plain values (not a Player reference) so this file stays a pure
    // angle/geometry system with no dependency on how Player.ts itself works.
    update(deltaSeconds: number, playerWorldX: number, inputDirection: InputDirection): void {
        this.baseWorldX = playerWorldX;

        if (inputDirection === 0) {
            this.angleDeg = moveToward(this.angleDeg, 0, DETECTOR.returnSpeedDegPerSec * deltaSeconds);
            return;
        }

        const targetAngleDeg = inputDirection * DETECTOR.maxAngleDeg;
        this.angleDeg = moveToward(this.angleDeg, targetAngleDeg, DETECTOR.turnSpeedDegPerSec * deltaSeconds);
    }

    // Draws the rod as a line from the player's position to the head, then
    // the head sprite centred on the head point, unrotated (the sprite is
    // radially symmetric on purpose - see src/sprites.ts). The drawn head
    // position is EXACTLY the floored projection of (headWorldX, headWorldY)
    // below - nothing else is added anywhere in this method. That equality
    // matters: TASK-010's Treasures.ts measures distance from headWorldX/headWorldY
    // every frame (see src/game.ts's update(), when COLLECTION_MODE is 'head'), so
    // whatever the player sees the rod pointing at must be the very same
    // point the game measures against, pixel for pixel.
    //
    // `tipBlinkIntensity` (TASK-016) is 0 (no highlight at all) to 1 (the instant of a beep) - a plain
    // number handed in by src/game.ts, itself read straight from src/game/Signals.ts's
    // detectorBlinkIntensity getter every frame. This file never imports Signals.ts or reaches into
    // its decay timer to get that number - it only ever draws whatever 0..1 value it is given, which
    // is exactly the "Detector receives a value as a parameter" split this task's brief asks for.
    render(tipBlinkIntensity: number): void {
        const base = new Vector2i(Math.floor(this.baseWorldX), Math.floor(depthToScreenY(PLAYER_WORLD_Y)));
        const head = new Vector2i(Math.floor(this.headWorldX), Math.floor(depthToScreenY(this.headWorldY)));
        BT.drawLine(base, head, OBJECT_METAL);

        // Centre the (symmetric) tip sprite on the head point - Math.floor
        // on each half, per this task's rule about rounding division results.
        const halfWidth = Math.floor(DETECTOR_HEAD_SHEET.cellWidth / 2);
        const halfHeight = Math.floor(DETECTOR_HEAD_SHEET.cellHeight / 2);
        const tipPosition = new Vector2i(head.x - halfWidth, head.y - halfHeight);
        BT.drawSprite(this.headSheet, cellRect(DETECTOR_HEAD_SHEET, 0), tipPosition);

        // The "just beeped" highlight: an outline ring around the tip sprite's own bounds, in
        // OBJECT_ACCENT (the object ramp's shared "bright sparkle/glint" slot - see
        // src/palette/palette.ts) rather than a HUD slot, since this ring sits on a WORLD object and
        // should dim/brighten with the same day/night fade as everything else the detector is made of.
        // Drawn only while there is anything to show at all - most frames tipBlinkIntensity is 0 and
        // this whole block is skipped.
        if (tipBlinkIntensity > 0) {
            const padding = Math.max(1, Math.round(tipBlinkIntensity * DETECTOR.blinkHighlightMaxPaddingPx));
            const highlightRect = new Rect2i(
                tipPosition.x - padding,
                tipPosition.y - padding,
                DETECTOR_HEAD_SHEET.cellWidth + padding * 2,
                DETECTOR_HEAD_SHEET.cellHeight + padding * 2,
            );
            BT.drawRect(highlightRect, OBJECT_ACCENT);
        }
    }

    // The detector head's world position - a genuine point in world space
    // (worldX, worldY), per Beach.ts's coordinate system contract. Rotating
    // a rod of length rodLengthPx by angleDeg around the player, IN WORLD
    // SPACE, gives both components: sin() for how far sideways the head has
    // swung (worldX and screenX share one scale - see Beach.ts), and cos()
    // for how far the head reaches away from the player TOWARD THE HORIZON
    // (see headWorldY below). render() projects and draws exactly this point
    // - the same numbers TASK-010's Treasures.ts measures distance from, always in
    // agreement with what is drawn, by construction (no separate "drawn"
    // position exists any more - see render() above).
    get headWorldX(): number {
        const angleRad = (this.angleDeg * Math.PI) / 180;
        return this.baseWorldX + Math.sin(angleRad) * DETECTOR.rodLengthPx;
    }

    get headWorldY(): number {
        const angleRad = (this.angleDeg * Math.PI) / 180;
        // Per the coordinate contract, worldY runs from 0 at the horizon to
        // WORLD_DEPTH at the player's feet - so "the rod reaches toward the
        // horizon" means SUBTRACTING from the player's own worldY, not
        // adding to it. With today's numbers PLAYER_WORLD_Y is 228.8 and
        // rodLengthPx is 46, so the closest the head ever gets to the
        // horizon is 228.8 - 46 = 182.8 world units - safely above 0 for
        // every angle, so the head never reaches past the horizon. If a
        // future CONFIG/DETECTOR change ever pushed that below 0,
        // depthToScreenY's own clamp01 (see Beach.ts) is the safety net that
        // keeps the projection on-screen rather than doing anything worse.
        return PLAYER_WORLD_Y - Math.cos(angleRad) * DETECTOR.rodLengthPx;
    }
}
