/**
 * Turns CONFIG.dayLengthSeconds of real time into the 06:00 -> 22:00 clock, derives the lighting
 * phase, pauses while the tab is hidden, and fires the end-of-day event once. Owns time only: Watch.ts
 * draws it, and palette.ts and Ambience.ts react to onPhaseChange().
 */

import { CONFIG } from '../config';
import type { DayPhase } from '../palette/palette';

const DAY_CLOCK = {
    /**
     * Cap on what one update() may add. Defense in depth: this engine's BT.deltaSeconds is a fixed
     * 1 / targetFPS, and its catch-up burst after a hidden tab is capped at 8 calls, so no single call
     * can be huge today. A future engine or host that passes a measured delta would hit this clamp
     * instead of skipping the day forward by minutes.
     */
    maxDeltaSecondsPerUpdate: 0.25,
} as const;

/** Fired on an actual phase transition, never every frame. */
export type DayPhaseChangeListener = (phase: DayPhase, dayProgress: number) => void;

/** Fired once per run, the instant the day reaches CONFIG.dayEndMinutes. */
export type DayEndListener = () => void;

/**
 * The 'visibilitychange' listener is module-level and idempotent, so repeated construction (hot
 * reload re-running init()) never stacks listeners. Its AbortController lives on globalThis rather
 * than in a module `let`: the hot-reload plugin re-evaluates a changed module's top level, and a fresh
 * module generation would otherwise lose track of the listener the previous one attached.
 */
const VISIBILITY_CONTROLLER_KEY = '__naplaziDayClockVisibilityController__';

/** Updated by the listener; update() reads this instead of document.hidden, so a no-document context needs no per-read guard. */
let isDocumentHiddenNow = typeof document === 'undefined' ? false : document.hidden;

/** Attaches the listener, aborting whichever one a previous call installed. Always leaves exactly one. */
function ensurePauseOnHiddenTab(): void {
    if (typeof document === 'undefined') {
        return;
    }

    const globalWithController = globalThis as typeof globalThis & {
        [VISIBILITY_CONTROLLER_KEY]?: AbortController;
    };
    globalWithController[VISIBILITY_CONTROLLER_KEY]?.abort();

    const controller = new AbortController();
    globalWithController[VISIBILITY_CONTROLLER_KEY] = controller;

    isDocumentHiddenNow = document.hidden;
    document.addEventListener(
        'visibilitychange',
        () => {
            isDocumentHiddenNow = document.hidden;
        },
        { signal: controller.signal },
    );
}

/** A dayProgress exactly on a threshold belongs to the later phase (>=). */
function computeDayPhase(dayProgress: number): DayPhase {
    if (dayProgress >= CONFIG.phaseNightAt) {
        return 'night';
    }
    if (dayProgress >= CONFIG.phaseEveningAt) {
        return 'evening';
    }
    if (dayProgress >= CONFIG.phaseNoonAt) {
        return 'noon';
    }
    return 'morning';
}

export class DayClock {
    /** Clamped to CONFIG.dayLengthSeconds, so dayProgress never exceeds 1 and the end fires once. */
    private elapsedSeconds: number;

    /** Compared on each update(), so onPhaseChange fires only on a transition. */
    private currentPhase: DayPhase;

    /** Once true, update() returns immediately: the clock freezes at 22:00. */
    private hasEndedFlag: boolean;

    /** Startup wiring, not per-run state: reset() leaves them alone. */
    private readonly phaseChangeListeners: DayPhaseChangeListener[] = [];
    private readonly dayEndListeners: DayEndListener[] = [];

    constructor() {
        this.elapsedSeconds = 0;
        this.currentPhase = computeDayPhase(0);
        this.hasEndedFlag = false;
        ensurePauseOnHiddenTab();
    }

    /** Back to 06:00, morning, not ended. The visibility listener is global and untouched. */
    reset(): void {
        this.elapsedSeconds = 0;
        this.currentPhase = computeDayPhase(0);
        this.hasEndedFlag = false;
    }

    onPhaseChange(listener: DayPhaseChangeListener): void {
        this.phaseChangeListeners.push(listener);
    }

    onDayEnd(listener: DayEndListener): void {
        this.dayEndListeners.push(listener);
    }

    /** Accumulates seconds, never counts calls: the engine may run update() zero or several times per rendered frame. */
    update(deltaSeconds: number): void {
        if (this.hasEndedFlag) {
            return;
        }
        if (isDocumentHiddenNow) {
            return;
        }

        const clampedDeltaSeconds = Math.min(deltaSeconds, DAY_CLOCK.maxDeltaSecondsPerUpdate);
        this.elapsedSeconds = Math.min(this.elapsedSeconds + clampedDeltaSeconds, CONFIG.dayLengthSeconds);

        const nextPhase = computeDayPhase(this.dayProgress);
        if (nextPhase !== this.currentPhase) {
            this.currentPhase = nextPhase;
            this.notifyPhaseChange();
        }

        if (this.elapsedSeconds >= CONFIG.dayLengthSeconds) {
            this.hasEndedFlag = true;
            this.notifyDayEnd();
        }
    }

    /**
     * 0..1 through the day. The Math.max(1, ...) guards a dayLengthSeconds of 0: 0/0 is NaN, which
     * would reach Watch.ts as "NaN:NaN" and make drawDigitString() throw, freezing the loop.
     */
    get dayProgress(): number {
        return this.elapsedSeconds / Math.max(1, CONFIG.dayLengthSeconds);
    }

    /** Minutes since midnight, a float; Watch.ts floors it. */
    get gameTimeMinutes(): number {
        return CONFIG.dayStartMinutes + this.dayProgress * (CONFIG.dayEndMinutes - CONFIG.dayStartMinutes);
    }

    get phase(): DayPhase {
        return this.currentPhase;
    }

    /** True from the frame the day ended onward. game.ts checks it right after update(). */
    get hasEnded(): boolean {
        return this.hasEndedFlag;
    }

    private notifyPhaseChange(): void {
        for (let i = 0; i < this.phaseChangeListeners.length; i += 1) {
            const listener = this.phaseChangeListeners[i] as DayPhaseChangeListener;
            listener(this.currentPhase, this.dayProgress);
        }
    }

    private notifyDayEnd(): void {
        for (let i = 0; i < this.dayEndListeners.length; i += 1) {
            const listener = this.dayEndListeners[i] as DayEndListener;
            listener();
        }
    }
}
