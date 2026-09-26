/**
 * Shown when the day ends. Three icon-labelled numbers (magnifying glass: found this run; star: best
 * across runs; die: the seed that made this beach) and a separate restart button below them. Tapping
 * anywhere else does nothing. Draws whatever game.ts hands in; owns none of the numbers.
 */

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

const RESULTS = {
    /** Panel edge to content; matches the other plates. */
    marginPx: 4,
    /** Between rows. */
    rowGapPx: 4,
    /** Icon to digits. */
    iconGapPx: 3,
    /** Panel to restart button; wider than rowGapPx so the button reads as its own thing, not a fourth row. */
    restartGapPx: 14,
    /** Button edge to icon. */
    restartPaddingPx: 4,
} as const;

/** Found, best, seed. */
const RESULT_ROW_COUNT = 3;

interface ResultRow {
    icon: number;
    text: string;
}

export class ResultsScreen {
    private readonly digitsSheet: SpriteSheet;
    private readonly iconsSheet: SpriteSheet;

    /** Fixed: the row count and heights never change. The width is recomputed per frame from the digit counts. */
    private readonly panelTopY: number;
    private readonly panelHeight: number;

    /** The hit region and the drawn button share this one rect, so they cannot drift apart. */
    private readonly restartRect: Rect2i;

    constructor(digitsSheet: SpriteSheet, iconsSheet: SpriteSheet) {
        this.digitsSheet = digitsSheet;
        this.iconsSheet = iconsSheet;

        const rowHeight = ICONS_SHEET.cellHeight;
        this.panelHeight =
            rowHeight * RESULT_ROW_COUNT + RESULTS.rowGapPx * (RESULT_ROW_COUNT - 1) + RESULTS.marginPx * 2;

        const restartIconRect = cellRect(ICONS_SHEET, ICON_RESTART);
        const restartButtonSize = restartIconRect.width + RESULTS.restartPaddingPx * 2;

        // Centre the panel-plus-button group vertically as a whole.
        const totalGroupHeight = this.panelHeight + RESULTS.restartGapPx + restartButtonSize;
        this.panelTopY = Math.floor((CONFIG.logicalHeight - totalGroupHeight) / 2);

        // The button is centred independently of the panel (whose width varies), so it never moves between runs.
        const restartButtonX = Math.floor((CONFIG.logicalWidth - restartButtonSize) / 2);
        const restartButtonY = this.panelTopY + this.panelHeight + RESULTS.restartGapPx;
        this.restartRect = new Rect2i(restartButtonX, restartButtonY, restartButtonSize, restartButtonSize);
    }

    /** True on the frame the restart button is tapped. Input is read here, never in render(). */
    update(): boolean {
        const tapPos = findJustPressedPointerPos();
        return tapPos !== null && this.restartRect.isContainingXY(tapPos.x, tapPos.y);
    }

    /** `seed` and `bestScore` are non-negative integers by construction, so drawDigitString cannot throw. */
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
