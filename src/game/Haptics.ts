/** Vibration helpers over navigator.vibrate. Not wired into game.ts yet; Signals.ts vibrates on its own. */

import { CONFIG } from '../config';

/** Pulse lengths, in milliseconds. */
const VIBRATE = {
    newTargetMs: 20,
    collectMs: 40,
    /** Three pulses of this length. */
    dayEndMs: 60,
} as const;

function isAvailable(): boolean {
    return CONFIG.beepHaptic && typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

type VibrateFunction = (duration: number | number[]) => void;

function getVibrate(): VibrateFunction | null {
    if (!isAvailable()) return null;
    return (navigator as { vibrate: VibrateFunction }).vibrate.bind(navigator);
}

export function vibrateNewTarget(): void {
    const vibrate = getVibrate();
    if (!vibrate) return;
    vibrate(VIBRATE.newTargetMs);
}

export function vibrateCollect(): void {
    const vibrate = getVibrate();
    if (!vibrate) return;
    vibrate(VIBRATE.collectMs);
}

export function vibrateDayEnd(): void {
    const vibrate = getVibrate();
    if (!vibrate) return;
    vibrate([VIBRATE.dayEndMs, VIBRATE.dayEndMs, VIBRATE.dayEndMs]);
}
