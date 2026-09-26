/** Lane steps. The figure walks forward on its own; a tap moves one lane. */

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { cellRect, PLAYER_SHEET } from '../sprites';
import { PLAYER_FEET_Y } from './Beach';
import { clampLane, laneCenterX } from './Lanes';

/**
 * Height of the strip along the top reserved for the HUD. Shared with Watch and Pickup so the drawn
 * HUD and the pickup reveal's safe band cannot disagree.
 */
export const HUD_BAND_HEIGHT_PX = 24;

/** Sprite top. The cell's bottom edge sits on PLAYER_FEET_Y. */
export const PLAYER_SPRITE_TOP_Y = PLAYER_FEET_Y - PLAYER_SHEET.cellHeight;

const PLAYER = {
    /** Seconds a lane change takes. One extra tap during this window is kept. */
    moveSeconds: 0.15,

    /** Walking time between footprints while the figure holds a lane. */
    stampSeconds: 0.32,

    /** Sideways distance that forces a footprint, so a lane change leaves a trail. */
    stampStridePx: 10,
} as const;

/** Slot 0 is the mouse; 1-3 are touch/pen contacts. Checked in that order. */
const POINTER_SLOT_COUNT = 4;

/** Middle lane. laneCount is 5, so this is lane 2. */
const START_LANE = Math.floor(CONFIG.laneCount / 2);

/** -1 left, 1 right, 0 settled. Detector.ts leans the rod toward it for the duration of a step. */
export type InputDirection = -1 | 0 | 1;

/** Fired when a footprint should be stamped at the drawn position. */
export type FootprintListener = (worldX: number, worldY: number) => void;

export class Player {
    private readonly playerSheet: SpriteSheet;

    /** Lane the figure has arrived at. */
    private laneIndex!: number;

    /** Drawn x, a float while a step is in flight. */
    private currentX!: number;

    private toLane!: number;

    private fromX!: number;

    private toX!: number;

    private moveElapsedSeconds!: number;

    private isMoving!: boolean;

    /** One tap remembered during a step. 0 when empty. */
    private queuedDirection!: -1 | 0 | 1;

    /** Seconds of walking. Advances one per second whether or not the figure changes lanes. */
    private walkSeconds!: number;

    private sinceStampSeconds!: number;

    private lastStampX!: number;

    /** Startup wiring, not per-run state: reset() leaves it alone. */
    private readonly footprintListeners: FootprintListener[] = [];

    constructor(playerSheet: SpriteSheet) {
        this.playerSheet = playerSheet;
        this.settle();
    }

    /** Back to the middle lane, settled, walk clock at zero. Listeners are kept. */
    reset(): void {
        this.settle();
    }

    private settle(): void {
        this.laneIndex = START_LANE;
        this.currentX = laneCenterX(START_LANE);
        this.toLane = START_LANE;
        this.fromX = this.currentX;
        this.toX = this.currentX;
        this.moveElapsedSeconds = 0;
        this.isMoving = false;
        this.queuedDirection = 0;
        this.walkSeconds = 0;
        this.sinceStampSeconds = 0;
        this.lastStampX = this.currentX;
    }

    onFootprint(listener: FootprintListener): void {
        this.footprintListeners.push(listener);
    }

    /** Walks forward and applies at most one lane tap, plus one tap queued from mid-step. */
    update(deltaSeconds: number): void {
        this.walkSeconds += deltaSeconds;
        this.sinceStampSeconds += deltaSeconds;

        const direction = this.readStep();

        if (direction !== 0) {
            this.requestStep(direction);
        }

        if (this.isMoving) {
            this.advanceMove(deltaSeconds);
        }

        this.stampIfDue(false);
    }

    render(): void {
        const drawX = Math.floor(this.currentX) - Math.floor(PLAYER_SHEET.cellWidth / 2);

        BT.drawSprite(this.playerSheet, cellRect(PLAYER_SHEET, 0), new Vector2i(drawX, PLAYER_SPRITE_TOP_Y));
    }

    /** Lane-centre x in screen pixels. The sprite is drawn centred on it. */
    get worldX(): number {
        return this.currentX;
    }

    /** Seconds of walking since the run started. */
    get worldY(): number {
        return this.walkSeconds;
    }

    /** Lane being stepped to, or the settled lane. 0 is the leftmost. */
    get lane(): number {
        return this.isMoving ? this.toLane : this.laneIndex;
    }

    /** Direction of the step in flight. */
    get inputDirection(): InputDirection {
        if (!this.isMoving) {
            return 0;
        }

        return this.toX > this.fromX ? 1 : -1;
    }

    /**
     * Left half of the screen steps left, right half steps right. Keyboard is one step per press.
     * Holding either does nothing: both reads are the press edge, and the engine ignores key-repeat.
     */
    private readStep(): -1 | 1 | 0 {
        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot += 1) {
            if (!BT.isPressed(BT.BTN_POINTER_A, slot)) {
                continue;
            }

            return BT.pointerPos(slot).x < CONFIG.logicalWidth / 2 ? -1 : 1;
        }

        if (BT.isPressed(BT.BTN_LEFT, 0)) {
            return -1;
        }

        if (BT.isPressed(BT.BTN_RIGHT, 0)) {
            return 1;
        }

        return 0;
    }

    /** Starts a step, or remembers one tap if a step is already running. An outward edge tap is dropped. */
    private requestStep(direction: -1 | 1): void {
        if (!this.isMoving) {
            this.tryBegin(direction, this.laneIndex);
            return;
        }

        if (this.queuedDirection !== 0) {
            return;
        }

        const arrival = this.toLane + direction;

        if (arrival < 0 || arrival >= CONFIG.laneCount) {
            return;
        }

        this.queuedDirection = direction;
    }

    /** False when `direction` would leave the lanes. */
    private tryBegin(direction: -1 | 1, fromLane: number): boolean {
        const target = clampLane(fromLane + direction);

        if (target === fromLane) {
            return false;
        }

        this.toLane = target;
        this.fromX = this.currentX;
        this.toX = laneCenterX(target);
        this.moveElapsedSeconds = 0;
        this.isMoving = true;

        return true;
    }

    /** Snaps onto the target lane. A queued tap starts immediately, keeping leftover time from a long frame. */
    private advanceMove(deltaSeconds: number): void {
        this.moveElapsedSeconds += deltaSeconds;

        if (this.moveElapsedSeconds < PLAYER.moveSeconds) {
            const t = this.moveElapsedSeconds / PLAYER.moveSeconds;
            this.currentX = this.fromX + (this.toX - this.fromX) * t;
            return;
        }

        const leftoverSeconds = this.moveElapsedSeconds - PLAYER.moveSeconds;

        this.laneIndex = this.toLane;
        this.currentX = this.toX;
        this.isMoving = false;
        this.stampIfDue(true);

        const queued = this.queuedDirection;

        this.queuedDirection = 0;

        if (queued !== 0 && this.tryBegin(queued, this.laneIndex)) {
            this.advanceMove(leftoverSeconds);
        }
    }

    /** `force` stamps the lane just arrived at, unless a stride stamp already landed on that x. */
    private stampIfDue(force: boolean): void {
        const xMoved = Math.abs(this.currentX - this.lastStampX) >= PLAYER.stampStridePx;

        if (force) {
            if (this.currentX === this.lastStampX) {
                return;
            }
        } else if (this.sinceStampSeconds < PLAYER.stampSeconds && !xMoved) {
            return;
        }

        this.sinceStampSeconds = 0;
        this.lastStampX = this.currentX;

        for (let i = 0; i < this.footprintListeners.length; i += 1) {
            const listener = this.footprintListeners[i] as FootprintListener;
            listener(this.currentX, this.walkSeconds);
        }
    }
}
