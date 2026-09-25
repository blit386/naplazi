#!/usr/bin/env node
// Play-test the game from a terminal: open it in the Chrome (or Edge) already on this computer, run a list of
// steps (hold keys, wait, read the game state, save frames), and print one JSON line per step.
// Made for AI agents that cannot drive a browser themselves (Cursor, Claude Code in a terminal), and handy for people.
// Run `pnpm run play -- --help` for the full list.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const HELP = `Usage: pnpm run play -- [options] <step> [<step> ...]

Starts the dev server, opens the game in a real browser, runs the steps in order, and prints one JSON line per step.
Exits with code 1 if the page logged an error or a step failed.

Options:
  --seed <n>          Same seed, same beach: the treasures are buried in the same places every run.
  --url <url>         Use a dev server that is already running instead of starting one.
  --backend software  Force the Canvas 2D renderer instead of WebGPU.
  --headed            Show the browser window instead of running it hidden.
  --help              Show this text.

Steps (keys use KeyboardEvent.code names: ArrowLeft, KeyA, Space, Enter, ...):
  wait:<ms>           Let the game run for <ms> milliseconds.
  press:<key>         Tap a key.
  hold:<key>:<ms>     Hold a key down for <ms> milliseconds.
  move:<x>:<y>        Move the mouse to game pixel (x, y).
  click:<x>:<y>       Click at game pixel (x, y), holding the button for 100 ms so the game sees it.
  state               Print window.__game.state() (or BT.ticks if the game has no __game).
  shot[:<file.png>]   Save the current frame, sharp and unscaled by the browser (default: screenshots/tick-<n>.png).
  eval:<expression>   Print the result of a JavaScript expression run in the game page (BT is available).

Example:
  pnpm run play -- --seed 42 wait:1000 state hold:ArrowLeft:500 state shot`;

const BROWSERS = ['chrome', 'msedge']; // tried in this order; we use what the computer already has

// The game reads the mouse button once per step (1/60 s). A click that is over sooner than that is never seen,
// so `click` holds the button down for a few steps.
const CLICK_HOLD_MS = 100;

// npm drops the `--` in `npm run play -- ...`, pnpm passes it along; skip it either way.
const argv = process.argv.slice(2);

const { values: options, positionals: steps } = parseArgs({
    args: argv[0] === '--' ? argv.slice(1) : argv,
    allowPositionals: true,
    options: {
        seed: { type: 'string' },
        url: { type: 'string' },
        backend: { type: 'string' },
        headed: { type: 'boolean', default: false },
        help: { type: 'boolean', default: false },
    },
});

if (options.help || steps.length === 0) {
    console.log(HELP);
    process.exit(options.help ? 0 : 1);
}

if (options.seed !== undefined && !Number.isSafeInteger(Number(options.seed))) {
    fail(`--seed must be a whole number, got "${options.seed}".`);
}

if (options.backend !== undefined && options.backend !== 'software') {
    fail(`--backend only accepts "software", got "${options.backend}".`);
}

const print = (line) => console.log(JSON.stringify(line));

function fail(message) {
    console.error(`play: ${message}`);
    process.exit(1);
}

function toNumber(text, what) {
    const value = Number(text);

    if (text === undefined || text === '' || !Number.isFinite(value)) {
        throw new Error(`${what} must be a number, got "${text ?? ''}".`);
    }

    return value;
}

async function launchBrowser() {
    for (const channel of BROWSERS) {
        try {
            return await chromium.launch({ channel, headless: !options.headed });
        } catch {
            // not installed - try the next one
        }
    }

    fail('Could not find Google Chrome or Microsoft Edge on this computer. Install one of them and try again.');
}

// Game pixel (x, y) -> page position, so steps can use the same coordinates as the game's draw calls.
async function toPagePoint(page, x, y) {
    return page.evaluate(
        ([gx, gy]) => {
            const rect = document.querySelector('canvas').getBoundingClientRect();
            const size = window.BT.displaySize;

            return { x: rect.left + ((gx + 0.5) * rect.width) / size.x, y: rect.top + ((gy + 0.5) * rect.height) / size.y };
        },
        [x, y],
    );
}

async function runStep(page, step) {
    const [name, ...args] = step.split(':');

    switch (name) {
        case 'wait':
            await page.waitForTimeout(toNumber(args[0], 'wait time'));
            return undefined;
        case 'press':
            await page.keyboard.press(args[0]);
            return undefined;
        case 'hold':
            await page.keyboard.down(args[0]);
            await page.waitForTimeout(toNumber(args[1], 'hold time'));
            await page.keyboard.up(args[0]);
            return undefined;
        case 'move':
        case 'click': {
            const point = await toPagePoint(page, toNumber(args[0], 'x'), toNumber(args[1], 'y'));

            await (name === 'move'
                ? page.mouse.move(point.x, point.y)
                : page.mouse.click(point.x, point.y, { delay: CLICK_HOLD_MS }));
            return undefined;
        }
        case 'state':
            return page.evaluate(() => (window.__game ? window.__game.state() : { ticks: window.BT.ticks }));
        case 'shot': {
            const { ticks, dataURL } = await page.evaluate(async () => {
                const blob = await window.BT.captureFrame();
                const url = await new Promise((resolve, reject) => {
                    const reader = new FileReader();

                    reader.onload = () => resolve(String(reader.result));
                    reader.onerror = () => reject(reader.error);
                    reader.readAsDataURL(blob);
                });

                return { ticks: window.BT.ticks, dataURL: url };
            });
            const file = args.join(':') || `screenshots/tick-${ticks}.png`;

            await mkdir(dirname(file), { recursive: true });
            await writeFile(file, Buffer.from(dataURL.split(',')[1], 'base64'));
            return { file };
        }
        case 'eval':
            // biome-ignore lint/security/noGlobalEval: running the caller's own expression in their local game page is the point of this step
            return page.evaluate((expression) => globalThis.eval(expression), args.join(':'));
        default:
            throw new Error(`Unknown step "${step}". Run with --help to see the steps.`);
    }
}

const server = options.url ? null : await createServer({ server: { port: 0, open: false } });

let browser;
let exitCode = 0;

try {
    if (server) {
        await server.listen();
    }

    const url = new URL(options.url ?? server.resolvedUrls.local[0]);

    if (options.seed !== undefined) {
        url.searchParams.set('seed', options.seed);
    }

    if (options.backend) {
        url.searchParams.set('backend', options.backend);
    }

    browser = await launchBrowser();

    const page = await browser.newPage({ viewport: { width: 960, height: 720 } });
    const errors = [];

    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
        const source = message.location().url;

        // A missing favicon is the browser's business, not a game error.
        if (message.type() === 'error' && !source.endsWith('/favicon.ico')) {
            errors.push(source ? `${message.text()} (${source})` : message.text());
        }
    });

    await page.goto(url.href);

    // The engine puts BT on the page in dev builds; wait until the game loop has run at least once.
    await page
        .waitForFunction(
            () => {
                try {
                    return window.BT.ticks > 0;
                } catch {
                    return false;
                }
            },
            null,
            { timeout: 20_000 },
        )
        .catch(() => {
            throw new Error(`The game did not start within 20 seconds at ${url.href}. Is it a dev build?`);
        });

    // Send keys to the game, not the page. Focus instead of a click, so the pointer stays out of the way.
    await page.focus('canvas');

    print({
        step: 'ready',
        result: await page.evaluate(() => ({ backend: window.BT.activeBackend, ticks: window.BT.ticks })),
        url: url.href,
    });

    for (const step of steps) {
        try {
            print({ step, result: await runStep(page, step) });
        } catch (error) {
            print({ step, error: error.message.split('\n')[0] }); // the first line says what went wrong; the rest is a stack
            exitCode = 1;
            break;
        }
    }

    if (errors.length > 0) {
        exitCode = 1;
    }

    print({ step: 'done', errors });
} catch (error) {
    print({ step: 'failed', error: error.message });
    exitCode = 1;
} finally {
    await browser?.close();
    await server?.close();
}

process.exit(exitCode);
