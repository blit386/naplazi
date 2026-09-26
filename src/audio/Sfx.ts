/**
 * The detector tick, the pickup chime and the watch alarm, all synthesized. Owns how the clips sound
 * and when a beep boundary is crossed (the accumulator in update()). The distance -> interval numbers
 * live in DETECTOR. The tick is played by Signals.ts through playTick(), not from update(), so muting
 * audio cannot silence the beep boundary the other feedback channels read.
 */

import { AudioClip, BT } from 'blit386';
import { CONFIG } from '../config';
import { DETECTOR } from '../game/Detector';

const SFX = {
    /** Tick: a short, bright square click, high enough to cut through a phone speaker and shorter than the fastest interval (90ms). */
    tickWaveform: 'square',
    tickFrequencyHz: 1500,
    tickDurationSeconds: 0.05,
    tickSeed: 11, // fixed so the clip is identical every run

    /** Collect: softer waveform, rising sweep, longer, so it can never be mistaken for a tick. */
    collectWaveform: 'triangle',
    collectFrequencyHz: 520,
    collectFrequencyToHz: 1100,
    collectDurationSeconds: 0.22,
    collectSeed: 23,

    /** Watch alarm: a held, warbling square tone, distinct from both of the above. */
    watchAlarmWaveform: 'square',
    watchAlarmFrequencyHz: 900,
    watchAlarmDurationSeconds: 0.5,
    watchAlarmSeed: 37,

    /** Per-voice volume, constant: never adjusted for distance (no ducking). The buses are the only knobs. */
    tickPlaybackVolume: 1,
    collectPlaybackVolume: 1,
    watchAlarmPlaybackVolume: 1,
} as const;

/**
 * Distance from the collector to the nearest item -> beep interval in ms, or null for silence.
 * Beyond silenceThresholdPx: null. From detectRadiusPx out to there: the slow interval, clamped, so
 * the beep never jumps from audible to silent at the ring's edge. Inside the ring: fast at 0, slow at
 * the edge, shaped by beepCurvePower. Pure, so it can be driven from a script.
 */
export function computeBeepIntervalMs(distancePx: number): number | null {
    if (distancePx > DETECTOR.silenceThresholdPx) {
        return null;
    }
    const clampedDistancePx = Math.min(distancePx, DETECTOR.detectRadiusPx);
    const t = clampedDistancePx / DETECTOR.detectRadiusPx;
    const curved = t ** DETECTOR.beepCurvePower;
    return DETECTOR.beepIntervalFastMs + curved * (DETECTOR.beepIntervalSlowMs - DETECTOR.beepIntervalFastMs);
}

/** Construct through create(): synthesis is async. */
export class Sfx {
    private readonly tickClip: AudioClip;
    private readonly collectClip: AudioClip;
    private readonly watchAlarmClip: AudioClip;

    /** Seconds toward the next beep. Hand-rolled because the interval changes every frame. */
    private accumulatorSeconds: number;

    /** Set by update(); Signals.ts reads it after update() in the same frame. */
    private _didBeepThisFrame: boolean;

    private constructor(tickClip: AudioClip, collectClip: AudioClip, watchAlarmClip: AudioClip) {
        this.tickClip = tickClip;
        this.collectClip = collectClip;
        this.watchAlarmClip = watchAlarmClip;
        this.accumulatorSeconds = 0;
        this._didBeepThisFrame = false;
    }

    /**
     * Synthesizes the clips and sets the 'main' and 'sfx' bus volumes. Await in init(), never
     * mid-game. Clips are built even though playback stays locked until the first tap, so the first
     * beep after the unlock has no delay.
     */
    static async create(): Promise<Sfx> {
        const [tickClip, collectClip, watchAlarmClip] = await Promise.all([
            AudioClip.synth({
                waveform: SFX.tickWaveform,
                frequency: SFX.tickFrequencyHz,
                duration: SFX.tickDurationSeconds,
                seed: SFX.tickSeed,
                // Percussive: no attack, fast decay, no sustain.
                envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
            }),
            AudioClip.synth({
                waveform: SFX.collectWaveform,
                frequency: SFX.collectFrequencyHz,
                duration: SFX.collectDurationSeconds,
                seed: SFX.collectSeed,
                pitchSweep: { toFrequency: SFX.collectFrequencyToHz },
                // A small chime, not another blip.
                envelope: { attack: 0.01, decay: 0.05, sustain: 0.4, release: 0.12 },
            }),
            AudioClip.synth({
                waveform: SFX.watchAlarmWaveform,
                frequency: SFX.watchAlarmFrequencyHz,
                duration: SFX.watchAlarmDurationSeconds,
                seed: SFX.watchAlarmSeed,
                // The vibrato is what makes it read as an alarm; the long sustain makes it ring.
                vibrato: { rate: 6, depth: 40 },
                envelope: { attack: 0.02, decay: 0.05, sustain: 0.8, release: 0.15 },
            }),
        ]);

        BT.audioVolumeSet('main', CONFIG.masterVolume);
        BT.audioVolumeSet('sfx', CONFIG.sfxVolume);

        return new Sfx(tickClip, collectClip, watchAlarmClip);
    }

    /** Fresh silent start, so no leftover accumulator fires a beep on frame one. */
    reset(): void {
        this.accumulatorSeconds = 0;
        this._didBeepThisFrame = false;
    }

    /** Advances the timer and records a beep boundary. `distancePx` is Treasures.nearestDistancePx from this frame. */
    update(deltaSeconds: number, distancePx: number): void {
        this._didBeepThisFrame = false;

        const intervalMs = computeBeepIntervalMs(distancePx);
        if (intervalMs === null) {
            // Out of range: reset, do not pause. A paused accumulator would fire a salvo the instant
            // detection resumed.
            this.accumulatorSeconds = 0;
            return;
        }

        this.accumulatorSeconds += deltaSeconds;
        const intervalSeconds = intervalMs / 1000;
        if (this.accumulatorSeconds < intervalSeconds) {
            return;
        }

        // Reset to 0 rather than subtracting the interval, so a long stall fires one beep, not a burst.
        this.accumulatorSeconds = 0;
        this._didBeepThisFrame = true;
    }

    /** Called only by Signals.ts, gated by CONFIG.beepAudio. */
    playTick(): void {
        BT.soundPlay(this.tickClip, { volume: SFX.tickPlaybackVolume });
    }

    /** Wired to Treasures.onCollect() in game.ts. */
    playCollectSound(): void {
        BT.soundPlay(this.collectClip, { volume: SFX.collectPlaybackVolume });
    }

    /** Wired to DayClock.onDayEnd() in game.ts. */
    playWatchAlarm(): void {
        BT.soundPlay(this.watchAlarmClip, { volume: SFX.watchAlarmPlaybackVolume });
    }

    /** Whether the last update() crossed a beep boundary. */
    get didBeepThisFrame(): boolean {
        return this._didBeepThisFrame;
    }
}
