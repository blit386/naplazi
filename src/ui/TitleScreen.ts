/**
 * The first screen: a blinking play badge over the frozen beach. A tap anywhere starts the game, and
 * that same tap is the gesture that unlocks audio. HUD colors only, so it looks the same in every
 * phase. No text.
 */

import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_INK, HUD_PAPER } from '../palette/palette';
import { cellRect, ICON_PLAY, ICONS_SHEET } from '../sprites';
import { findJustPressedPointerPos } from './Tap';

const TITLE = {
    /** Full on-off cycle; half visible, half hidden. */
    blinkPeriodMs: 900,
    /** Badge edge to icon; matches the other plates. */
    badgePaddingPx: 4,
} as const;

export class TitleScreen {
    private readonly iconsSheet: SpriteSheet;

    /** Fixed: the screen never resizes after configure(). */
    private readonly badgeRect: Rect2i;

    /** A UI timer, not game time: it advances while the world stays frozen. */
    private elapsedMs: number;

    constructor(iconsSheet: SpriteSheet) {
        this.iconsSheet = iconsSheet;
        this.elapsedMs = 0;

        const iconRect = cellRect(ICONS_SHEET, ICON_PLAY);
        const badgeSize = iconRect.width + TITLE.badgePaddingPx * 2;
        const badgeX = Math.floor((CONFIG.logicalWidth - badgeSize) / 2);
        const badgeY = Math.floor((CONFIG.logicalHeight - badgeSize) / 2);
        this.badgeRect = new Rect2i(badgeX, badgeY, badgeSize, badgeSize);
    }

    /** Unused today (restart never returns to the title); kept so every screen has one. */
    reset(): void {
        this.elapsedMs = 0;
    }

    /** Advances the blink and reports a tap anywhere on screen. Input is read here, never in render(). */
    update(deltaSeconds: number): boolean {
        this.elapsedMs += deltaSeconds * 1000;
        return findJustPressedPointerPos() !== null;
    }

    /** Draws the badge during the on half of the cycle, nothing otherwise. */
    render(): void {
        const cyclePosition = this.elapsedMs % TITLE.blinkPeriodMs;
        const isVisible = cyclePosition < TITLE.blinkPeriodMs / 2;
        if (!isVisible) {
            return;
        }

        BT.drawRectFill(this.badgeRect, HUD_PAPER);
        BT.drawRect(this.badgeRect, HUD_INK);

        const iconRect = cellRect(ICONS_SHEET, ICON_PLAY);
        const iconPos = new Vector2i(
            this.badgeRect.x + Math.floor((this.badgeRect.width - iconRect.width) / 2),
            this.badgeRect.y + Math.floor((this.badgeRect.height - iconRect.height) / 2),
        );
        BT.drawSprite(this.iconsSheet, iconRect, iconPos);
    }
}
