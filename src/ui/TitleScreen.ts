// The title screen: the very first thing the player sees. A tap anywhere on the canvas starts the
// game - see findJustPressedPointerPos() in Tap.ts for how that edge is detected - and that SAME tap
// is also the player's first interaction with the page, which is exactly what unlocks audio (see
// docs/audio.md, "Why the game starts silent (this is normal)"); nothing here has to ask for that
// separately, and nothing here can - BT.isAudioUnlocked flips true on its own, driven by the browser's
// own pointerdown/keydown/touchstart listeners, the moment the tap happens.
//
// Zero text anywhere (PLAN.md section 4.11): the whole screen is one pulsing badge built from
// ICON_PLAY (see src/sprites.ts / tools/make-sprites.mjs) - a plain right-pointing "play" triangle,
// blinked on and off rather than shown as a single static image, so a player who has not touched
// anything yet still gets an obvious, ongoing "something wants your attention here" cue instead of a
// screen that might just look frozen or broken. A play-button glyph reads the same with a fingertip on
// a phone or a mouse pointer on a desktop (this task's own brief: the title screen "must also be readable
// with a mouse on desktop") - no words needed either way.
//
// Drawn using ONLY HUD-range colors (HUD_INK/HUD_PAPER - see src/palette/palette.ts's slot-layout
// comment), the same as every other UI element under src/ui/ and src/hud/, so this screen looks
// identical in every lighting phase without needing its own phase-specific art.
import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_INK, HUD_PAPER } from '../palette/palette';
import { cellRect, ICON_PLAY, ICONS_SHEET } from '../sprites';
import { findJustPressedPointerPos } from './Tap';

// Everything only this file cares about. Tweak freely.
const TITLE = {
    // One full on-then-off blink cycle, in milliseconds. Half of this is spent visible, half hidden
    // (see render() below) - slow enough to read clearly as a deliberate pulse rather than a flicker,
    // fast enough that a player looking at an otherwise-still screen notices it within a second or two.
    blinkPeriodMs: 900,
    // Gap, in logical pixels, between the badge plate's edge and the icon drawn inside it - same
    // number Counter.ts/Watch.ts use for their own plates, so every plate in the game reads as one
    // consistent family.
    badgePaddingPx: 4,
} as const;

// The title screen: a single pulsing "tap to start" badge, centered on an otherwise-frozen beach (see
// src/game.ts's render(), which draws Beach/Player/Detector in every screen state, title included).
export class TitleScreen {
    private readonly iconsSheet: SpriteSheet;

    // The badge's fixed screen rectangle - built once here in the constructor from CONFIG's fixed
    // screen size, never recomputed per frame (the same reasoning Watch.ts's constructor gives for
    // caching its own layout: the screen size cannot change again for the lifetime of this instance,
    // see CLAUDE.md on configure() changes forcing a full reload).
    private readonly badgeRect: Rect2i;

    // Milliseconds accumulated since this screen started showing - drives the blink cycle below. This
    // is a UI-animation timer, not game time (compare DayClock.ts): it is fine, and correct, for it to
    // keep advancing even though TODO.md TASK-014 requires the game WORLD to stay frozen while the
    // title is up - this timer never touches the world at all.
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

    // Puts the blink cycle back to its start. Never actually exercised by today's flow - the title
    // only ever shows once, before the very first Play; restarting goes straight from Results back to
    // Play, never back through Title (see src/game.ts) - but kept anyway, for the same reason every
    // other system in this codebase has a reset(): so a future change that DID bring the player back
    // here would not need to add one after the fact.
    reset(): void {
        this.elapsedMs = 0;
    }

    // Advances the blink timer and reports whether the player just tapped anywhere on the screen.
    // Called once a frame from src/game.ts's update() while screenState === 'title' - never from
    // render(). Read input ONLY here, never in render() - see docs/input.md.
    update(deltaSeconds: number): boolean {
        this.elapsedMs += deltaSeconds * 1000;
        return findJustPressedPointerPos() !== null;
    }

    // Draws the badge while it is in the "on" half of its blink cycle, and nothing at all otherwise.
    // Draws only - no state changes.
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
