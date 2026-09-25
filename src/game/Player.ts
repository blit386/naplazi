// The player: a little figure planted near the bottom of the screen, facing
// away from the camera, who moves by taking discrete side-steps instead of
// sliding smoothly. See Beach.ts for the coordinate system contract this
// file follows (worldX/worldY, the depth -> screenY projection, ...).

import { BT, type SpriteSheet, Vector2i } from 'blit386';
import { CONFIG } from '../config';
import { cellRect, PLAYER_SHEET } from '../sprites';
import { depthToScreenY, PLAYER_WORLD_Y } from './Beach';
import { DETECTOR_MAX_HORIZONTAL_REACH_PX } from './Detector';

// Height, in logical pixels, of the strip reserved along the very top of the
// screen for the HUD (the counter in the top-left corner, the watch in the
// top-right - see TODO.md TASK-013). Exported - not just a value inside the
// PLAYER block below - because TASK-013's Counter/Watch need this EXACT
// number too: the HUD's own drawn height and the height this file uses to
// decide "is this tap movement input or a HUD tap" must never disagree, or a
// tap right at the boundary could do the wrong thing.
export const HUD_BAND_HEIGHT_PX = 24;

// Everything only this file cares about. Tweak freely.
const PLAYER = {
    // How far one side-step moves the player, in pixels (worldX and screenX
    // share one scale - see Beach.ts). Bigger reads as a snappier, more
    // digital walk; smaller reads as shuffling.
    stepWidthPx: 14,

    // How long a single step takes, in seconds, from one settled stance to
    // the next settled stance. While a step is in flight no new step can start -
    // see update() below - so this is also the minimum time between two
    // steps, i.e. it caps how fast the player can cross the band even while
    // a direction is held down continuously.
    stepDurationSeconds: 0.12,

    // Left/right margin, in pixels, kept clear on both edges of the screen.
    // The playable band is [bandMarginPx, CONFIG.logicalWidth - bandMarginPx).
    // Deliberately NOT a hand-picked number: it IS
    // Detector.ts's DETECTOR_MAX_HORIZONTAL_REACH_PX, the exact, computed
    // worst-case horizontal distance the detector head sprite's far edge can
    // ever land from the player's own worldX (rod swung fully to
    // maxAngleDeg, plus the head sprite's own half-width). Reusing that
    // exact exported number - instead of copying a similar-looking constant
    // here - is what guarantees the rod can never be swung off the left or
    // right edge of the canvas even when the player is pinned at the edge of
    // the band at the same time: see Detector.ts for the full derivation.
    bandMarginPx: DETECTOR_MAX_HORIZONTAL_REACH_PX,

    // Half-width, in pixels, of a dead zone straddling the exact horizontal
    // center of the screen (CONFIG.logicalWidth / 2). A held pointer whose X
    // falls within this band of the center counts as "no direction" instead
    // of resolving to -1 or 1 - see readHeldPointerDirection() below. Without
    // this, a press landing on (or a single-pixel wobble around) the exact
    // center pixel would flip between stepping left and right depending on
    // which side of that one pixel it happened to land on. Small on purpose:
    // this is a jitter guard, not a deliberate "aim precisely to stand
    // still" mechanic - the real way to stand still is to not hold anything
    // at all (see readInputDirection() below).
    pointerDeadZoneHalfWidthPx: 6,
} as const;

// Pointer slot 0 is always the mouse; slots 1-3 are up to three simultaneous
// touch/pen contacts (see BT.pointerPos's own doc comment). Checked in that
// order by readHeldPointerDirection() below so the mouse is the first thing
// consulted, same priority the previous (mouse-only) implementation had.
const POINTER_SLOT_COUNT = 4;

// A step's direction, or 0 when nothing is pressed/held. Also what the
// detector rod (Detector.ts) reads every frame to know which way to swing.
export type InputDirection = -1 | 0 | 1;

// Called once a discrete step finishes and the player has settled into its
// new position. TASK-018 (footprints) subscribes one of these via
// onStepComplete() below to stamp a footprint exactly where the player just
// arrived.
export type StepCompleteListener = (worldX: number, worldY: number) => void;

// The player figure: fixed vertical screen position, discrete side-stepping
// horizontal movement, clamped to a playable band.
export class Player {
    // The loaded, palette-indexed player sheet (see src/sprites.ts). Passed
    // in from src/game.ts's init() - the only place sprite sheets load.
    private readonly playerSheet: SpriteSheet;

    // The playable band's edges, in world/screen pixels (computed once - the
    // screen size never changes after configure(), see CLAUDE.md's hot
    // reload notes on why editing configure() forces a full page reload).
    private readonly bandMinX: number;
    private readonly bandMaxX: number;

    // The player's FIXED screen row, computed once from the shared
    // coordinate contract (Beach.depthToScreenY) rather than being its own,
    // separately-tuned number - see PLAYER_WORLD_Y's doc comment in Beach.ts
    // for why the player needs a worldY at all even though it never moves.
    readonly screenY: number;

    // Current horizontal position, in world units (same scale as screenX -
    // see Beach.ts). A float even though the player only ever settles on
    // stepWidthPx-aligned positions, because a step ANIMATES between two
    // such positions over stepDurationSeconds - see advanceStep() below.
    private currentX: number;

    // The step currently in flight: where it started, where it is headed,
    // and how much of stepDurationSeconds has elapsed. Only meaningful while
    // isStepping is true.
    private stepOriginX: number;
    private stepTargetX: number;
    private stepElapsedSeconds: number;
    private isStepping: boolean;

    // The most recently read input direction, sampled fresh every update()
    // call regardless of whether a step is in flight (see update() below) -
    // the detector rod keeps swinging toward held input even mid-step.
    private lastInputDirection: InputDirection;

    // Listeners registered via onStepComplete(). A plain array, built once
    // and only ever appended to - reset() does NOT clear it, because
    // listeners are wiring set up once at startup, not per-run game state.
    private readonly stepListeners: StepCompleteListener[] = [];

    constructor(playerSheet: SpriteSheet) {
        this.playerSheet = playerSheet;
        this.bandMinX = PLAYER.bandMarginPx;
        this.bandMaxX = CONFIG.logicalWidth - PLAYER.bandMarginPx;
        this.screenY = Math.floor(depthToScreenY(PLAYER_WORLD_Y));

        // Start centered in the band, fully settled (no step in flight).
        this.currentX = CONFIG.logicalWidth / 2;
        this.stepOriginX = this.currentX;
        this.stepTargetX = this.currentX;
        this.stepElapsedSeconds = 0;
        this.isStepping = false;
        this.lastInputDirection = 0;
    }

    // Puts the player back at its starting position, fully settled. TASK-014
    // calls this (alongside every other system's reset()) to restart a run
    // without reloading the page. Subscribed step listeners are kept - see
    // the stepListeners field comment above.
    reset(): void {
        this.currentX = CONFIG.logicalWidth / 2;
        this.stepOriginX = this.currentX;
        this.stepTargetX = this.currentX;
        this.stepElapsedSeconds = 0;
        this.isStepping = false;
        this.lastInputDirection = 0;
    }

    // Registers a callback to run every time a step finishes. Never called
    // from inside this file today - it exists now so TASK-018 has somewhere
    // to hang a footprint stamp without this file needing to change again.
    onStepComplete(listener: StepCompleteListener): void {
        this.stepListeners.push(listener);
    }

    // Reads input and advances any step in flight. Read input ONLY here,
    // never in render() - see docs/input.md.
    update(deltaSeconds: number): void {
        // Sampled every frame, step or no step - see the field comment above.
        this.lastInputDirection = this.readInputDirection();

        if (this.isStepping) {
            this.advanceStep(deltaSeconds);
            return;
        }

        if (this.lastInputDirection === 0) {
            return; // settled, nothing pressed - stay put
        }

        this.tryStartStep(this.lastInputDirection);
    }

    // Draws the player sprite at its fixed screen row and its current
    // (possibly mid-step) horizontal position. Draws only - no state changes.
    render(): void {
        const screenX = Math.floor(this.currentX); // floor only right before drawing
        BT.drawSprite(this.playerSheet, cellRect(PLAYER_SHEET, 0), new Vector2i(screenX, this.screenY));
    }

    // The player's current position in world space - see Beach.ts's
    // coordinate contract. worldX changes as the player steps; worldY is the
    // fixed constant every other fixed-depth object (the detector rod's
    // base) shares.
    get worldX(): number {
        return this.currentX;
    }

    get worldY(): number {
        return PLAYER_WORLD_Y;
    }

    // The direction of the input currently being read: -1 (left), 1 (right),
    // or 0 (nothing held). This is what Detector.ts swings the rod toward.
    get inputDirection(): InputDirection {
        return this.lastInputDirection;
    }

    // Figures out what the player is being told to do this frame. A HELD
    // pointer (mouse button down, or a finger actually touching the screen)
    // takes priority when it resolves to a direction; the arrow keys/WASD
    // are the fallback whenever nothing is held, never silenced merely by
    // the mouse resting somewhere over the canvas.
    //
    // QA BLOCKING FIX (post-TASK-014 review): the previous implementation
    // read `BT.isPointerActive(0)`, which node_modules/blit386/dist/blit386.d.ts
    // documents as true "while the mouse is hovering inside the canvas" -
    // true the instant the cursor enters the canvas, click or no click, and
    // never false again until it leaves (blit386.js's pointer class only
    // clears it on 'pointerleave'/'pointercancel', never on 'pointerup').
    // That made the player unable to ever stand still on a desktop with the
    // mouse anywhere over the lower play area, and made the arrow keys work
    // only when the mouse was OFF the canvas entirely - see this task's own
    // report for the full trace. `BT.isDown(BT.BTN_POINTER_A, slot)` is the
    // correct check instead: same doc file, "Checks whether a button is
    // currently held" - for a mouse this is the physical left button state
    // (cleared on the real 'pointerup'), and for a touch/pen slot it is
    // "the contact is currently touching the screen" (cleared on release).
    // src/ui/Tap.ts uses the same BTN_POINTER_A constant for its own tap
    // detection, but through isPressed (the one-shot EDGE) rather than
    // isDown (the continuous HELD state read here) - the two files want
    // different things from the same button: a title/results tap fires
    // once; walking needs to keep going for as long as the press lasts.
    private readInputDirection(): InputDirection {
        const heldPointerDirection = this.readHeldPointerDirection();
        if (heldPointerDirection !== null) {
            return heldPointerDirection;
        }

        // Nothing is held on any pointer slot - the keyboard decides, exactly
        // as it always could, regardless of where the mouse cursor happens
        // to be resting.
        if (BT.isDown(BT.BTN_LEFT, 0)) {
            return -1;
        }
        if (BT.isDown(BT.BTN_RIGHT, 0)) {
            return 1;
        }
        return 0;
    }

    // Checks every pointer slot (mouse first, then up to three touch/pen
    // contacts - see POINTER_SLOT_COUNT above) for one that is actually HELD
    // DOWN right now, and turns the first one found into a direction.
    // Returns null - not 0 - when nothing is held at all, so the caller
    // falls through to the keyboard instead of treating "nothing held" the
    // same as "held, but resolves to no direction" (see the dead zone and
    // HUD-band cases below, both of which correctly return 0, not null: a
    // held pointer that resolves to "stand still" must still block the
    // keyboard, exactly like the old mouse-priority behavior did).
    private readHeldPointerDirection(): InputDirection | null {
        for (let slot = 0; slot < POINTER_SLOT_COUNT; slot += 1) {
            if (!BT.isDown(BT.BTN_POINTER_A, slot)) {
                continue; // nothing held on this slot - try the next one
            }

            const pointer = BT.pointerPos(slot);
            // Held inside the reserved HUD band (the counter/watch strip,
            // TASK-013) never counts as movement input - a press on the
            // counter or the watch must never step the player, no matter
            // which half of the screen it lands on. Falls through to try
            // the remaining slots (and, after the loop, the keyboard) rather
            // than returning 0 - a held-but-irrelevant pointer must not
            // silence the keyboard either.
            if (pointer.y < HUD_BAND_HEIGHT_PX) {
                continue;
            }

            const offsetFromCenterPx = pointer.x - CONFIG.logicalWidth / 2;
            if (Math.abs(offsetFromCenterPx) <= PLAYER.pointerDeadZoneHalfWidthPx) {
                return 0; // held, dead-center - stand still (see the dead zone's own comment above)
            }
            return offsetFromCenterPx < 0 ? -1 : 1;
        }
        return null; // nothing held anywhere - let the keyboard decide
    }

    // Starts a new step toward `direction` if - and only if - doing so would
    // actually move the player. Clamping the TARGET (rather than clamping
    // after the fact) is what makes "the player never leaves the band, not
    // even by one pixel" hold even while a direction is held continuously:
    // once clampedX === currentX, every further attempt in that direction is
    // a no-op instead of drifting past the edge one sub-pixel at a time.
    private tryStartStep(direction: -1 | 1): void {
        const proposedX = this.currentX + direction * PLAYER.stepWidthPx;
        const clampedX = Math.min(this.bandMaxX, Math.max(this.bandMinX, proposedX));
        if (clampedX === this.currentX) {
            return; // already pressed against the edge of the band
        }
        this.stepOriginX = this.currentX;
        this.stepTargetX = clampedX;
        this.stepElapsedSeconds = 0;
        this.isStepping = true;
    }

    // Advances the in-flight step by one frame. When it finishes, snaps
    // exactly onto the target (never overshoots due to a long frame) and
    // fires every registered step-complete listener.
    private advanceStep(deltaSeconds: number): void {
        this.stepElapsedSeconds += deltaSeconds;
        if (this.stepElapsedSeconds >= PLAYER.stepDurationSeconds) {
            this.currentX = this.stepTargetX;
            this.isStepping = false;
            this.notifyStepComplete();
            return;
        }
        const t = this.stepElapsedSeconds / PLAYER.stepDurationSeconds;
        this.currentX = this.stepOriginX + (this.stepTargetX - this.stepOriginX) * t;
    }

    private notifyStepComplete(): void {
        for (let i = 0; i < this.stepListeners.length; i += 1) {
            const listener = this.stepListeners[i] as StepCompleteListener;
            listener(this.currentX, PLAYER_WORLD_Y);
        }
    }
}
