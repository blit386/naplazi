/**
 * A pause with a reason: the hidden tab, or an open find panel. Not wired into game.ts yet; DayClock
 * pauses itself on a hidden tab.
 */

import { BT, Rect2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_PAPER } from '../palette/palette';

export type PauseReason = 'visibility' | 'panel';

export class Pause {
    private _isPaused: boolean = false;
    private _reason: PauseReason | null = null;

    /** Not idempotent: every call adds another listener. */
    setupVisibilityListener(): void {
        if (typeof document === 'undefined') return;

        const handler = () => {
            if (document.hidden) {
                this.pause('visibility');
            } else if (this._reason === 'visibility') {
                this.resume();
            }
        };

        document.addEventListener('visibilitychange', handler);
    }

    pause(reason: PauseReason): void {
        if (this._isPaused) return;

        this._isPaused = true;
        this._reason = reason;
    }

    /** A 'panel' pause must end through reset(); resume() ignores it. */
    resume(): void {
        if (!this._isPaused) return;
        if (this._reason === 'panel') return;

        this._isPaused = false;
        this._reason = null;
    }

    reset(): void {
        this._isPaused = false;
        this._reason = null;
    }

    shouldUpdate(): boolean {
        return !this._isPaused;
    }

    /** True only for a visibility pause; a panel pause keeps audio running. */
    shouldStopAudio(): boolean {
        return this._isPaused && this._reason === 'visibility';
    }

    /** Covers the screen with HUD_PAPER while paused for visibility. */
    render(): void {
        if (!this._isPaused || this._reason === 'panel') return;

        const overlay = new Rect2i(0, 0, CONFIG.logicalWidth, CONFIG.logicalHeight);
        BT.drawRectFill(overlay, HUD_PAPER);
    }

    get reason(): PauseReason | null {
        return this._reason;
    }
}
