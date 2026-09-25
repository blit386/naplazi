// Haptics: wraps navigator.vibrate with safety checks. Only runs on devices that support it
// (iOS Safari doesn't), and can be globally disabled via CONFIG.beepHaptic.

import { CONFIG } from '../config';

// Vibrate durations in milliseconds
const VIBRATE = {
    // New target in range: short pulse
    newTargetMs: 20,
    // Item collected: medium pulse
    collectMs: 40,
    // End of day: three long pulses
    dayEndMs: 60,
} as const;

// Check if haptics are available and enabled
function isAvailable(): boolean {
    return CONFIG.beepHaptic && typeof navigator !== 'undefined' && 'vibrate' in navigator;
}

// Type for the vibrate function
type VibrateFunction = (duration: number | number[]) => void;

// Get the vibrate function if available
function getVibrate(): VibrateFunction | null {
    if (!isAvailable()) return null;
    return (navigator as { vibrate: VibrateFunction }).vibrate.bind(navigator);
}

// Vibrate for a new target entering range
export function vibrateNewTarget(): void {
    const vibrate = getVibrate();
    if (!vibrate) return;
    vibrate(VIBRATE.newTargetMs);
}

// Vibrate when an item is collected
export function vibrateCollect(): void {
    const vibrate = getVibrate();
    if (!vibrate) return;
    vibrate(VIBRATE.collectMs);
}

// Vibrate when the day ends
export function vibrateDayEnd(): void {
    const vibrate = getVibrate();
    if (!vibrate) return;
    vibrate([VIBRATE.dayEndMs, VIBRATE.dayEndMs, VIBRATE.dayEndMs]);
}
