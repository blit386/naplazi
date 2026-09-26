/**
 * Fans Sfx's beep boundary out into the feedback channels: the tick sound, a screen-edge border
 * pulse, the detector tip blink, and a vibration. Each is gated by its own CONFIG flag. Owns the two
 * decay timers that let the visual channels fade instead of blinking on and off. Only driven while
 * the screen state is 'play', which is also what keeps audio and haptics from firing before the
 * unlocking tap.
 */

import { BT, Rect2i } from 'blit386';
import type { Sfx } from '../audio/Sfx';
import { CONFIG } from '../config';
import { HUD_ALERT } from '../palette/palette';

const SIGNALS = {
    /**
     * Fade-out after a beep. Short enough that the fastest beep (90ms) still shows a dip between
     * pulses; long enough that the slowest (700ms) does not read as a bare flicker.
     */
    borderPulseDecaySeconds: 0.16,
    detectorBlinkDecaySeconds: 0.16,

    /**
     * The pulse is nested outline rings that drop away as the timer runs out. Solid rings rather than
     * alpha: a palette slot's alpha is transparency, not a blend factor, and the Canvas 2D fallback has
     * no guaranteed partial-alpha path.
     */
    borderPulseMaxRings: 3,
    borderPulseRingSpacingPx: 2,

    /** navigator.vibrate pulse length; the tick itself is 50ms. */
    hapticPulseMs: 30,
} as const;

export class Signals {
    private readonly sfx: Sfx;

    /** Seconds until each visual channel goes dark. Reset to full on every beep, otherwise counting down. */
    private borderPulseRemainingSeconds: number;
    private detectorBlinkRemainingSeconds: number;

    constructor(sfx: Sfx) {
        this.sfx = sfx;
        this.borderPulseRemainingSeconds = 0;
        this.detectorBlinkRemainingSeconds = 0;
    }

    /** Both timers to dark, so the previous run's last beep cannot flash on the new run's first frame. */
    reset(): void {
        this.borderPulseRemainingSeconds = 0;
        this.detectorBlinkRemainingSeconds = 0;
    }

    /**
     * Counts the timers down and, on the frame Sfx reports a beep, fires every enabled channel. Must
     * run after Sfx.update() in the same frame.
     */
    update(deltaSeconds: number): void {
        this.borderPulseRemainingSeconds = Math.max(0, this.borderPulseRemainingSeconds - deltaSeconds);
        this.detectorBlinkRemainingSeconds = Math.max(0, this.detectorBlinkRemainingSeconds - deltaSeconds);

        if (!this.sfx.didBeepThisFrame) {
            return;
        }

        if (CONFIG.beepBorderPulse) {
            this.borderPulseRemainingSeconds = SIGNALS.borderPulseDecaySeconds;
        }
        if (CONFIG.beepDetectorBlink) {
            this.detectorBlinkRemainingSeconds = SIGNALS.detectorBlinkDecaySeconds;
        }

        // The tick is played from here, not inside Sfx.update(), so muting audio cannot also silence
        // the beep boundary the other channels depend on.
        if (CONFIG.beepAudio) {
            this.sfx.playTick();
        }

        // vibrate() can throw even when it exists (an iframe without the vibrate permission, some
        // WebViews), and an uncaught throw in update() stops the game loop for good.
        if (CONFIG.beepHaptic && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
            try {
                navigator.vibrate(SIGNALS.hapticPulseMs);
            } catch {
                // A missed pulse is invisible; a frozen game is not.
            }
        }
    }

    /** Border pulse in HUD_ALERT, a HUD slot the day fade never recolors. Most frames draw nothing. */
    render(): void {
        if (!CONFIG.beepBorderPulse || this.borderPulseRemainingSeconds <= 0) {
            return;
        }

        const intensity = this.borderPulseRemainingSeconds / SIGNALS.borderPulseDecaySeconds;
        const ringCount = Math.max(1, Math.ceil(intensity * SIGNALS.borderPulseMaxRings));
        const width = CONFIG.logicalWidth;
        const height = CONFIG.logicalHeight;

        for (let ring = 0; ring < ringCount; ring += 1) {
            const inset = ring * SIGNALS.borderPulseRingSpacingPx;
            BT.drawRect(new Rect2i(inset, inset, width - inset * 2, height - inset * 2), HUD_ALERT);
        }
    }

    /** 0 (off) to 1 (the instant of a beep). game.ts hands it to Detector.render(); Detector never imports this file. */
    get detectorBlinkIntensity(): number {
        if (!CONFIG.beepDetectorBlink || this.detectorBlinkRemainingSeconds <= 0) {
            return 0;
        }
        return this.detectorBlinkRemainingSeconds / SIGNALS.detectorBlinkDecaySeconds;
    }
}
