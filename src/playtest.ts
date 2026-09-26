/**
 * Dev-only hooks for `pnpm run play` and the test-the-game skill: `window.__game.state()` returns a
 * plain-data snapshot, `window.__game.frame()` the next frame as a PNG data URL. Absent from a
 * production build. `?seed=N` is handled by the engine, before init().
 */

import { BT } from 'blit386';
import type { DayPhase } from './palette/palette';

/** Plain numbers, strings and null only, so a browser tool can print it as JSON. */
export interface PlaytestState {
    ticks: number;
    /** 'title' | 'play' | 'results'. */
    screen: string;
    /** Seed of the beach on screen right now; a restart rolls a new one only when CONFIG.reseedOnRestart is true. */
    seed: number;
    collected: number;
    highScore: number;
    /** 0 at the start of the day, 1 once the watch strikes the end. */
    dayProgress: number;
    /** Minutes since midnight, what the watch shows. */
    gameTimeMinutes: number;
    phase: DayPhase;
    dayEnded: boolean;
    /** World coordinates (see Beach.ts). */
    player: { x: number; y: number };
    detectorHead: { x: number; y: number };
    /** null when nothing is within the detector's search window. */
    nearestTreasurePx: number | null;
}

declare global {
    interface Window {
        __game?: {
            state(): PlaytestState;
            /** The next frame as a PNG data URL, unscaled by the browser. */
            frame(): Promise<string>;
        };
    }
}

function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

/** Installs `window.__game` in dev builds. Safe to call again after a hot reload. */
export function installPlaytestHooks(state: () => PlaytestState): void {
    if (!BT.isDevMode) {
        return;
    }

    window.__game = {
        state,
        frame: async () => blobToDataURL(await BT.captureFrame()),
    };
}
