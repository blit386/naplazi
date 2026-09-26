/**
 * A bottom-of-screen bar showing signal strength and the head's position, in HUD slots so the day
 * fade leaves it alone. Not wired into game.ts yet.
 */

import { BT, Rect2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_ACCENT, HUD_INK, HUD_PAPER } from '../palette/palette';

const SIGNAL_BAR = {
    barTopY: CONFIG.signalBarY,
    barHeight: 32,
    marginX: 18,
    barWidth: CONFIG.logicalWidth - 2 * 18,
} as const;

/**
 * @param signalStrength 0..1.
 * @param headNormalizedX -1 (left) to 1 (right), relative to the player.
 */
export function renderSignalBar(signalStrength: number, headNormalizedX: number): void {
    const { barTopY, barHeight, marginX, barWidth } = SIGNAL_BAR;

    const barRect = new Rect2i(marginX, barTopY, barWidth, barHeight);
    BT.drawRectFill(barRect, HUD_PAPER);

    // Strength: a vertical bar on the left.
    const strengthHeight = Math.floor(signalStrength * barHeight);
    if (strengthHeight > 0) {
        const strengthRect = new Rect2i(marginX + 4, barTopY + barHeight - strengthHeight, 4, strengthHeight);
        BT.drawRectFill(strengthRect, HUD_ACCENT);
    }

    // Head position: a vertical line.
    const headX = Math.floor(marginX + ((headNormalizedX + 1) / 2) * barWidth);
    const markerLine = new Rect2i(headX, barTopY, 1, barHeight);
    BT.drawRectFill(markerLine, HUD_INK);

    BT.drawRect(barRect, HUD_INK);
}
