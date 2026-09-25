// The top-right HUD widget: ONE digital wristwatch - the resin-and-LCD kind -
// drawn as a single sprite (WATCH_SHEET, see src/sprites.ts) with the live
// HH:MM readout drawn into its LCD window from the same
// DIGITS_SHEET/drawDigitString helper Counter.ts uses - one shared
// glyph-drawing function, not two copies (this task's own brief, TODO.md
// TASK-013). Zero text anywhere: no BT.systemPrint.
//
// This corner used to hold TWO watches: an analog dial sprite plus a separate
// digital plate sitting beside it, each showing the same minute. One widget
// replaces both, so the case sprite now carries the LCD window the digits land
// in and this file no longer draws a plate of its own. Where that window is
// lives in src/sprites.ts (WATCH_LCD_X/Y and friends), next to the sheet's
// other geometry, so the painter that punches the hole and this file that
// fills it read the exact same numbers.
//
// This file never imports src/game/DayClock.ts or src/audio/Sfx.ts: it only
// ever draws whatever minute-of-day number src/game.ts hands its render()
// call, the same "draw, do not own" contract Counter.ts follows for the
// collected-item count. The end-of-day alarm is wired in src/game.ts's
// init(), from DayClock.onDayEnd() to Sfx.playWatchAlarm() - the exact same
// pattern already used for Treasures.onCollect() -> Sfx.playCollectSound().
// Keeping this file a pure "draw a time" widget with no opinion about WHERE
// that time comes from would also have let TASK-014's results screen reuse it
// for a frozen 22:00 readout with no changes here at all. Its actual results
// screen instead draws its own dedicated numbers panel (found count, seed,
// best score - see src/ui/ResultsScreen.ts), so src/game.ts simply stops
// calling Watch.render() while screenState !== 'play' and this file stays
// exactly the play-only widget this comment already describes.

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { HUD_BAND_HEIGHT_PX } from '../game/Player';
import { cellRect, drawDigitString, WATCH_LCD_PADDING_PX, WATCH_LCD_X, WATCH_LCD_Y, WATCH_SHEET } from '../sprites';

// Everything only this file cares about. Tweak freely.
const WATCH = {
    // Gap, in logical pixels, from the screen's own right edge to the watch
    // case's outer edge - the same number Counter.ts keeps on the left, so
    // the two HUD corners are inset by an equal amount.
    marginPx: 4,
} as const;

// This file's whole layout assumes the watch sprite is no taller than the
// reserved HUD band (Player.ts's HUD_BAND_HEIGHT_PX - the pixel row range
// where a tap is never treated as movement input, see that constant's own doc
// comment). Checked once, at module load, rather than trusted silently: if a
// future resize of watch.png ever broke that assumption, this throws loudly
// the first time this module loads instead of quietly drawing a few rows of
// the case into the playable area.
if (WATCH_SHEET.cellHeight > HUD_BAND_HEIGHT_PX) {
    throw new Error(
        `Watch.ts: watch sprite (${WATCH_SHEET.cellHeight}px tall) no longer fits inside ` +
            `HUD_BAND_HEIGHT_PX (${HUD_BAND_HEIGHT_PX}px) - resize one or the other.`,
    );
}

// Zero-pads a single 0-59 component to exactly two digits ("6" -> "06") -
// TODO.md is explicit that the watch must always show two digits for both
// halves ("06:00", never "6:0").
function padTwoDigits(value: number): string {
    return value < 10 ? `0${value}` : `${value}`;
}

// Turns a float number of minutes-since-midnight (DayClock.gameTimeMinutes)
// into a fixed "HH:MM" string. The modulo is a defensive wrap for a day that
// crossed midnight - it never actually triggers with today's CONFIG
// (dayEndMinutes stops at 1320, safely under 1440), but a future CONFIG
// change that pushed past midnight would otherwise print a bare three-digit
// hour instead of wrapping back around to "00".
function formatGameTime(gameTimeMinutes: number): string {
    const totalMinutes = Math.floor(gameTimeMinutes) % (24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${padTwoDigits(hours)}:${padTwoDigits(minutes)}`;
}

// The watch: one case sprite plus the HH:MM digits inside its LCD window,
// anchored to the screen's ACTUAL top-right corner via BT.displaySize - not a
// hand-copied CONFIG.logicalWidth - per this task's brief in TODO.md.
// BT.displaySize itself hands back a freshly cloned Vector2i on every single
// read (see its getter in node_modules/blit386/dist/blit386.js), so this
// class reads it exactly ONCE, here in the constructor, and caches the
// result as plain numbers - the screen size cannot change again for the
// lifetime of this instance anyway (editing configure() forces a full page
// reload, see CLAUDE.md), so re-reading it every render() call would only
// ever reproduce the same numbers at the cost of an allocation 60 times a
// second for nothing.
export class Watch {
    private readonly watchSheet: SpriteSheet;
    private readonly digitsSheet: SpriteSheet;

    // The case sprite's fixed top-left draw position, and the digits' fixed
    // position inside its LCD window. Both are computed once here rather than
    // per frame: neither can move once the screen size is known.
    private readonly casePos: Vector2i;
    private readonly digitsPos: Vector2i;

    constructor(watchSheet: SpriteSheet, digitsSheet: SpriteSheet) {
        this.watchSheet = watchSheet;
        this.digitsSheet = digitsSheet;

        const caseX = BT.displaySize.x - WATCH.marginPx - WATCH_SHEET.cellWidth;
        // Centred in the reserved HUD band rather than flush with the top
        // edge: the case is shorter than the band (the check above guarantees
        // it is never taller), so splitting the slack evenly leaves the watch
        // sitting in the band instead of hanging off its top rim.
        const caseY = Math.floor((HUD_BAND_HEIGHT_PX - WATCH_SHEET.cellHeight) / 2);
        this.casePos = new Vector2i(caseX, caseY);

        // The LCD window's own inset, plus the pale margin the digits keep
        // inside it - the two numbers the sprite was painted around, read
        // straight from src/sprites.ts so the readout cannot drift off the
        // window it belongs in.
        this.digitsPos = new Vector2i(
            caseX + WATCH_LCD_X + WATCH_LCD_PADDING_PX,
            caseY + WATCH_LCD_Y + WATCH_LCD_PADDING_PX,
        );
    }

    // Draws the watch case, then the time into its LCD window. Draws only -
    // no state changes - called once a frame from src/game.ts's render(),
    // after every world system, so the HUD always sits on top of the beach.
    render(gameTimeMinutes: number): void {
        BT.drawSprite(this.watchSheet, cellRect(WATCH_SHEET, 0), this.casePos);
        drawDigitString(this.digitsSheet, formatGameTime(gameTimeMinutes), this.digitsPos);
    }
}
