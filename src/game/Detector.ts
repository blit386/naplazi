/**
 * The detector rod: a line from the player to a non-rotating tip sprite, swung by the same input that
 * steps the player. The tip's world position is what Treasures.ts measures distance from.
 */

import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { OBJECT_ACCENT, OBJECT_METAL } from '../palette/palette';
import { cellRect, DETECTOR_HEAD_SHEET } from '../sprites';
import { depthToScreenY, PLAYER_WORLD_Y } from './Beach';
import type { InputDirection } from './Player';

/**
 * Every detector and beep tuning number in one place. Exported because Treasures.ts (collectRadiusPx,
 * silenceThresholdPx) and Sfx.ts (the beep fields) read from here instead of keeping their own copies.
 */
export const DETECTOR = {
    /** Rod length, in world units. */
    rodLengthPx: 46,
    /** Maximum swing from straight ahead. */
    maxAngleDeg: 70,
    /** Degrees per second toward held input. */
    turnSpeedDegPerSec: 140,
    /** Degrees per second back to centre when nothing is held. */
    returnSpeedDegPerSec: 90,

    /** How far the "just beeped" ring reaches beyond the tip sprite at full intensity. Signals.ts owns the decay. */
    blinkHighlightMaxPaddingPx: 3,

    /** Beeping starts inside this ring. */
    detectRadiusPx: 64,
    /** No beep at all beyond this. Also Treasures' search window. */
    silenceThresholdPx: 80,
    /** Tick interval right on top of an item. */
    beepIntervalFastMs: 90,
    /** Tick interval at the edge of the ring. */
    beepIntervalSlowMs: 700,
    /** 1 = linear ramp; 2 = most of the speed-up in the last few pixels. */
    beepCurvePower: 2,
    /** How close the collector must get to dig an item up. */
    collectRadiusPx: 8,
} as const;

/** Which point digs: the detector head (so aiming matters) or the player's body. */
export const COLLECTION_MODE: 'head' | 'body' = 'head';

/**
 * Worst-case horizontal distance of the head sprite's far edge from the player's worldX: full swing
 * plus half the sprite width, rounded outward. Player.ts sizes its band margin from this.
 */
export const DETECTOR_MAX_HORIZONTAL_REACH_PX = Math.ceil(
    Math.sin((DETECTOR.maxAngleDeg * Math.PI) / 180) * DETECTOR.rodLengthPx + DETECTOR_HEAD_SHEET.cellWidth / 2,
);

/** Moves `current` toward `target` by at most `maxDelta`, landing exactly on it instead of oscillating around it. */
function moveToward(current: number, target: number, maxDelta: number): number {
    const diff = target - current;
    if (Math.abs(diff) <= maxDelta) {
        return target;
    }
    return current + Math.sign(diff) * maxDelta;
}

export class Detector {
    private readonly headSheet: SpriteSheet;

    /** 0 points at the horizon; positive is right. Rate-limited, never assigned a target directly. */
    private angleDeg: number;

    /** The player's worldX, refreshed every update() so the rod tracks a mid-step player. */
    private baseWorldX: number;

    constructor(headSheet: SpriteSheet) {
        this.headSheet = headSheet;
        this.angleDeg = 0;
        this.baseWorldX = CONFIG.logicalWidth / 2;
    }

    /** Rod back to centre. baseWorldX is corrected on the next update() anyway. */
    reset(): void {
        this.angleDeg = 0;
        this.baseWorldX = CONFIG.logicalWidth / 2;
    }

    /** Eases the angle toward held input, or back to centre. Takes plain values so this file has no dependency on Player. */
    update(deltaSeconds: number, playerWorldX: number, inputDirection: InputDirection): void {
        this.baseWorldX = playerWorldX;

        if (inputDirection === 0) {
            this.angleDeg = moveToward(this.angleDeg, 0, DETECTOR.returnSpeedDegPerSec * deltaSeconds);
            return;
        }

        const targetAngleDeg = inputDirection * DETECTOR.maxAngleDeg;
        this.angleDeg = moveToward(this.angleDeg, targetAngleDeg, DETECTOR.turnSpeedDegPerSec * deltaSeconds);
    }

    /**
     * Rod line, tip sprite centred on the head, then the beep highlight ring. The drawn head is exactly
     * the floored projection of headWorldX/headWorldY, so what the player sees the rod pointing at is
     * what the game measures from. `tipBlinkIntensity` is 0..1, handed in from Signals via game.ts.
     */
    render(tipBlinkIntensity: number): void {
        const base = new Vector2i(Math.floor(this.baseWorldX), Math.floor(depthToScreenY(PLAYER_WORLD_Y)));
        const head = new Vector2i(Math.floor(this.headWorldX), Math.floor(depthToScreenY(this.headWorldY)));
        BT.drawLine(base, head, OBJECT_METAL);

        const halfWidth = Math.floor(DETECTOR_HEAD_SHEET.cellWidth / 2);
        const halfHeight = Math.floor(DETECTOR_HEAD_SHEET.cellHeight / 2);
        const tipPosition = new Vector2i(head.x - halfWidth, head.y - halfHeight);
        BT.drawSprite(this.headSheet, cellRect(DETECTOR_HEAD_SHEET, 0), tipPosition);

        // OBJECT_ACCENT is a world slot, so the ring dims with the day like the rest of the rod.
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

    /** The head as a real world point: sin() for the sideways swing, cos() for the reach toward the horizon. */
    get headWorldX(): number {
        const angleRad = (this.angleDeg * Math.PI) / 180;
        return this.baseWorldX + Math.sin(angleRad) * DETECTOR.rodLengthPx;
    }

    get headWorldY(): number {
        const angleRad = (this.angleDeg * Math.PI) / 180;
        // worldY shrinks toward the horizon, so the reach is subtracted. With today's numbers the head
        // never gets below 182.8; clamp01 in depthToScreenY is the safety net if tuning ever changes that.
        return PLAYER_WORLD_Y - Math.cos(angleRad) * DETECTOR.rodLengthPx;
    }
}
