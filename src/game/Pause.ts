// Pause: unified pause mechanism for the game. Used when the tab loses focus
// and when the find panel is active. Handles both game pause and visual
// dimming.

import { BT, Rect2i } from 'blit386';
import { CONFIG } from '../config';
import { HUD_PAPER } from '../palette/palette';

// Pause reason
export type PauseReason = 'visibility' | 'panel';

// The pause state
export class Pause {
    private _isPaused: boolean = false;
    private _reason: PauseReason | null = null;

    // Set up the visibility change listener
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

    // Pause the game with a reason
    pause(reason: PauseReason): void {
        if (this._isPaused) return;

        this._isPaused = true;
        this._reason = reason;
    }

    // Resume the game
    resume(): void {
        if (!this._isPaused) return;
        if (this._reason === 'panel') return; // Panel pause must end explicitly

        this._isPaused = false;
        this._reason = null;
    }

    // Reset pause state (called on restart)
    reset(): void {
        this._isPaused = false;
        this._reason = null;
    }

    // Check if the game should update (returns false when paused)
    shouldUpdate(): boolean {
        return !this._isPaused;
    }

    // Check if the game should stop audio (returns true when paused due to visibility)
    shouldStopAudio(): boolean {
        return this._isPaused && this._reason === 'visibility';
    }

    // Render the pause overlay (darkening effect)
    render(): void {
        if (!this._isPaused || this._reason === 'panel') return;

        // Draw a semi-transparent dark overlay
        const overlay = new Rect2i(0, 0, CONFIG.logicalWidth, CONFIG.logicalHeight);
        BT.drawRectFill(overlay, HUD_PAPER);
    }

    // Get the current pause reason
    get reason(): PauseReason | null {
        return this._reason;
    }
}
