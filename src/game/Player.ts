/** The player figure: fixed screen row, discrete side-steps, clamped to a playable band. */

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { cellRect, PLAYER_SHEET } from '../sprites';
import { depthToScreenY, PLAYER_WORLD_Y } from './Beach';
import { DETECTOR_MAX_HORIZONTAL_REACH_PX } from './Detector';

/**
 * Height of the strip along the top reserved for the HUD. Shared with Counter, Watch and Pickup so
 * the "is this tap movement or a HUD tap" boundary and the drawn HUD can never disagree.
 */
export const HUD_BAND_HEIGHT_PX = 24;

const PLAYER = {
    /** Pixels per side-step. */
    stepWidthPx: 14,

    /** Seconds per step. No new step starts mid-step, so this also caps walking speed. */
    stepDurationSeconds: 0.12,

    /**
     * Margin kept clear on both screen edges. Equal to the detector head's worst-case horizontal
     * reach, so the rod can never swing off-canvas even with the player pinned at the band's edge.
     */
    bandMarginPx: DETECTOR_MAX_HORIZONTAL_REACH_PX,

    /** Half-width of a dead zone around screen centre, so a press on the centre pixel does not flip between left and right. */
    pointerDeadZoneHalfWidthPx: 6,
} as const;

/** Slot 0 is the mouse; 1-3 are touch/pen contacts. Checked in that order. */
const POINTER_SLOT_COUNT = 4;

/** -1 left, 1 right, 0 nothing held. Detector.ts swings the rod toward it. */
export type InputDirection = -1 | 0 | 1;

/** Fired once a step has settled. Beach.ts stamps a footprint from it. */
export type StepCompleteListener = (worldX: number, worldY: number) => void;

export class Player {
    private readonly playerSheet: SpriteSheet;

    /** Playable band edges. */
    private readonly bandMinX: number;
    private readonly bandMaxX: number;

    /** Fixed screen row, projected once from PLAYER_WORLD_Y. */
    readonly screenY: number;

    /** A float: a step animates between two stepWidthPx-aligned positions. */
    private currentX: number;

    /** The step in flight. Only meaningful while isStepping. */
    private stepOriginX: number;
    private stepTargetX: number;
    private stepElapsedSeconds: number;
    private isStepping: boolean;

    /** Sampled every update(), even mid-step, so the rod keeps swinging toward held input. */
    private lastInputDirection: InputDirection;

    /** Startup wiring, not per-run state: reset() leaves it alone. */
    private readonly stepListeners: StepCompleteListener[] = [];

    constructor(playerSheet: SpriteSheet) {
        this.playerSheet = playerSheet;
        this.bandMinX = PLAYER.bandMarginPx;
        this.bandMaxX = CONFIG.logicalWidth - PLAYER.bandMarginPx;
        this.screenY = Math.floor(depthToScreenY(PLAYER_WORLD_Y));

        this.currentX = CONFIG.logicalWidth / 2;
        this.stepOriginX = this.currentX;
        this.stepTargetX = this.currentX;
        this.stepElapsedSeconds = 0;
        this.isStepping = false;
        this.lastInputDirection = 0;
    }

    /** Back to centre, settled. Listeners are kept. */
    reset(): void {
        this.currentX = CONFIG.logicalWidth / 2;
        this.stepOriginX = this.currentX;
        this.stepTargetX = this.currentX;
        this.stepElapsedSeconds = 0;
        this.isStepping = false;
        this.lastInputDirection = 0;
    }

    onStepComplete(listener: StepCompleteListener): void {
        this.stepListeners.push(listener);
    }

    /** Reads input and advances any step in flight. */
    update(deltaSeconds: number): void {
        this.lastInputDirection = this.readInputDirection();

        if (this.isStepping) {
            this.advanceStep(deltaSeconds);
            return;
        }

        if (this.lastInputDirection === 0) {
            return;
        }

        this.tryStartStep(this.lastInputDirection);
    }

    render(): void {
        const screenX = Math.floor(this.currentX);
        BT.drawSprite(this.playerSheet, cellRect(PLAYER_SHEET, 0), new Vector2i(screenX, this.screenY));
    }

    /** World position; worldY is the fixed PLAYER_WORLD_Y. */
    get worldX(): number {
        return this.currentX;
    }

    get worldY(): number {
        return PLAYER_WORLD_Y;
    }

    /** What is held this frame. */
    get inputDirection(): InputDirection {
        return this.lastInputDirection;
    }

    /**
     * A held pointer wins; the keyboard is the fallback when nothing is held. Uses
     * BT.isDown(BT.BTN_POINTER_A, slot), the real button state, not BT.isPointerActive(): that one is
     * true while the mouse merely hovers over the canvas, which made standing still impossible on
     * desktop. Tap.ts reads the same button as an edge (isPressed) for menu taps.
     */
    private readInputDirection(): InputDirection {
        const heldPointerDirection = this.readHeldPointerDirection();
        if (heldPointerDirection !== null) {
            return heldPointerDirection;
        }

        if (BT.isDown(BT.BTN_LEFT, 0)) {
            return -1;
        }
        if (BT.isDown(BT.BTN_RIGHT, 0)) {
            return 1;
        }
        return 0;
    }

    /**
     * The first held pointer slot, as a direction. Returns null (not 0) when nothing is held, so the
     * caller falls through to the keyboard. A pointer held in the HUD band is skipped the same way; a
     * pointer held in the dead zone returns 0 and does block the keyboard.
     */
    private readHeldPointerDirection(): InputDirection | null {
        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot += 1) {
            if (!BT.isDown(BT.BTN_POINTER_A, slot)) {
                continue;
            }

            const pointer = BT.pointerPos(slot);
            if (pointer.y < HUD_BAND_HEIGHT_PX) {
                continue;
            }

            const offsetFromCenterPx = pointer.x - CONFIG.logicalWidth / 2;
            if (Math.abs(offsetFromCenterPx) <= PLAYER.pointerDeadZoneHalfWidthPx) {
                return 0;
            }
            return offsetFromCenterPx < 0 ? -1 : 1;
        }
        return null;
    }

    /** Clamps the target, not the result, so holding a direction at the band's edge is a no-op instead of a sub-pixel drift. */
    private tryStartStep(direction: -1 | 1): void {
        const proposedX = this.currentX + direction * PLAYER.stepWidthPx;
        const clampedX = Math.min(this.bandMaxX, Math.max(this.bandMinX, proposedX));
        if (clampedX === this.currentX) {
            return;
        }
        this.stepOriginX = this.currentX;
        this.stepTargetX = clampedX;
        this.stepElapsedSeconds = 0;
        this.isStepping = true;
    }

    /** Snaps exactly onto the target when done (no overshoot on a long frame) and fires the listeners. */
    private advanceStep(deltaSeconds: number): void {
        this.stepElapsedSeconds += deltaSeconds;
        if (this.stepElapsedSeconds >= PLAYER.stepDurationSeconds) {
            this.currentX = this.stepTargetX;
            this.isStepping = false;
            this.notifyStepComplete();
            return;
        }
        const t = this.stepElapsedSeconds / PLAYER.stepDurationSeconds;
        this.currentX = this.stepOriginX + (this.stepTargetX - this.stepOriginX) * t;
    }

    private notifyStepComplete(): void {
        for (let i = 0; i < this.stepListeners.length; i += 1) {
            const listener = this.stepListeners[i] as StepCompleteListener;
            listener(this.currentX, PLAYER_WORLD_Y);
        }
    }
}
