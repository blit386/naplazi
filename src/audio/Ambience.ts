// Ambience: a quiet background bed that changes with the day's lighting phase (morning / noon /
// evening) and cross-fades between them instead of cutting abruptly - see PLAN.md section 4.10
// ("Ambience ... Cross-fade on phase change") and TODO.md TASK-019, a stretch goal.
//
// THREE DECISIONS ALREADY MADE BY THE ORCHESTRATOR, BAKED INTO THIS FILE RATHER THAN RE-LITIGATED:
//
// 1. This is NOT music. `BT.musicPlay`'s single-track player is for a song; PLAN.md section 4.10 rules
//    out music entirely ("No music. Two things only: SFX ... Ambience"). So every clip here goes
//    through `BT.soundPlay(clip, { loop: true, ... })` - the same call Sfx.ts uses for one-shots, just
//    with `loop: true` - and NEVER through `BT.musicPlay`.
//
// 2. `BT.soundPlay` always plays through the 'sfx' bus (see blit386.d.ts: "Plays a loaded audio clip
//    through the SFX voice pool") - there is no separate 'ambience' bus, only 'main' / 'music' / 'sfx'
//    (see AudioBus in blit386.d.ts). Sfx.ts already sets the 'sfx' bus to CONFIG.sfxVolume (1.0) so the
//    detector tick reads clearly; if this file also touched that bus, turning ambience down would turn
//    the tick down too. So CONFIG.ambienceVolume is applied PER VOICE instead - as the `volume` passed
//    to `BT.soundPlay` and to every `BT.soundVolumeSet` fade below - never as a bus level. This file
//    never calls `BT.audioVolumeSet` at all.
//
// 3. Nothing here ever reacts to a beep. TASK-011 requires the detector tick to play at a constant
//    volume with "no ducking against ambience" - lowering ambience WHILE a beep plays would be exactly
//    that ducking, just implemented from the other side. This class has no knowledge that beeps exist;
//    its volume only ever changes on a phase transition, a start, or a stop, and always by the fixed
//    amounts below, so the tick's fixed volume-over-ambience's-fixed-volume ratio never moves.
//
// WHY SYNTHESIS ALONE IS ENOUGH (no MP3 needed): `AudioClip.synth`'s `duration` is capped at 60 seconds
// (see node_modules/blit386/dist/blit386.js: `if (t.duration > 60) throw new Error(...)` - the concrete
// number the type-only blit386.d.ts:5187 comment on `SynthParams.duration` only names as
// `MAX_SYNTH_DURATION_SECONDS` without spelling out). The longest loop below is 6 seconds, so the cap
// was never actually a constraint here - a short, seamlessly-looping clip is simply the right shape for
// a background bed regardless of the ceiling. PLAN.md's own fallback ("short looping MP3 samples for
// anything synthesis cannot fake") is therefore not needed for these three phases.
//
// WHY EACH LOOP IS CLICK-FREE: `BT.soundPlay({ loop: true })` hands the synthesized PCM straight to a
// native `AudioBufferSourceNode` with `.loop = true` (see blit386.js) - the browser repeats the raw
// samples verbatim, with no re-triggering of the ADSR envelope in between. Every envelope below is
// built to both START and END at (or effectively at) zero amplitude - an attack from silence, a release
// back to silence exactly at the clip's last sample - so the wrap-around loop point never has a level
// discontinuity to click on.
//
// WHY EVERY REF GETS EXACTLY ONE STOP CALL: see the `activeRef` field comment below for the invariant
// that rules out both a lingering "zombie" voice and an audible leftover after stop()/reset().

import { AudioClip, BT, type SoundRef } from 'blit386';
import { CONFIG } from '../config';
import type { DayPhase } from '../palette/palette';

// Everything only this file cares about: how each phase's clip sounds, and how long the fades take.
// Tweak freely.
const AMBIENCE = {
    // --- Fade timing (milliseconds) ------------------------------------------------------------
    // How long the very first ambient voice takes to rise from silence up to CONFIG.ambienceVolume,
    // the instant the title-screen tap flips the game into 'play' (see start() below). Shorter than a
    // phase crossfade on purpose: there is no OLD voice fading out underneath this one the way there is
    // mid-run, so a long ramp here would only read as "the game started quiet", not as a deliberate
    // cross-fade between two things.
    startFadeInMs: 800,
    // How long a phase-to-phase cross-fade takes: the OUTGOING phase's voice fades out over this same
    // span while the INCOMING phase's voice fades in - see switchTo() below, which hands this one
    // number to both BT.soundPlay's `fadeInMs` and the outgoing BT.soundStop's `fadeOutMs`, so neither
    // side finishes before the other and the two voices genuinely overlap for the whole crossfade.
    // Shorter than TASK-015's 4-second palette fade (palette.ts's PHASE_TRANSITION.durationMs) - the
    // sound change does not need to visibly lag behind the color change that starts on the same frame.
    crossfadeMs: 2000,
    // How long stopping the ambient bed takes - used both the instant the day ends (Play -> Results)
    // and on restart. Deliberately SHORT, not a real fade: TODO.md's own completion checklist requires
    // the ambient to stop "not only after some delay" once the transition happens.
    // A couple hundred milliseconds is enough to avoid an audible click from an instant amplitude drop,
    // without reading as a lingering fade into the results screen.
    stopFadeOutMs: 200,

    // --- Morning: a slow, low wash - reads as gentle surf at dawn -------------------------------
    // The lowest-pitched and most noise-heavy of the three phases on purpose, so it can never be
    // confused with noon or evening even without looking at the screen.
    morningWaveform: 'sine',
    morningFrequencyHz: 85, // low rumble, not a musical pitch
    morningNoiseMix: 0.5, // half tone, half hiss - reads as water/wind, not a clean note
    morningDurationSeconds: 6, // the longest loop of the three - one slow "wave" per repeat
    // One wave per loop: a long rise, a brief high point, then an even longer recede back to silence.
    // Both ends land at (or effectively at) zero amplitude - see this file's header comment on why that
    // is what keeps the loop seam click-free.
    morningEnvelope: { attack: 2.0, decay: 0.8, sustain: 0.2, release: 2.8 },
    // A very slow, shallow pitch wobble - reads as the lazy rise and fall of calm water, not a
    // deliberate musical vibrato (compare eveningVibratoRateHz below, which is nearly 40x faster).
    morningVibratoRateHz: 0.18,
    morningVibratoDepthHz: 6,
    morningSeed: 41, // arbitrary; fixed so morning sounds identical every run

    // --- Noon: a steady, bright drone - the high sun at its stillest -----------------------------
    // Triangle sits deliberately between morning's soft sine and evening's buzzy square - brighter and
    // smoother than either, with none of morning's noise or evening's buzz.
    noonWaveform: 'triangle',
    noonFrequencyHz: 300, // noticeably higher than morning's 85 Hz - reads as open daylight air
    noonNoiseMix: 0.12, // just a hint of air texture, far less than morning's watery hiss
    noonDurationSeconds: 4,
    // Short attack/decay/release around a long, near-full sustain - the STEADIEST envelope of the
    // three: no big swell like morning's wave, no fast chorus like evening's insects, matching noon's
    // own stillness.
    noonEnvelope: { attack: 0.2, decay: 0.3, sustain: 0.9, release: 0.3 },
    // A gentle shimmer, slow enough to read as heat haze rather than a warble.
    noonVibratoRateHz: 0.4,
    noonVibratoDepthHz: 10,
    noonSeed: 42,

    // --- Evening: a warm, fast-buzzing chorus - dusk insects taking over from the birds ------------
    // Square with a narrow dutyCycle is the thinnest, most nasal-sounding waveform this engine can make
    // (see docs/audio.md, "dutyCycle thins out a square wave into that nasal NES buzz") - exactly the
    // insect-like texture neither morning's soft sine nor noon's clean triangle has.
    eveningWaveform: 'square',
    eveningFrequencyHz: 620, // the highest-pitched of the three - a buzzy register, not a low hum
    eveningDutyCycle: 0.12, // a thin, nasal pulse - only affects 'square' (see docs/audio.md)
    eveningNoiseMix: 0.18, // a little grit, reading as a chorus of many insects rather than one tone
    eveningDurationSeconds: 3, // the shortest loop of the three - a busier, quicker feel than a drone
    // Short envelope tail, mostly held at a near-full sustain, same shape family as noon's but shorter.
    eveningEnvelope: { attack: 0.15, decay: 0.2, sustain: 0.75, release: 0.3 },
    // Fast, wide pitch wobble - nearly 40x morning's vibrato rate - is what actually makes this read as
    // many insects trilling rather than a third, slightly different steady tone.
    eveningVibratoRateHz: 7,
    eveningVibratoDepthHz: 26,
    eveningSeed: 43,

    // --- Night: a low, dark drone - the world asleep -------------------------------
    // Dark, subtle drone to maintain the night atmosphere without competing with the beep.
    nightWaveform: 'sine',
    nightFrequencyHz: 60, // very low, reads as distant rumble
    nightNoiseMix: 0.1, // minimal texture
    nightDurationSeconds: 6,
    nightEnvelope: { attack: 0.5, decay: 1.0, sustain: 0.3, release: 4.5 },
    nightVibratoRateHz: 0.1,
    nightVibratoDepthHz: 3,
    nightSeed: 44,
} as const;

// The three phase ambience clips, keyed the same way DayClock.ts's own DayPhase type is - built once in
// create() below and never regenerated.
type PhaseClips = Record<DayPhase, AudioClip>;

// The ambient background bed. Construct with the static create() factory below, never with
// `new Ambience(...)` directly - synthesizing three clips is asynchronous (AudioClip.synth returns a
// Promise), and a constructor cannot be async (same reasoning as Sfx.ts's own create() factory).
export class Ambience {
    private readonly clipsByPhase: PhaseClips;

    // The currently playing (or still fading in) ambient voice, or `null` while nothing is meant to be
    // playing at all (before the title tap ever fires, or once stop()/reset() has run).
    //
    // INVARIANT this field exists to uphold: every SoundRef this class ever receives from BT.soundPlay
    // gets EXACTLY ONE BT.soundStop() call over its lifetime - either from switchTo() below (superseded
    // by a newer phase, mid-crossfade or not) or from stop()/reset() directly - never zero (a voice left
    // looping forever after the day ends or a restart) and never more than once needlessly tracked
    // (which would risk the SAME instant being read as "still playing" by two different code paths).
    // Two rapid phase transitions in a row are exactly the case this protects: the first transition's
    // outgoing BT.soundStop() call is fired and forgotten (the engine's own voice pool owns finishing
    // that fade-out and freeing the slot - see BT.soundStop's own doc comment), and this field then
    // holds only the SECOND transition's brand-new voice, which the fast-follow-up faithfully replaces
    // in turn if a third transition arrives before it settles either.
    private activeRef: SoundRef | null;

    // Which phase `activeRef`'s clip belongs to, or `null` alongside it. Read only as a defensive guard
    // in switchTo() below against re-triggering a crossfade into the phase that is already playing -
    // DayClock.onPhaseChange only ever fires on an actual transition (see that file's own currentPhase
    // field comment), so this should never trip in practice, but costs nothing to check and rules out a
    // wasted extra voice if anything ever calls this class differently in the future.
    private activePhase: DayPhase | null;

    // Private - see the class comment above for why construction goes through create() instead.
    private constructor(clipsByPhase: PhaseClips) {
        this.clipsByPhase = clipsByPhase;
        this.activeRef = null;
        this.activePhase = null;
    }

    // Synthesizes all four phase clips. MUST be awaited from src/game.ts's init(), never called from
    // update()/render() - AudioClip.synth() does real work and would hitch a frame if it ran mid-game
    // (see docs/audio.md, "Making your own sound from scratch", and Sfx.ts's own create() for the exact
    // same rule already applied to the tick/collect/alarm clips).
    //
    // Building the clips here does NOT start any playback - see start()/crossfadeTo() below, the only
    // two methods that ever call BT.soundPlay. That split matters for TODO.md's own blocking risk
    // ("the ambient must not try to play before the first touch"): synthesis is silent work that is safe
    // to do at any time (init() runs before the title screen is even drawn), while actually SOUNDING
    // anything is gated on the title-screen tap the exact same way Sfx.ts's own clips are - by simply
    // never being invoked until that tap happens (see src/game.ts's update()).
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

    // Starts the ambient bed for the first time this run, fading in from silence. Called from
    // src/game.ts's update() on the exact frame the title-screen tap flips screenState from 'title' to
    // 'play' - the same frame (and the same user gesture) that unlocks audio in the first place, so
    // this is never reached before that gesture happens - and again from restart(), after every other
    // system's reset() has already run, so the second run gets its own fresh ambient voice rather than
    // silence.
    start(phase: DayPhase): void {
        this.switchTo(phase, AMBIENCE.startFadeInMs);
    }

    // Cross-fades from whatever phase is currently playing to `phase`'s own clip. Called from
    // src/game.ts's `dayClock.onPhaseChange((phase) => ...)` listener - the very same listener that
    // already starts TASK-015's palette fade - so the color change and the sound change begin on the
    // exact same frame, even though the sound's own fade (AMBIENCE.crossfadeMs) runs faster than the
    // palette's.
    crossfadeTo(phase: DayPhase): void {
        this.switchTo(phase, AMBIENCE.crossfadeMs);
    }

    // Stops the ambient bed. Called from two places: src/game.ts's `dayClock.onDayEnd()` listener (the
    // exact instant Play hands off to Results - the same listener that plays the watch alarm), and from
    // reset() below. Safe to call when nothing is playing (activeRef already null) - see the early
    // return below - and safe to call on an inert ref too (BT.soundStop on a ref BT.soundPlay silently
    // dropped, e.g. because audio was somehow still locked, is a documented no-op - see blit386.d.ts).
    stop(): void {
        if (this.activeRef !== null) {
            BT.soundStop(this.activeRef, { fadeOutMs: AMBIENCE.stopFadeOutMs });
        }
        this.activeRef = null;
        this.activePhase = null;
    }

    // Puts this system back to "nothing playing, nothing pending". src/game.ts's restart() calls this
    // alongside every other system's reset() so a leftover voice from the previous run - whether it was
    // already stopped by onDayEnd(), or (defensively) still mid-crossfade for some other reason - can
    // never carry into the new run. Identical to stop() today; kept as its own named method purely so
    // restart()'s call list reads as "every system's reset()", the same uniform shape every other line
    // in that list already has (see src/game.ts).
    reset(): void {
        this.stop();
    }

    // Shared implementation behind start()/crossfadeTo() above: starts `phase`'s own clip fading in
    // over `fadeMs`, and - if some other phase was already active - fades that OLD voice out over the
    // very same `fadeMs`, so the two voices audibly overlap for the whole crossfade instead of one
    // finishing before the other begins.
    private switchTo(phase: DayPhase, fadeMs: number): void {
        if (phase === this.activePhase) {
            return; // already playing this phase - see activePhase's own field comment above
        }

        const previousRef = this.activeRef;
        const clip = this.clipsByPhase[phase];

        // Start the new voice before stopping the old one. Both calls take effect on the very next
        // audio-graph update regardless of which runs first, but starting first means there is never
        // even a single scheduling step where nothing is playing at all - the crossfade genuinely
        // overlaps rather than leaving a silent gap between "stop" and "start".
        this.activeRef = BT.soundPlay(clip, { loop: true, volume: CONFIG.ambienceVolume, fadeInMs: fadeMs });
        this.activePhase = phase;

        if (previousRef !== null) {
            // See activeRef's own field comment above for why this is the one BT.soundStop() call that
            // ref will ever get - superseded here by the phase that just started, never left playing.
            BT.soundStop(previousRef, { fadeOutMs: fadeMs });
        }
    }
}
