// Signals: fans one "beep boundary" (Sfx.ts's didBeepThisFrame) out into the three feedback channels
// PLAN.md section 4.5 asks for - audio, visual (a screen-edge border pulse plus the detector tip
// blink), and haptic - each gated by its own CONFIG flag so any one of them can be switched off to see
// (or feel) how much it was carrying on its own. This file OWNS the two decay timers the border pulse
// and detector blink need to linger and fade rather than just blink instantly on and off (see TODO.md
// TASK-016's own "must have a runoff" requirement) and decides, once a frame, which channels actually
// fire. It does NOT own the beep boundary itself - that stays Sfx.ts's job, driven by its own
// deltaSeconds/distance accumulator - and it does NOT reach into Detector.ts's internals to make the
// tip blink: see detectorBlinkIntensity's own doc comment below for how that handoff works instead.
//
// Decision in update(), drawing in render() - the same split every other system in this project
// follows (see CLAUDE.md). update() below advances/resets the two decay timers and fires the
// audio/haptic channels (side effects, not drawing); render() only reads the timer state update()
// already decided this frame and issues BT.drawRect() calls from it. Neither method reads the other's
// inputs out of order.
//
// Only ever driven while screenState === 'play' (see src/game.ts's update()/render()): this file's
// update() is never called during 'title' or 'results', so the audio and haptic channels can never
// fire before the title-screen tap that unlocks them - both need the same user gesture BT.soundPlay
// itself already waits for (see docs/audio.md), and this project's screen-state dispatch already
// keeps every other per-frame system (DayClock, Beach, Player, ...) frozen the exact same way, so
// Signals just follows the pattern rather than inventing its own "am I unlocked yet" flag.

import { BT, Rect2i } from 'blit386';
import type { Sfx } from '../audio/Sfx';
import { CONFIG } from '../config';
import { HUD_ALERT } from '../palette/palette';

// Everything only this file cares about. Tweak freely.
const SIGNALS = {
    // How long, in seconds, the border pulse and the detector blink keep fading after a beep boundary
    // before going fully dark again. This is the "run-off" TODO.md TASK-016 calls out as a
    // blocking requirement: without it, a fast beep train (Detector.ts's DETECTOR.beepIntervalFastMs is
    // 90ms) would look like one flat, un-pulsing glow instead of a readable rhythm. Short enough that
    // even the fastest beep still shows a visible fade between pulses; long enough that the slowest
    // beep (700ms) does not look like a bare flicker with a dead, unlit gap in between.
    borderPulseDecaySeconds: 0.16,
    detectorBlinkDecaySeconds: 0.16,

    // The border pulse is drawn as this many nested BT.drawRect() screen-edge outlines at the instant
    // of a beep, shrinking to fewer (and finally none) as borderPulseDecaySeconds above runs out - the
    // "weakening" TODO.md asks for, built from plain solid-color outlines rather than any alpha
    // blending (a palette slot's alpha is transparency, not a partial-blend factor - see
    // docs/palette.md - and the Canvas 2D fallback this engine can fall back to has no guaranteed
    // partial-alpha compositing path either, so alpha-fading a filled rect is not a safe bet here).
    borderPulseMaxRings: 3,
    borderPulseRingSpacingPx: 2,

    // navigator.vibrate's pulse length, in milliseconds - short and sharp, matching the tick sound's
    // own brevity (Sfx.ts's SFX.tickDurationSeconds is 50ms).
    hapticPulseMs: 30,
} as const;

// Fans Sfx's beep boundary out into audio/visual/haptic feedback. Built once in src/game.ts's init()
// - it needs the already-constructed Sfx instance so it can call Sfx.playTick() itself (see update()
// below) - and driven every frame from update()/render() while screenState === 'play', exactly the
// same gating every other per-run system in this project already follows.
export class Signals {
    private readonly sfx: Sfx;

    // Seconds left before the border pulse/detector blink go fully dark again - see SIGNALS' own decay
    // comment above. Both start at 0 (nothing pulsing) and are reset to their full decay duration every
    // time Sfx reports a fresh beep boundary; every other frame they only ever count down.
    private borderPulseRemainingSeconds: number;
    private detectorBlinkRemainingSeconds: number;

    constructor(sfx: Sfx) {
        this.sfx = sfx;
        this.borderPulseRemainingSeconds = 0;
        this.detectorBlinkRemainingSeconds = 0;
    }

    // Puts both decay timers back to fully dark. src/game.ts's restart() calls this (alongside every
    // other system's reset()) so a leftover pulse from the previous run's very last beep can never
    // carry over and flash on the first frame of the new one.
    reset(): void {
        this.borderPulseRemainingSeconds = 0;
        this.detectorBlinkRemainingSeconds = 0;
    }

    // Advances both decay timers by one frame and, exactly on the frame Sfx crossed a beep boundary,
    // fires every enabled channel off that same instant. Called once a frame from src/game.ts's
    // update() - never from render() - and always AFTER Sfx.update() has already run this same frame:
    // this method only reads Sfx.didBeepThisFrame, which Sfx.update() just set (see Sfx.ts).
    update(deltaSeconds: number): void {
        this.borderPulseRemainingSeconds = Math.max(0, this.borderPulseRemainingSeconds - deltaSeconds);
        this.detectorBlinkRemainingSeconds = Math.max(0, this.detectorBlinkRemainingSeconds - deltaSeconds);

        if (!this.sfx.didBeepThisFrame) {
            return;
        }

        // Visual channels: restart whichever decay timers are enabled, at full duration - every
        // enabled channel flashes on the exact same beep boundary, whether or not the others are also
        // switched on.
        if (CONFIG.beepBorderPulse) {
            this.borderPulseRemainingSeconds = SIGNALS.borderPulseDecaySeconds;
        }
        if (CONFIG.beepDetectorBlink) {
            this.detectorBlinkRemainingSeconds = SIGNALS.detectorBlinkDecaySeconds;
        }

        // Audio channel: the tick's actual playback lives in Sfx.playTick() now, called from HERE
        // (never from inside Sfx.update() any more) specifically so this one flag can silence it
        // without touching the beep-boundary detection every other channel above and below still
        // depends on.
        if (CONFIG.beepAudio) {
            this.sfx.playTick();
        }

        // Haptic channel: navigator.vibrate does not exist on every device or browser (desktop
        // browsers, iOS Safari - TODO.md TASK-016's own blocking-risk note calls this out explicitly).
        // The typeof guard only rules out "the method is missing"; the CALL ITSELF can still throw even
        // when the method exists (a cross-origin iframe with no Permissions-Policy for 'vibrate', some
        // WebView implementations, ...), and this is called from update() with no try/catch anywhere
        // above it in the engine's own tick() (see node_modules/blit386/dist/blit386.js - update() runs
        // unguarded, and the next requestAnimationFrame is only scheduled AFTER it returns). An exception
        // here would therefore not just skip one haptic pulse - it would stop update() from returning at
        // all, so the engine never schedules another frame and the whole game freezes silently. The
        // try/catch below is what actually makes "must never throw" true; the typeof guard alone only
        // narrows WHEN the call is attempted, not whether attempting it can fail. The empty catch is
        // deliberate - navigator.vibrate's return value is already ignored on success (see docs/audio.md
        // style "fire and forget" side effects), so a failure is handled the exact same way: nothing.
        if (CONFIG.beepHaptic && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
                navigator.vibrate(SIGNALS.hapticPulseMs);
            } catch {
                // Vibration API calls can throw even when the method exists - see the comment above.
                // Swallow it: a missed haptic pulse is invisible; an uncaught exception here would
                // silently freeze the entire game loop instead.
            }
        }
    }

    // Draws the border pulse: nested screen-edge outlines in the HUD_ALERT slot (reserved for exactly
    // this - see src/palette/palette.ts's slot-layout comment), never a world-ramp slot, so TASK-015's
    // day/night fade can never recolor it out from under this effect. Draws only - no state changes;
    // the ring count below comes purely from borderPulseRemainingSeconds, which update() above already
    // decided this frame. Called once a frame from src/game.ts's render(), only while
    // screenState === 'play'.
    render(): void {
        if (!CONFIG.beepBorderPulse || this.borderPulseRemainingSeconds <= 0) {
            return;
        }

        // 1 at the instant of a beep, fading linearly down to 0 - see SIGNALS.borderPulseDecaySeconds.
        const intensity = this.borderPulseRemainingSeconds / SIGNALS.borderPulseDecaySeconds;
        const ringCount = Math.max(1, Math.ceil(intensity * SIGNALS.borderPulseMaxRings));
        const width = CONFIG.logicalWidth;
        const height = CONFIG.logicalHeight;

        for (let ring = 0; ring < ringCount; ring += 1) {
            const inset = ring * SIGNALS.borderPulseRingSpacingPx;
            BT.drawRect(new Rect2i(inset, inset, width - inset * 2, height - inset * 2), HUD_ALERT);
        }
    }

    // How strongly the detector tip should currently highlight - 0 (off) to 1 (the instant of a beep),
    // fading linearly down over detectorBlinkDecaySeconds. A plain number, not something Detector.ts
    // has to compute itself: src/game.ts reads this once a frame and hands it straight to
    // Detector.render() as a parameter (see that file's own doc comment on tipBlinkIntensity), which is
    // the "Detector only ever receives a value, Signals never reaches into Detector's internals" split
    // this task's brief calls for.
    get detectorBlinkIntensity(): number {
        if (!CONFIG.beepDetectorBlink || this.detectorBlinkRemainingSeconds <= 0) {
            return 0;
        }
        return this.detectorBlinkRemainingSeconds / SIGNALS.detectorBlinkDecaySeconds;
    }
}
