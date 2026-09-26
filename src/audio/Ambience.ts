/**
 * The looping background bed: one synthesized clip per lighting phase, cross-faded on phase change.
 *
 * - Not music: BT.musicPlay is a single-track song player. Every clip goes through BT.soundPlay with
 *   `loop: true`.
 * - Volume is per voice, never a bus: BT.soundPlay only has the 'sfx' bus, which Sfx.ts sets to
 *   CONFIG.sfxVolume for the tick. CONFIG.ambienceVolume is passed to each soundPlay call instead.
 * - Never reacts to a beep. Lowering the bed while a tick plays would be ducking, which would muddy
 *   the one signal the player relies on; volume only changes on start, phase change and stop.
 * - Synthesis is enough: AudioClip.synth caps duration at 60s and the longest loop here is 6s. Every
 *   envelope starts and ends at zero amplitude, so the looped raw samples wrap without a click.
 */

import { AudioClip, BT, type SoundRef } from 'blit386';
import { CONFIG } from '../config';
import type { DayPhase } from '../palette/palette';

/** Clip recipes and fade timings. */
const AMBIENCE = {
    /** First fade-in after the title tap. Shorter than a crossfade: nothing is fading out under it. */
    startFadeInMs: 800,
    /** Phase crossfade; the incoming fade-in and the outgoing fade-out both use it. Shorter than the 4s palette fade. */
    crossfadeMs: 2000,
    /** Stop on day end and on restart. Short on purpose: enough to avoid a click, not a lingering fade into results. */
    stopFadeOutMs: 200,

    /** Morning: a slow, low wash, half noise, one wave per 6s loop. */
    morningWaveform: 'sine',
    morningFrequencyHz: 85,
    morningNoiseMix: 0.5,
    morningDurationSeconds: 6,
    morningEnvelope: { attack: 2.0, decay: 0.8, sustain: 0.2, release: 2.8 },
    morningVibratoRateHz: 0.18,
    morningVibratoDepthHz: 6,
    morningSeed: 41, // fixed so the clip is identical every run

    /** Noon: a steady, bright triangle drone with a near-full sustain and a slow shimmer. */
    noonWaveform: 'triangle',
    noonFrequencyHz: 300,
    noonNoiseMix: 0.12,
    noonDurationSeconds: 4,
    noonEnvelope: { attack: 0.2, decay: 0.3, sustain: 0.9, release: 0.3 },
    noonVibratoRateHz: 0.4,
    noonVibratoDepthHz: 10,
    noonSeed: 42,

    /** Evening: a thin square buzz with fast, wide vibrato; reads as dusk insects. */
    eveningWaveform: 'square',
    eveningFrequencyHz: 620,
    eveningDutyCycle: 0.12,
    eveningNoiseMix: 0.18,
    eveningDurationSeconds: 3,
    eveningEnvelope: { attack: 0.15, decay: 0.2, sustain: 0.75, release: 0.3 },
    eveningVibratoRateHz: 7,
    eveningVibratoDepthHz: 26,
    eveningSeed: 43,

    /** Night: a very low sine with minimal texture. */
    nightWaveform: 'sine',
    nightFrequencyHz: 60,
    nightNoiseMix: 0.1,
    nightDurationSeconds: 6,
    nightEnvelope: { attack: 0.5, decay: 1.0, sustain: 0.3, release: 4.5 },
    nightVibratoRateHz: 0.1,
    nightVibratoDepthHz: 3,
    nightSeed: 44,
} as const;

/** One clip per phase, built once in create(). */
type PhaseClips = Record<DayPhase, AudioClip>;

/** Construct through create(): synthesis is async. */
export class Ambience {
    private readonly clipsByPhase: PhaseClips;

    /**
     * The playing (or fading in) voice, or null. Invariant: every SoundRef from BT.soundPlay gets
     * exactly one BT.soundStop, from switchTo() when superseded or from stop(). An outgoing voice is
     * fired and forgotten; the engine finishes its fade and frees the slot.
     */
    private activeRef: SoundRef | null;

    /** Guards switchTo() against a redundant crossfade into the phase already playing. */
    private activePhase: DayPhase | null;

    private constructor(clipsByPhase: PhaseClips) {
        this.clipsByPhase = clipsByPhase;
        this.activeRef = null;
        this.activePhase = null;
    }

    /** Synthesizes all four clips. Await in init(), never mid-game. Starts no playback. */
    static async create(): Promise<Ambience> {
        const [morning, noon, evening, night] = await Promise.all([
            AudioClip.synth({
                waveform: AMBIENCE.morningWaveform,
                frequency: AMBIENCE.morningFrequencyHz,
                duration: AMBIENCE.morningDurationSeconds,
                seed: AMBIENCE.morningSeed,
                noiseMix: AMBIENCE.morningNoiseMix,
                envelope: AMBIENCE.morningEnvelope,
                vibrato: { rate: AMBIENCE.morningVibratoRateHz, depth: AMBIENCE.morningVibratoDepthHz },
            }),
            AudioClip.synth({
                waveform: AMBIENCE.noonWaveform,
                frequency: AMBIENCE.noonFrequencyHz,
                duration: AMBIENCE.noonDurationSeconds,
                seed: AMBIENCE.noonSeed,
                noiseMix: AMBIENCE.noonNoiseMix,
                envelope: AMBIENCE.noonEnvelope,
                vibrato: { rate: AMBIENCE.noonVibratoRateHz, depth: AMBIENCE.noonVibratoDepthHz },
            }),
            AudioClip.synth({
                waveform: AMBIENCE.eveningWaveform,
                frequency: AMBIENCE.eveningFrequencyHz,
                duration: AMBIENCE.eveningDurationSeconds,
                seed: AMBIENCE.eveningSeed,
                dutyCycle: AMBIENCE.eveningDutyCycle,
                noiseMix: AMBIENCE.eveningNoiseMix,
                envelope: AMBIENCE.eveningEnvelope,
                vibrato: { rate: AMBIENCE.eveningVibratoRateHz, depth: AMBIENCE.eveningVibratoDepthHz },
            }),
            AudioClip.synth({
                waveform: AMBIENCE.nightWaveform,
                frequency: AMBIENCE.nightFrequencyHz,
                duration: AMBIENCE.nightDurationSeconds,
                seed: AMBIENCE.nightSeed,
                noiseMix: AMBIENCE.nightNoiseMix,
                envelope: AMBIENCE.nightEnvelope,
                vibrato: { rate: AMBIENCE.nightVibratoRateHz, depth: AMBIENCE.nightVibratoDepthHz },
            }),
        ]);

        return new Ambience({ morning, noon, evening, night });
    }

    /** First play of a run. game.ts calls it once BT.isAudioUnlocked is true. */
    start(phase: DayPhase): void {
        this.switchTo(phase, AMBIENCE.startFadeInMs);
    }

    /** Wired to DayClock.onPhaseChange() alongside the palette fade. */
    crossfadeTo(phase: DayPhase): void {
        this.switchTo(phase, AMBIENCE.crossfadeMs);
    }

    /** Safe with nothing playing, and on a ref whose soundPlay was dropped (soundStop is a no-op then). */
    stop(): void {
        if (this.activeRef !== null) {
            BT.soundStop(this.activeRef, { fadeOutMs: AMBIENCE.stopFadeOutMs });
        }
        this.activeRef = null;
        this.activePhase = null;
    }

    /** Same as stop(); named so restart() reads as one reset() per system. */
    reset(): void {
        this.stop();
    }

    /** Starts the new voice before stopping the old one, so there is never a scheduling step with nothing playing. */
    private switchTo(phase: DayPhase, fadeMs: number): void {
        if (phase === this.activePhase) {
            return;
        }

        const previousRef = this.activeRef;
        const clip = this.clipsByPhase[phase];

        this.activeRef = BT.soundPlay(clip, { loop: true, volume: CONFIG.ambienceVolume, fadeInMs: fadeMs });
        this.activePhase = phase;

        if (previousRef !== null) {
            BT.soundStop(previousRef, { fadeOutMs: fadeMs });
        }
    }
}
