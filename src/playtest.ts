// Play-test hooks: what lets a test, or an AI agent driving a browser, read the game instead of guessing from pixels.
//
// Two things live here, both for `pnpm run play` and the `test-the-game` skill:
//   - `?seed=1234` in the page address picks the beach, so a bug or a test replays the same layout every run.
//   - In a dev build only, `window.__game.state()` returns a plain-data snapshot and `window.__game.frame()` the next
//     frame as a PNG data URL. A shipped game (`pnpm run build`) never has `window.__game`.

import { BT } from 'blit386';
import type { DayPhase } from './palette/palette';

// Plain numbers, strings and null only, so a browser tool can print it as JSON.
export interface PlaytestState {
    ticks: number;
    screen: string; // 'title' | 'play' | 'results'
    seed: number; // the seed of the beach on screen right now (a restart rolls a new one)
    collected: number;
    highScore: number;
    dayProgress: number; // 0 at the start of the day, 1 when the watch strikes the end
    gameTimeMinutes: number; // minutes since midnight, what the watch shows
    phase: DayPhase;
    dayEnded: boolean;
    player: { x: number; y: number }; // world coordinates
    detectorHead: { x: number; y: number }; // world coordinates
    nearestTreasurePx: number | null; // null when nothing is within the detector's search window
}

declare global {
    interface Window {
        __game?: {
            state(): PlaytestState;
            frame(): Promise<string>; // the next frame as a PNG data URL, sharp and unscaled by the browser
        };
    }
}

// Read `?seed=1234` from the page address. No seed, or one that is not a whole number, means "use CONFIG.seed".
export function readSeedParam(): number | null {
    const raw = new URLSearchParams(window.location.search).get('seed');

    if (raw === null) {
        return null;
    }

    const seed = Number(raw);

    if (!Number.isSafeInteger(seed)) {
        console.warn(`[naplazi] Ignoring ?seed=${raw}: it must be a whole number.`);

        return null;
    }

    return seed;
}

// Turn a PNG blob into a data URL string, which a browser tool can read back out of the page.
function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

// Put `window.__game` on the page. Safe to call again after a hot reload: it just replaces the old hooks.
export function installPlaytestHooks(state: () => PlaytestState): void {
    if (!BT.isDevMode) {
        return;
    }

    window.__game = {
        state,
        frame: async () => blobToDataURL(await BT.captureFrame()),
    };
}
