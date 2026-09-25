// A tiny, shared "was the screen just tapped, and where" helper for TitleScreen.ts and
// ResultsScreen.ts - both need exactly this and nothing else does, so it lives here once instead of
// each file re-implementing the same pointer-slot loop.
//
// Built on BT.isPressed(BT.BTN_POINTER_A, slot) - a genuine EDGE, true only on the exact update() call
// a pointer slot transitions from up to down (node_modules/blit386/dist/blit386.d.ts, isPressed's own
// doc comment: "returns true only on the frame the button transitions from up to down"). That is the
// opposite of BT.isPointerActive(slot), which Player.ts's own movement reads: for the mouse (slot 0),
// isPointerActive is true for as long as the mouse merely HOVERS over the canvas, click or not (same
// file's own doc comment on isPointerActive). An edge is what "a tap" means for a menu button - it
// fires exactly once per press, so using it here is what lets src/game.ts's screen-state switch treat
// "the tap that opened this screen" and "an ordinary later movement input" as two different things
// (see TODO.md TASK-014's own blocking-risk note on not double-processing the same tap).
import { BT, type Vector2i } from 'blit386';

// Pointer slot 0 is always the mouse; slots 1-3 are up to three simultaneous touch/pen contacts (see
// BT.pointerPos's own doc comment). Checking all four - not just slot 0 - is what makes a tap work the
// same way on a touchscreen phone (this game's primary target, see PLAN.md section 1) as with a
// desktop mouse (this task's own brief: the title screen "must also be readable with a mouse on desktop").
const POINTER_SLOT_COUNT = 4;

// Returns the position of whichever pointer slot just went down THIS update() call, or null if none
// did. Call this once per frame, from update() only (never render() - see docs/input.md, "Read input
// inside update()").
export function findJustPressedPointerPos(): Vector2i | null {
    for (let slot = 0; slot < POINTER_SLOT_COUNT; slot += 1) {
        if (BT.isPressed(BT.BTN_POINTER_A, slot)) {
            return BT.pointerPos(slot);
        }
    }
    return null;
}
