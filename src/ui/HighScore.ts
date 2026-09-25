// Reads and writes the best-ever collected-item count to localStorage. Every access is wrapped so a
// disabled/unavailable/full localStorage (Safari private browsing, a locked-down browser, a full
// quota - see TODO.md TASK-014's own blocking-risk note: "localStorage can throw an exception") degrades
// to "no persistence this session" instead of crashing the game, and so a stored value that is
// missing, non-numeric, negative, or absurdly large (someone hand-edited it in devtools, a stray
// browser extension sharing the origin, or a future format change writing something this version does
// not understand) is treated as "no high score yet" rather than trusted as-is.

const STORAGE_KEY = 'naplazi:highScore';

// Anything above this is treated as corrupted rather than a genuine score - there is no way a real run
// could ever collect anywhere near this many items (CONFIG.dayLengthSeconds is two minutes and
// Treasures.ts only ever keeps 7 items in play at once), so a value this large only ever means "not a
// real score from this game" (a manual devtools edit, `"1e999"`, ...).
const MAX_PLAUSIBLE_HIGH_SCORE = 1_000_000;

// Turns whatever raw string localStorage.getItem() handed back into a trustworthy whole number, or 0
// if it cannot. `Number(raw)` alone already rejects most garbage on its own - `Number('abc')`,
// `Number('{}')`, and `Number('')` are all NaN, and `Number('1e999')` is `Infinity` - so the single
// `Number.isInteger` check below (false for both NaN and Infinity) is enough to catch every case
// TODO.md calls out - missing, non-numeric, negative, NaN, or an absurdly large number - without
// needing one bespoke check per failure mode.
function parseStoredHighScore(raw: string | null): number {
    if (raw === null) {
        return 0; // nothing stored yet - a brand new browser/profile, or a previous save that failed
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > MAX_PLAUSIBLE_HIGH_SCORE) {
        return 0; // corrupted, negative, NaN, +/-Infinity, or too large to be a real score - start fresh
    }
    return parsed;
}

// Reads the stored high score. Called once from src/game.ts's init() (so there is something sane to
// show even before this browser has ever finished a run) and again every time a run ends, right
// before comparing it against the count that run just collected - see saveHighScoreIfBetter() below.
export function loadHighScore(): number {
    try {
        return parseStoredHighScore(localStorage.getItem(STORAGE_KEY));
    } catch {
        // localStorage can throw just from being READ - Safari private browsing is the classic real
        // case. Never let that exception escape into the game loop; treat it exactly like "nothing
        // stored yet". (If `localStorage` were not even declared as a global at all, referencing the
        // bare identifier above would itself throw a ReferenceError - also caught right here, so no
        // separate `typeof localStorage` guard is needed.)
        return 0;
    }
}

// Compares `candidateCount` (a just-finished run's collected-item count) against whatever is
// currently stored, persists the higher of the two if storage cooperates, and returns whichever value
// should be shown on the results screen - the caller never has to branch on whether the write actually
// succeeded. Called exactly once per run, from the DayClock.onDayEnd() listener wired in
// src/game.ts's init() - never from update()/render() directly.
export function saveHighScoreIfBetter(candidateCount: number): number {
    const previousBest = loadHighScore();
    const newBest = Math.max(previousBest, candidateCount);
    try {
        localStorage.setItem(STORAGE_KEY, String(newBest));
    } catch {
        // Quota exceeded, storage disabled, or some other write failure - the game keeps running for
        // this session, it just will not remember newBest the next time the page loads.
    }
    return newBest;
}
