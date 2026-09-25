// A small, deterministic pseudo-random number generator (PRNG).
//
// Why not the built-in Math.random()? Math.random() cannot be seeded or
// replayed - every run of the game would scatter items across the beach
// differently, with no way to reproduce a specific layout. That makes bugs
// ("why is there nothing near the horizon on THIS run?") nearly impossible to
// chase down, and it breaks the results screen's promise of showing a seed you
// could play again. This class trades that unpredictability for
// reproducibility: the same seed always produces the exact same sequence of
// numbers, every time, on every machine.
//
// ONE INSTANCE PER GAME. Every system that needs randomness (buried item
// placement, decoration scatter, ...) must receive this same Rng object
// through its constructor rather than creating its own with `new Rng(...)`.
// If two systems each seed their own generator, the game's seed no longer
// describes the whole run - see TASK-004 in TODO.md. src/game.ts owns the one
// instance (`this.rng`) and hands it out.
//
// The algorithm is "mulberry32", a tiny public-domain generator by Tommy
// Ettinger. It is NOT cryptographically secure - never use it for anything
// security-related (passwords, tokens, ...) - but it is fast, needs only one
// 32-bit number of state, and its output passes common statistical randomness
// tests. More than enough for scattering shells on a beach.
export class Rng {
    // The seed this generator was most recently (re)started with. Deliberately
    // kept separate from `state` below: `state` changes on every call to
    // next(), but `_seed` only changes when reset() is given a new value. The
    // results screen reads this via the `seed` getter to show (and let the
    // player replay) the exact run they just had.
    private _seed: number;

    // The generator's internal working number. This is what next() actually
    // reads and mutates each call. It starts out equal to `_seed` and then
    // wanders away from it - `state` is not itself meant to be shown to the
    // player, only `_seed` is.
    private state: number;

    constructor(seed: number) {
        this._seed = seed;
        this.state = seed;
    }

    // The seed currently driving this generator. Read-only from the outside -
    // the only supported way to change it is reset(newSeed). Shown on the
    // results screen so a run can be identified, compared, and replayed.
    get seed(): number {
        return this._seed;
    }

    // Restarts the number sequence from the beginning.
    //
    // Call reset() with no argument to replay the exact same sequence again -
    // same seed, same numbers, same beach. That is what a "restart" does when
    // CONFIG.reseedOnRestart is false.
    //
    // Call reset(newSeed) to start a brand-new, still-deterministic sequence.
    // That is what a "restart" does when CONFIG.reseedOnRestart is true.
    reset(seed: number = this._seed): void {
        this._seed = seed;
        this.state = seed;
    }

    // Returns the next random number in the range [0, 1) - 0 is possible, 1
    // never is. This is the same range Math.random() promises, so anywhere in
    // this codebase that used to read `Math.random()` can call `rng.next()`
    // instead. Every call advances the internal state, so two calls in a row
    // give two different numbers.
    next(): number {
        // The mulberry32 step, transcribed verbatim from the reference
        // implementation (only the variable names changed to fit a class).
        // The magic constant and the specific shift/multiply/xor operations
        // below are what give the output its statistical properties - do not
        // "clean up" the bitwise operators, they are the whole algorithm.
        this.state = (this.state + 0x6d2b79f5) | 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }

    // Returns a random whole number in the given range.
    //
    // DECISION - this method's range is INCLUSIVE of `min` and EXCLUSIVE of
    // `max`, exactly like Array.prototype.slice or a for-loop's `i < length`.
    // nextInt(0, 3) can only ever return 0, 1, or 2 - never 3. That makes two
    // common patterns simple and safe:
    //   - "how many outcomes are possible" is just `max - min`;
    //   - `nextInt(0, array.length)` is always a valid index into `array`.
    // Every future module that calls nextInt relies on this convention - keep
    // it consistent rather than reinterpreting it per call site.
    nextInt(min: number, max: number): number {
        return Math.floor(this.next() * (max - min)) + min;
    }

    // Returns true with probability `p` (0 = never, 1 = always, the default
    // 0.5 = a fair coin flip). Handy for yes/no decisions like "does a piece
    // of litter spawn at this spot".
    nextBool(p: number = 0.5): boolean {
        return this.next() < p;
    }
}
