// Sound: the detector's tick and the pickup chime, both synthesized from
// scratch with AudioClip.synth (see docs/audio.md) - no audio files. This
// file owns HOW the three clips sound (waveform, pitch, envelope) and WHEN a
// beep boundary is crossed (the accumulator in update()); it does NOT own
// the distance -> interval mapping itself, which lives in Detector.ts's
// DETECTOR block per PLAN.md section 5 - see computeBeepIntervalMs() below,
// which only reads those numbers.
//
// TASK-016: this file no longer plays the tick itself. update() below still
// decides exactly when a beep boundary is crossed (the accumulator) and
// records that in didBeepThisFrame, but the actual BT.soundPlay() call moved
// out to playTick() (see below) - called by src/game/Signals.ts, and gated
// there by CONFIG.beepAudio, so muting the audio channel can never also
// silence the accumulator every other feedback channel (border pulse,
// detector blink, haptics) still needs to react to.

import { AudioClip, BT } from 'blit386';
import { CONFIG } from '../config';
import { DETECTOR } from '../game/Detector';

// Everything only this file cares about: how the two clips sound, and how
// loud they play. Tweak freely.
const SFX = {
    // --- Detector tick ----------------------------------------------------
    // A short, bright, percussive click. Square wave for a harder edge than
    // a sine (reads as electronic/mechanical, fitting a metal detector), a
    // high-ish pitch so it cuts through on a phone's tiny speaker, and short
    // enough that even the fastest beep interval (DETECTOR.beepIntervalFastMs,
    // 90ms) never has to cut it off early.
    tickWaveform: 'square',
    tickFrequencyHz: 1500,
    tickDurationSeconds: 0.05,
    tickSeed: 11, // arbitrary; fixed so the tick sounds identical every run

    // --- Pickup / collect ---------------------------------------------------
    // The opposite of the tick on every axis that matters for telling them
    // apart at a glance (ear?) - a softer waveform, a rising pitch sweep
    // instead of a flat pitch, and noticeably longer - so "I found
    // something" can never be mistaken for just another tick, even played
    // back to back with one.
    collectWaveform: 'triangle',
    collectFrequencyHz: 520,
    collectFrequencyToHz: 1100, // rising sweep reads as a small reward, see docs/audio.md
    collectDurationSeconds: 0.22,
    collectSeed: 23,

    // --- Watch alarm (end of day, TASK-012/013) -----------------------------
    // A held, warbling square-wave tone - reads as a classic digital-watch
    // alarm rather than either of the other two clips. Distinct from the
    // tick on every axis that matters (much longer, a full sustain instead
    // of an instant decay, and a wobbling vibrato instead of a flat pitch)
    // and distinct from the collect chime too (square, not triangle; a
    // steady held pitch, not a rising sweep; a lower, more urgent frequency).
    // Lives here rather than in a clip of its own inside src/hud/Watch.ts:
    // this file already owns "how every synthesized sound in the game
    // sounds" and both audio buses that play them, so a third clip is one
    // more entry in this same table, not a second copy of AudioClip.synth's
    // setup boilerplate - src/game.ts wires DayClock's onDayEnd() event to
    // playWatchAlarm() below the exact same way it already wires
    // Treasures.onCollect() to playCollectSound().
    watchAlarmWaveform: 'square',
    watchAlarmFrequencyHz: 900,
    watchAlarmDurationSeconds: 0.5,
    watchAlarmSeed: 37,

    // Playback volume passed to BT.soundPlay's own `volume` option. Constant
    // every time this file plays any clip - never adjusted for distance (see
    // PLAN.md section 4.4: "no ducking against ambience, because that would
    // muddy the one signal the player relies on"). The two audio buses below
    // (CONFIG.masterVolume / CONFIG.sfxVolume) are the only volume knobs this
    // game turns.
    tickPlaybackVolume: 1,
    collectPlaybackVolume: 1,
    watchAlarmPlaybackVolume: 1,
} as const;

// Maps a ground-plane distance (world units, same scale as worldX/worldY -
// see Beach.ts's coordinate contract) from the collector to the nearest
// buried item onto a beep interval in milliseconds, or `null` for "no beep
// at all". Exported and pure - no engine calls, no state - so it can be
// driven directly from a script for verification (see this task's
// completion checklist in TODO.md) and so a future difficulty tweak only
// ever has to change DETECTOR's numbers in Detector.ts, never the shape of
// this function.
//
// The mapping (PLAN.md section 4.4):
//   - beyond DETECTOR.silenceThresholdPx: null (silence).
//   - from DETECTOR.detectRadiusPx out to silenceThresholdPx (a small "it is
//     still out there, but only just" grace band): DETECTOR.beepIntervalSlowMs,
//     the slowest beep - clamped, not extrapolated further, so the game
//     never goes from "still audibly beeping" to "total silence" in one
//     abrupt step right at the detection ring's edge.
//   - at distance 0 (right on top of the item): DETECTOR.beepIntervalFastMs,
//     the fastest beep.
//   - between 0 and detectRadiusPx: DETECTOR.beepCurvePower shapes the ramp -
//     1 is a straight linear interpolation; 2 (today's default) squashes
//     most of the speed-up into the last few pixels near the item, which
//     reads as urgency (see DETECTOR.beepCurvePower's own comment in
//     Detector.ts).
export function computeBeepIntervalMs(distancePx: number): number | null {
    if (distancePx > DETECTOR.silenceThresholdPx) {
        return null;
    }
    const clampedDistancePx = Math.min(distancePx, DETECTOR.detectRadiusPx);
    const t = clampedDistancePx / DETECTOR.detectRadiusPx; // 0 = on target, 1 = at the ring's edge
    const curved = t ** DETECTOR.beepCurvePower;
    return DETECTOR.beepIntervalFastMs + curved * (DETECTOR.beepIntervalSlowMs - DETECTOR.beepIntervalFastMs);
}

// The detector tick and the pickup chime, plus the variable-interval beep
// timer that decides when the tick plays. Construct with the static
// create() factory below, never with `new Sfx(...)` directly - building the
// two clips is asynchronous (AudioClip.synth returns a Promise), and a
// constructor cannot be async.
export class Sfx {
    private readonly tickClip: AudioClip;
    private readonly collectClip: AudioClip;
    private readonly watchAlarmClip: AudioClip;

    // Time accumulated toward the next beep, in seconds - a hand-rolled
    // timer over BT.deltaSeconds rather than a fixed-tick Timer, because the
    // interval itself changes every frame (see update() below). Reset to 0
    // - never left to carry over - both when a beep fires and whenever the
    // distance moves outside beeping range; see update()'s comments for why
    // both resets matter.
    private accumulatorSeconds: number;

    // Set at the top of every update() call and left in place until the
    // next one. TASK-016's Signals reads this once per frame (after calling
    // update()) to drive the border pulse and detector blink off the exact
    // same beep boundary the tick sound just played on, without needing to
    // reach into this file's accumulator itself.
    private _didBeepThisFrame: boolean;

    // Private - see the class comment above for why construction goes
    // through create() instead.
    private constructor(tickClip: AudioClip, collectClip: AudioClip, watchAlarmClip: AudioClip) {
        this.tickClip = tickClip;
        this.collectClip = collectClip;
        this.watchAlarmClip = watchAlarmClip;
        this.accumulatorSeconds = 0;
        this._didBeepThisFrame = false;
    }

    // Synthesizes both clips and sets the two audio buses this file owns.
    // MUST be awaited from src/game.ts's init(), never called from
    // update()/render() - AudioClip.synth() does real work and would hitch a
    // frame if it ran mid-game (see docs/audio.md, "Making your own sound
    // from scratch").
    //
    // Both clips are built even though BT.soundPlay before the player's
    // first interaction silently drops the sound (see docs/audio.md, "Why
    // the game starts silent") - synthesis and playback are unrelated steps,
    // and building the clips here means the very first beep after the
    // player unlocks audio has zero delay.
    static async create(): Promise<Sfx> {
        const [tickClip, collectClip, watchAlarmClip] = await Promise.all([
            AudioClip.synth({
                waveform: SFX.tickWaveform,
                frequency: SFX.tickFrequencyHz,
                duration: SFX.tickDurationSeconds,
                seed: SFX.tickSeed,
                // Percussive: essentially no attack, a fast decay, nothing
                // held (sustain 0), negligible release - reads as a click,
                // not a held tone.
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
            }),
            AudioClip.synth({
                waveform: SFX.collectWaveform,
                frequency: SFX.collectFrequencyHz,
                duration: SFX.collectDurationSeconds,
                seed: SFX.collectSeed,
                pitchSweep: { toFrequency: SFX.collectFrequencyToHz },
                // Softer attack and a held sustain, unlike the tick's
                // near-instant click - a small chime, not another blip.
                envelope: { attack: 0.01, decay: 0.05, sustain: 0.4, release: 0.12 },
            }),
            AudioClip.synth({
                waveform: SFX.watchAlarmWaveform,
                frequency: SFX.watchAlarmFrequencyHz,
                duration: SFX.watchAlarmDurationSeconds,
                seed: SFX.watchAlarmSeed,
                // A wobble on top of the steady pitch - the one thing
                // neither the tick nor the collect chime have at all - is
                // what makes this read as an "alarm" rather than a third,
                // slightly different beep.
                vibrato: { rate: 6, depth: 40 },
                // Long attack-through-sustain (0.8, almost the whole clip
                // held at full volume) instead of the tick's near-zero
                // sustain or the collect chime's brief 0.4 - this one rings.
                envelope: { attack: 0.02, decay: 0.05, sustain: 0.8, release: 0.15 },
            }),
        ]);

        // Bus volumes from CONFIG - set once here, not per frame. 'main' is
        // the master knob; 'sfx' is this file's own bus (the tick, the
        // pickup sound, and the watch alarm are the only sounds this game
        // plays through it - see PLAN.md section 4.10, "No music").
        BT.audioVolumeSet('main', CONFIG.masterVolume);
        BT.audioVolumeSet('sfx', CONFIG.sfxVolume);

        return new Sfx(tickClip, collectClip, watchAlarmClip);
    }

    // Puts the beep timer back to a fresh, silent start. TASK-014 calls this
    // (alongside every other system's reset()) on restart, so a leftover
    // accumulator from the previous run can never fire an instant beep on
    // frame one of the new one.
    reset(): void {
        this.accumulatorSeconds = 0;
        this._didBeepThisFrame = false;
    }

    // Advances the beep timer by one frame and records exactly when a beep
    // boundary is crossed (didBeepThisFrame below) - it no longer plays the
    // tick itself (see playTick() and this file's header comment).
    // `distancePx` is Treasures.nearestDistancePx - the ground-plane distance
    // from the collector point to the nearest buried item, already computed
    // by the caller this same frame. Called once a frame from src/game.ts's
    // update() - never from render().
    update(deltaSeconds: number, distancePx: number): void {
        this._didBeepThisFrame = false;

        const intervalMs = computeBeepIntervalMs(distancePx);
        if (intervalMs === null) {
            // Outside beeping range entirely - RESET rather than merely
            // "pause" the accumulator. Without this, swinging the rod past
            // silenceThresholdPx and back a couple of seconds later would
            // find the accumulator still holding however many seconds it
            // built up while silent, and fire an immediate beep - or
            // several in a row, once compared against the much shorter
            // interval near an item - the instant detection resumes. That
            // "salvo on re-entry" is exactly the degenerate case this
            // task's brief calls out; resetting to 0 means crossing back
            // into range always starts the rhythm clean, at most one
            // interval's wait away from the first beep.
            this.accumulatorSeconds = 0;
            return;
        }

        this.accumulatorSeconds += deltaSeconds;
        const intervalSeconds = intervalMs / 1000;
        if (this.accumulatorSeconds < intervalSeconds) {
            return;
        }

        // Fire exactly ONE beep, no matter how far accumulatorSeconds
        // overshot intervalSeconds by (a long dropped frame, the tab
        // regaining focus after a while, ...). Resetting to 0 - instead of
        // subtracting intervalSeconds, which could still leave enough left
        // over to fire again next frame, and again, and again - is what
        // guarantees a stall can never queue up a burst of catch-up beeps.
        // The cost is a small, inaudible loss of rhythm precision after a
        // stall; the alternative is an audible salvo, which is worse.
        this.accumulatorSeconds = 0;
        this._didBeepThisFrame = true;
    }

    // Plays the detector tick. Called from src/game/Signals.ts - the ONLY place this is ever called
    // from - exactly when CONFIG.beepAudio is true AND didBeepThisFrame was true this same frame (see
    // Signals.ts's update()). Kept separate from update() above precisely so turning the audio channel
    // off can never also stop update() from detecting the beep boundaries every other feedback channel
    // still depends on.
    playTick(): void {
        BT.soundPlay(this.tickClip, { volume: SFX.tickPlaybackVolume });
    }

    // Plays the pickup sound. Called from src/game.ts, wired to
    // Treasures.onCollect() - kept as a plain method rather than something
    // this file subscribes by itself, so Sfx never has to import or know
    // that Treasures exists.
    playCollectSound(): void {
        BT.soundPlay(this.collectClip, { volume: SFX.collectPlaybackVolume });
    }

    // Plays the end-of-day watch alarm. Called from src/game.ts, wired to
    // DayClock.onDayEnd() - same reasoning as playCollectSound() above: this
    // file never imports or knows DayClock exists, it only ever plays a
    // clip when told to.
    playWatchAlarm(): void {
        BT.soundPlay(this.watchAlarmClip, { volume: SFX.watchAlarmPlaybackVolume });
    }

    // Whether a beep fired during the most recent update() call. See the
    // field comment above - this is the "beep boundary" TASK-016's Signals
    // reads every frame to decide whether to call playTick() above (gated by
    // CONFIG.beepAudio) and to (re)start the border-pulse/detector-blink
    // decay timers, all off the exact same instant.
    get didBeepThisFrame(): boolean {
        return this._didBeepThisFrame;
    }
}
