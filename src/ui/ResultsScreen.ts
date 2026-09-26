// The results screen: shown once the day ends (src/game.ts wires DayClock.onDayEnd() to flip
// screenState to 'results' - see that file's init()). Three numbers, each paired with its OWN icon so
// the player can always tell which is which without a single word of text (PLAN.md section 4.11's
// "zero text"):
//
//   [magnifying glass] collected count - how many buried items THIS run dug up (Treasures.ts)
//   [star]              best score      - the highest collected count across every run this browser
//                                          has ever played, persisted across reloads (src/ui/HighScore.ts)
//   [die]                seed            - the number that produced this exact beach (BT.random.seedValue);
//                                          two runs sharing this number are guaranteed identical
//
// A magnifying glass reads as "what you searched up" (search -> results), a star reads as "your best",
// and a die reads as "chance/which layout" - three ordinary, language-independent pictographs, not
// arbitrary shapes the player would have to learn from scratch. Below the three rows sits a dedicated
// restart button (a circular-arrow icon on its own plate, ICON_RESTART) - tapping anywhere else on
// this screen does nothing, so a player still reading the numbers cannot restart by mistake.
//
// Same "draw, do not own" contract as Counter.ts/Watch.ts: every number this file draws is handed in
// fresh by src/game.ts's render() call every frame, computed and stored elsewhere entirely
// (Treasures.collectedCount, BT.random.seedValue, src/ui/HighScore.ts's persisted value). This file owns none of
// them, and never imports any of those modules to go find them itself.
import { BT, Rect2i, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_INK, HUD_PAPER } from '../palette/palette';
import {
    cellRect,
    DIGIT_CELL_HEIGHT,
    DIGIT_CELL_WIDTH,
    drawDigitString,
    ICON_BEST,
    ICON_FOUND,
    ICON_RESTART,
    ICON_SEED,
    ICONS_SHEET,
} from '../sprites';
import { findJustPressedPointerPos } from './Tap';

// Everything only this file cares about. Tweak freely.
const RESULTS = {
    // Gap, in logical pixels, between the numbers panel's outer edge and the icon/digits drawn inside
    // it - same number Counter.ts/Watch.ts use for their own plates, so every plate in the game reads
    // as one consistent family.
    marginPx: 4,
    // Vertical gap, in logical pixels, between one row (an icon plus its digits) and the next.
    rowGapPx: 4,
    // Horizontal gap, in logical pixels, between a row's icon and the digits drawn beside it.
    iconGapPx: 3,
    // Vertical gap, in logical pixels, between the numbers panel and the restart button below it -
    // deliberately wider than rowGapPx so the button reads as its own separate thing, not a fourth row
    // of the same list.
    restartGapPx: 14,
    // Gap, in logical pixels, between the restart button's plate edge and the icon inside it.
    restartPaddingPx: 4,
} as const;

// Always exactly three rows (found, best, seed) - named here rather than a bare "3" in the layout math
// below, so a future fourth row only ever has to change this one number plus the row list in render().
const RESULT_ROW_COUNT = 3;

// One row's icon and the (already-formatted) digit text beside it. Built fresh every render() call
// from whatever numbers src/game.ts hands in that frame (see render() below) - this interface only
// exists to keep the three rows' drawing loop free of repeated icon/text plumbing.
interface ResultRow {
    icon: number;
    text: string;
}

// The results screen: a numbers panel (found / best / seed, each with its own icon) plus a dedicated
// restart button below it.
export class ResultsScreen {
    private readonly digitsSheet: SpriteSheet;
    private readonly iconsSheet: SpriteSheet;

    // The numbers panel's fixed top-left Y and total height - constant across every frame (always
    // RESULT_ROW_COUNT rows, always the same icon cell height and gaps, see RESULTS above), even
    // though its WIDTH varies frame to frame with how many digits the current seed/count/best happen
    // to need (see render() below, which - like Counter.ts's own plate - recomputes width fresh every
    // call rather than caching it, since only this file's numbers ever change while it is showing).
    private readonly panelTopY: number;
    private readonly panelHeight: number;

    // The restart button's fixed hit-region, in screen pixels - built once, here, from the exact same
    // numbers render() below uses to draw the button, so the tappable area and the visible button can
    // never drift apart. The same discipline Detector.ts's render()/headWorldX/headWorldY follow for
    // the rod: whatever the player sees must be the very same thing the game measures a tap against.
    private readonly restartRect: Rect2i;

    constructor(digitsSheet: SpriteSheet, iconsSheet: SpriteSheet) {
        this.digitsSheet = digitsSheet;
        this.iconsSheet = iconsSheet;

        const rowHeight = ICONS_SHEET.cellHeight;
        this.panelHeight =
            rowHeight * RESULT_ROW_COUNT + RESULTS.rowGapPx * (RESULT_ROW_COUNT - 1) + RESULTS.marginPx * 2;

        const restartIconRect = cellRect(ICONS_SHEET, ICON_RESTART);
        const restartButtonSize = restartIconRect.width + RESULTS.restartPaddingPx * 2;

        // Center the whole group (panel + gap + restart button) vertically on screen, rather than
        // hand-picking a Y offset - keeps the layout correct if RESULTS' gaps/paddings above ever
        // change, without anything here needing to be re-tuned by hand.
        const totalGroupHeight = this.panelHeight + RESULTS.restartGapPx + restartButtonSize;
        this.panelTopY = Math.floor((CONFIG.logicalHeight - totalGroupHeight) / 2);

        // The restart button's X is centered independently of the numbers panel above it (whose width
        // shifts frame to frame with the seed's digit count - see panelHeight's own comment) so the
        // button itself never moves from one run's results to the next, which matters for it being a
        // fixed, learnable tap target.
        const restartButtonX = Math.floor((CONFIG.logicalWidth - restartButtonSize) / 2);
        const restartButtonY = this.panelTopY + this.panelHeight + RESULTS.restartGapPx;
        this.restartRect = new Rect2i(restartButtonX, restartButtonY, restartButtonSize, restartButtonSize);
    }

    // Reports whether the player just tapped the restart button this frame. Called once a frame from
    // src/game.ts's update() while screenState === 'results' - never from render(). Read input ONLY
    // here, never in render() - see docs/input.md.
    update(): boolean {
        const tapPos = findJustPressedPointerPos();
        return tapPos !== null && this.restartRect.isContainingXY(tapPos.x, tapPos.y);
    }

    // Draws the numbers panel and the restart button. Draws only - no state changes. `seed` and
    // `bestScore` are always non-negative whole numbers by construction (BT.random.seedValue, and
    // src/ui/HighScore.ts's validated stored value), so drawDigitString never sees anything it cannot
    // draw (it only knows '0'-'9' and ':' - see src/sprites.ts).
    render(collectedCount: number, seed: number, bestScore: number): void {
        const rows: readonly ResultRow[] = [
            { icon: ICON_FOUND, text: String(collectedCount) },
            { icon: ICON_BEST, text: String(bestScore) },
            { icon: ICON_SEED, text: String(seed) },
        ];

        const rowHeight = ICONS_SHEET.cellHeight;
        const contentWidth = Math.max(...rows.map((row) => this.measureRowWidth(row)));
        const panelWidth = contentWidth + RESULTS.marginPx * 2;
        const panelX = Math.floor((CONFIG.logicalWidth - panelWidth) / 2);

        const panelRect = new Rect2i(panelX, this.panelTopY, panelWidth, this.panelHeight);
        BT.drawRectFill(panelRect, HUD_PAPER);
        BT.drawRect(panelRect, HUD_INK);

        const contentLeftX = panelX + RESULTS.marginPx;
        let rowTopY = this.panelTopY + RESULTS.marginPx;
        for (const row of rows) {
            this.renderRow(row, contentLeftX, rowTopY, rowHeight);
            rowTopY += rowHeight + RESULTS.rowGapPx;
        }

        BT.drawRectFill(this.restartRect, HUD_PAPER);
        BT.drawRect(this.restartRect, HUD_INK);
        const restartIconRect = cellRect(ICONS_SHEET, ICON_RESTART);
        const restartIconPos = new Vector2i(
            this.restartRect.x + Math.floor((this.restartRect.width - restartIconRect.width) / 2),
            this.restartRect.y + Math.floor((this.restartRect.height - restartIconRect.height) / 2),
        );
        BT.drawSprite(this.iconsSheet, restartIconRect, restartIconPos);
    }

    private measureRowWidth(row: ResultRow): number {
        const iconRect = cellRect(ICONS_SHEET, row.icon);
        return iconRect.width + RESULTS.iconGapPx + row.text.length * DIGIT_CELL_WIDTH;
    }

    private renderRow(row: ResultRow, contentLeftX: number, rowTopY: number, rowHeight: number): void {
        const iconRect = cellRect(ICONS_SHEET, row.icon);
        const iconPos = new Vector2i(contentLeftX, rowTopY + Math.floor((rowHeight - iconRect.height) / 2));
        BT.drawSprite(this.iconsSheet, iconRect, iconPos);

        const digitsX = contentLeftX + iconRect.width + RESULTS.iconGapPx;
        const digitsY = rowTopY + Math.floor((rowHeight - DIGIT_CELL_HEIGHT) / 2);
        drawDigitString(this.digitsSheet, row.text, new Vector2i(digitsX, digitsY));
    }
}
