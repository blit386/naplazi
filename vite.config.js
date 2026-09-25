import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { blit386 as npmBlit386 } from 'blit386/vite';
import { defineConfig } from 'vite';

// Vite is the little web server that runs your game while you work on it.
// The blit386() plugin makes your edits appear in the running game without
// restarting it, keeping your score and position when possible (hot reload).
//
// naplazi doubles as the test bed for the engine itself: when the blit386
// monorepo sits next to this game, both dev and build use the engine straight
// from its source, so engine edits show up here without publishing. Anywhere
// else (CI, another clone) the npm package is used. Set BLIT386_ENGINE=npm to
// force the npm package locally, or BLIT386_ENGINE_DIR to test an engine in
// another checkout (a worktree's packages/blit386).

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ENGINE_DIR = resolve(__dirname, process.env.BLIT386_ENGINE_DIR ?? '../../blit386/packages/blit386');
const ENGINE_SRC = resolve(ENGINE_DIR, 'src') + sep;
const isLocalEngine = existsSync(resolve(ENGINE_SRC, 'BLIT386.ts')) && process.env.BLIT386_ENGINE !== 'npm';

// Asking for a specific checkout and silently getting the npm engine instead would make any test meaningless.
if (process.env.BLIT386_ENGINE_DIR && !isLocalEngine) {
    throw new Error(`[naplazi] BLIT386_ENGINE_DIR has no engine source at ${ENGINE_DIR} (expected src/BLIT386.ts)`);
}

/**
 * Creates the blit386() plugin from the local engine, so the hot-reload plugin and runtime
 * never drift apart while either is being worked on. Builds the engine's dist/ first when
 * it is missing or older than src/ (the plugin and editor types live there).
 * @returns {Promise<import('vite').Plugin>}
 */
async function localEnginePlugin() {
    const ensure = spawnSync(process.execPath, [resolve(ENGINE_DIR, '../../scripts/ensure-engine-built.mjs')], {
        stdio: 'inherit',
    });

    if (ensure.status !== 0) {
        throw new Error(`[naplazi] building the local blit386 engine failed (exit ${ensure.status})`);
    }

    const { blit386 } = await import(pathToFileURL(resolve(ENGINE_DIR, 'dist/vite.js')).href);

    return blit386();
}

/**
 * Engine source edits cannot hot-swap: re-evaluating engine modules under a running game
 * would create a second engine next to the live one. Reload the page instead.
 * @returns {import('vite').Plugin}
 */
function engineFullReload() {
    return {
        name: 'blit386-engine-reload',
        apply: 'serve',
        hotUpdate(update) {
            if (!update.file.startsWith(ENGINE_SRC)) {
                return;
            }

            update.server.ws.send({ type: 'full-reload' });

            return [];
        },
    };
}

export default defineConfig(async () => {
    console.info(`[naplazi] blit386: ${isLocalEngine ? `local source at ${ENGINE_DIR}` : 'npm package'}`);

    return {
        ...(isLocalEngine && {
            // Regex, not a string key: a plain 'blit386' key would also rewrite 'blit386/vite'.
            resolve: { alias: [{ find: /^blit386$/, replacement: resolve(ENGINE_SRC, 'BLIT386.ts') }] },
        }),
        plugins: isLocalEngine ? [engineFullReload(), await localEnginePlugin()] : [npmBlit386()],
        server: {
            // Open the game in your browser automatically when you run `npm run dev`.
            open: true,
            // The engine lives outside this project; Vite refuses to serve it without this.
            ...(isLocalEngine && { fs: { allow: [__dirname, ENGINE_DIR] } }),
        },
    };
});
