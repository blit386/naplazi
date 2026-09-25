// Signal bar: a visual feedback bar at the bottom of the screen showing signal strength
// and the detector head's position. Uses HUD palette slots (19-24) so it remains
// visible during day/night transitions.

import { BT, Rect2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_ACCENT, HUD_INK, HUD_PAPER } from '../palette/palette';

// The signal bar's position and dimensions
const SIGNAL_BAR = {
    // Y position where the bar starts (from config)
    barTopY: CONFIG.signalBarY,
    // Height of the bar in pixels
    barHeight: 32,
    // Left and right margins
    marginX: 18,
    // Width of the bar (screen width minus margins)
    barWidth: CONFIG.logicalWidth - 2 * 18,
} as const;

// Draw the signal bar
export function renderSignalBar(
    signalStrength: number, // 0-1, normalized strength
    headNormalizedX: number, // -1 (left) to 1 (right) relative to player
): void {
    const { barTopY, barHeight, marginX, barWidth } = SIGNAL_BAR;

    // Draw the bar background (HUD_PAPER)
    const barRect = new Rect2i(marginX, barTopY, barWidth, barHeight);
    BT.drawRectFill(barRect, HUD_PAPER);

    // Draw the signal strength indicator (a vertical bar on the left side)
    const strengthHeight = Math.floor(signalStrength * barHeight);
    if (strengthHeight > 0) {
        const strengthRect = new Rect2i(marginX + 4, barTopY + barHeight - strengthHeight, 4, strengthHeight);
        BT.drawRectFill(strengthRect, HUD_ACCENT);
    }

    // Draw the detector head position marker (a vertical line)
    // headNormalizedX is -1 to 1, map to bar coordinates
    const headX = Math.floor(marginX + ((headNormalizedX + 1) / 2) * barWidth);
    const markerLine = new Rect2i(headX, barTopY, 1, barHeight);
    BT.drawRectFill(markerLine, HUD_INK);

    // Draw the bar outline (HUD_INK)
    BT.drawRect(barRect, HUD_INK);
}
