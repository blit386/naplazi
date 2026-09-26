/**
 * Shared "was the screen just tapped, and where" for the title and results screens. Uses
 * BT.isPressed(BT.BTN_POINTER_A, slot), an edge that is true on exactly one update() per press, so a
 * screen switch can never re-read the tap that caused it. Player.ts reads the same button as a held
 * state instead.
 */

import { BT, type Vector2i } from 'blit386';

/** Slot 0 is the mouse; 1-3 are touch/pen contacts, so a tap works the same on a phone and a desktop. */
const POINTER_SLOT_COUNT = 4;

/** Position of the first slot that went down this update(), or null. Call from update() only. */
export function findJustPressedPointerPos(): Vector2i | null {
    for (let slot = 0; slot < POINTER_SLOT_COUNT; slot += 1) {
        if (BT.isPressed(BT.BTN_POINTER_A, slot)) {
            return BT.pointerPos(slot);
        }
    }
    return null;
}
