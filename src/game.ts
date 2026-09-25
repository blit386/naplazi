import * as blit386 from 'blit386';

// Color slot numbers. We put real colors into these slots in init(), then draw using the numbers.
// Slot 0 is always transparent, so we start counting at 1.
const COLOR_BACKGROUND = 1;
const COLOR_PADDLE = 2;
const COLOR_ITEM = 3;
const COLOR_TEXT = 4;

// Sizes and speeds. These are the fun knobs to turn. Change a number, save, and watch what happens.
const PADDLE_WIDTH = 48;
const PADDLE_HEIGHT = 8;
const ITEM_SIZE = 10;
const PADDLE_SPEED = 3; // how many pixels the paddle moves each step
const ITEM_FALL_SPEED = 2; // how many pixels a block falls each step
const SPAWN_EVERY = 45; // a new block appears every this many steps (60 steps is about one second)
const STARTING_LIVES = 3;

// A snapshot of the game that a test (or an AI agent driving a browser) can read instead of guessing from pixels.
interface GameState {
    ticks: number;
    score: number;
    lives: number;
    paddle: { x: number; y: number; width: number; height: number };
    items: { x: number; y: number }[];
}

// What the dev build puts on `window.__game`. Open the browser console and type `__game.state()` to try it.
declare global {
    interface Window {
        __game?: {
            state(): GameState;
            frame(): Promise<string>; // the next frame as a PNG data URL, sharp and unscaled by the browser
        };
    }
}

// Read `?seed=1234` from the page address. The same seed makes the blocks fall in the same places every run,
// which is how you replay a bug or give a test a fixed starting point. No seed means a different game every time.
function readSeed(): number | null {
    const raw = new URLSearchParams(window.location.search).get('seed');

    if (raw === null) {
        return null;
    }

    const seed = Number(raw);

    if (!Number.isSafeInteger(seed)) {
        console.warn(`[naplazi] Ignoring ?seed=${raw}: it must be a whole number.`);

        return null;
    }

    return seed;
}

// Turn a PNG blob into a data URL string, which a browser tool can read back out of the page.
function blobToDataURL(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

class Game {
    // How big the screen is. We read the real size in init().
    screen: blit386.Vector2i = new blit386.Vector2i(320, 240);

    // The paddle's initial position.
    paddlePos: blit386.Vector2i = new blit386.Vector2i(0, 0);

    // The blocks falling right now. Each one is a Vector2i holding its top-left corner.
    items: blit386.Vector2i[] = [];

    // The player's score and lives.
    score: number = 0;
    lives: number = STARTING_LIVES;

    async init(): Promise<boolean> {
        // Remember the screen size so the game fits no matter how big it is.
        this.screen = blit386.BT.displaySize;

        // Make a palette (a numbered set of colors) and choose four colors.
        // Color32(red, green, blue) - each value goes from 0 (none) to 255 (full).
        const palette = blit386.BT.paletteCreate(16);

        palette.set(COLOR_BACKGROUND, new blit386.Color32(80, 22, 40));
        palette.set(COLOR_PADDLE, new blit386.Color32(90, 200, 160));
        palette.set(COLOR_ITEM, new blit386.Color32(240, 180, 70));
        palette.set(COLOR_TEXT, new blit386.Color32(235, 240, 255));

        blit386.BT.paletteSet(palette);

        // Put the paddle in the middle, near the bottom.
        this.paddlePos.x = Math.floor((this.screen.x - PADDLE_WIDTH) / 2);
        this.paddlePos.y = this.screen.y - PADDLE_HEIGHT - 6;

        // Out of the box, player 0 steers with WASD and the arrow keys belong to player 1.
        // This game has one player, so let both sets of keys move the paddle.
        blit386.BT.inputMap(0, blit386.BT.BTN_LEFT, 'KeyA', 'ArrowLeft');
        blit386.BT.inputMap(0, blit386.BT.BTN_RIGHT, 'KeyD', 'ArrowRight');

        const seed = readSeed();

        if (seed !== null) {
            blit386.BT.randomSeed(seed);
        }

        // Dev builds only: let tests and AI agents read the game state and grab exact frames.
        // A shipped game (`pnpm run build`) never has `window.__game`.
        if (blit386.BT.isDevMode) {
            window.__game = {
                state: () => ({
                    ticks: blit386.BT.ticks,
                    score: this.score,
                    lives: this.lives,
                    paddle: { x: this.paddlePos.x, y: this.paddlePos.y, width: PADDLE_WIDTH, height: PADDLE_HEIGHT },
                    items: this.items.map((item) => ({ x: item.x, y: item.y })),
                }),
                frame: async () => blobToDataURL(await blit386.BT.captureFrame()),
            };
        }

        return true; // tell the engine that setup worked
    }

    update(): void {
        // BLIT386 supports two ways to move the paddle: pointer input (mouse and touch) and arrow keys.
        // We check the pointer first because it works on phones, tablets, and any computer with a mouse.
        // The "0" you see in BT.isPointerActive(0) and BT.pointerPos(0) means "the first pointer slot."
        // A phone can track several fingers at once; slot 0 is always the first (or only) one.
        if (blit386.BT.isPointerActive(0)) {
            // BT.pointerPos(0) returns a Vector2i: the exact pixel position of the pointer right now.
            // We want the CENTER of the paddle under the pointer, not its left edge.
            // Subtracting half the paddle width shifts it left so it is balanced around the cursor or finger.
            this.paddlePos.x = blit386.BT.pointerPos(0).x - Math.floor(PADDLE_WIDTH / 2);
        } else {
            // No pointer is active - fall back to the arrow keys, A and D (or a connected gamepad).
            // BT.isDown() is true for every frame the button is held down, not just the frame it was pressed.
            if (blit386.BT.isDown(blit386.BT.BTN_LEFT, 0)) {
                this.paddlePos.x -= PADDLE_SPEED;
            }

            if (blit386.BT.isDown(blit386.BT.BTN_RIGHT, 0)) {
                this.paddlePos.x += PADDLE_SPEED;
            }
        }

        // Keep the paddle on the screen no matter how it moved.
        // Math.floor makes sure we store a whole number, not a fraction of a pixel.
        const maxX = this.screen.x - PADDLE_WIDTH;

        if (this.paddlePos.x < 0) {
            this.paddlePos.x = 0;
        }

        if (this.paddlePos.x > maxX) {
            this.paddlePos.x = maxX;
        }

        // Every SPAWN_EVERY steps, drop a new block at a random spot along the top.
        if (blit386.BT.ticks % SPAWN_EVERY === 0) {
            // BT.random instead of Math.random, so a `?seed=` in the address replays the exact same drops.
            const x = blit386.BT.random.int(this.screen.x - ITEM_SIZE);
            this.items.push(new blit386.Vector2i(x, -ITEM_SIZE));
        }

        // The paddle as a rectangle, used to check for catches.
        const paddleRect = new blit386.Rect2i(this.paddlePos.x, this.paddlePos.y, PADDLE_WIDTH, PADDLE_HEIGHT);

        // Move each block down, then decide: caught, missed, or still falling.
        const stillFalling: blit386.Vector2i[] = [];

        for (const item of this.items) {
            item.y += ITEM_FALL_SPEED;

            const itemRect = new blit386.Rect2i(item.x, item.y, ITEM_SIZE, ITEM_SIZE);

            if (paddleRect.isIntersecting(itemRect)) {
                this.score += 1; // the paddle touched it: caught
            } else if (item.y > this.screen.y) {
                this.lives -= 1; // it fell off the bottom: missed
            } else {
                stillFalling.push(item); // still on its way down
            }
        }

        this.items = stillFalling;

        // Out of lives? Start a fresh game.
        if (this.lives <= 0) {
            this.score = 0;
            this.lives = STARTING_LIVES;
            this.items = [];
        }
    }

    render(): void {
        // Paint the background first. This also erases last frame's drawing.
        blit386.BT.clear(COLOR_BACKGROUND);

        // Draw every falling block.
        for (const item of this.items) {
            blit386.BT.drawRectFill(new blit386.Rect2i(item.x, item.y, ITEM_SIZE, ITEM_SIZE), COLOR_ITEM);
        }

        // Draw the paddle.
        blit386.BT.drawRectFill(
            new blit386.Rect2i(this.paddlePos.x, this.paddlePos.y, PADDLE_WIDTH, PADDLE_HEIGHT),
            COLOR_PADDLE,
        );

        // Show the score and lives in the top-left corner.
        blit386.BT.systemPrint(new blit386.Vector2i(6, 6), COLOR_TEXT, `Score ${this.score}`);
        blit386.BT.systemPrint(new blit386.Vector2i(6, 18), COLOR_TEXT, `Lives ${this.lives}`);
    }
}

// Hand the Game class to BLIT386. It builds one game, runs init() once, then update() and render() about 60 times a second.
blit386.bootstrap(Game);
