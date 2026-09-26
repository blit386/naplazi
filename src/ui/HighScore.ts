/**
 * The best-ever collected count, in localStorage. Every access is guarded: storage that throws
 * (Safari private browsing, a full quota, a locked-down browser) degrades to no persistence, and a
 * stored value that is missing, non-numeric, negative or absurd is treated as no score yet.
 */

const STORAGE_KEY = 'naplazi:highScore';

/** Anything above this cannot be a real two-minute run and is treated as corrupt. */
const MAX_PLAUSIBLE_HIGH_SCORE = 1_000_000;

/** Number() already turns garbage into NaN or Infinity; Number.isInteger rejects both. */
function parseStoredHighScore(raw: string | null): number {
    if (raw === null) {
        return 0;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PLAUSIBLE_HIGH_SCORE) {
        return 0;
    }
    return parsed;
}

/** 0 when nothing is stored or storage throws on read. A missing localStorage global throws too, and is caught here. */
export function loadHighScore(): number {
    try {
        return parseStoredHighScore(localStorage.getItem(STORAGE_KEY));
    } catch {
        return 0;
    }
}

/**
 * Persists the higher of the stored score and `candidateCount` if storage cooperates, and returns it
 * either way. Called once per run, from the day-end listener in game.ts.
 */
export function saveHighScoreIfBetter(candidateCount: number): number {
    const previousBest = loadHighScore();
    const newBest = Math.max(previousBest, candidateCount);
    try {
        localStorage.setItem(STORAGE_KEY, String(newBest));
    } catch {
        // No persistence this session; the game keeps running.
    }
    return newBest;
}
