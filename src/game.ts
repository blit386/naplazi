// naplazi - Beach Detector.
//
// This file is the entry point BLIT386 boots into (see the very bottom of this
// file: bootstrap(Game)). It asks for a portrait screen, turns off the
// engine's debug overlay, builds the day's color palette, loads every sprite
// sheet, and wires together the systems that make up the actual game: the
// scrolling beach, the player, and the detector rod.
//
// TASK-014 adds the last piece the brief in PLAN.md section 7 calls "MVP done": a three-screen state
// machine (title -> play -> results -> restart, looping back to play, never back to title). See
// ScreenState below and update()/render()'s state dispatch for the whole thing - src/ui/TitleScreen.ts
// and src/ui/ResultsScreen.ts own everything about how those two screens look and detect a tap;
// src/ui/HighScore.ts owns the localStorage read/write; this file's only job is to own WHICH screen is
// showing right now and to be the ONE place every system's reset() is called from on a restart.
//
// Every following task in TODO.md adds one more system - time-of-day colors,
// feedback channels, the pickup reveal, and so on - each living in its own
// file under src/ (see the folders next to this one: rng/, palette/, game/,
// hud/, audio/, ui/). This file's job stays small on purpose: wire those
// systems together and hand the result to the engine. Gameplay logic belongs
// in the other files, not here.
//
// Every BLIT386 game is one class with up to four methods, handed to bootstrap():
//   configure() - runs once, before init(); screen size and hardware flags.
//   async init() - runs once, after configure(); load assets, set up colors.
//   update()    - runs ~60 times a second; read input and change state here.
//   render()    - runs ~60 times a second; draw the current state here.
//
// Want to learn more? Read AGENTS.md or the docs/ folder next to this file.

import { BT, bootstrap, type HardwareSettings, Vector2i } from 'blit386';
import { Ambience } from './audio/Ambience';
import { Sfx } from './audio/Sfx';
import { CONFIG } from './config';
import { Beach } from './game/Beach';
import { DayClock } from './game/DayClock';
import { COLLECTION_MODE, Detector } from './game/Detector';
import { Pickup } from './game/Pickup';
import { Player } from './game/Player';
import { Signals } from './game/Signals';
import { Treasures } from './game/Treasures';
import { Counter } from './hud/Counter';
import { Watch } from './hud/Watch';
import { buildPalette, REFERENCE_PHASE, SKY_ZENITH, startPhaseTransition } from './palette/palette';
import { installPlaytestHooks, type PlaytestState, readSeedParam } from './playtest';
import { Rng } from './rng/Rng';
import { loadSpriteSheets, type SpriteSheets } from './sprites';
import { loadHighScore, saveHighScoreIfBetter } from './ui/HighScore';
import { ResultsScreen } from './ui/ResultsScreen';
import { TitleScreen } from './ui/TitleScreen';

// The three screens this game ever shows, and the only three states update()/render() below ever
// dispatch on. There is no way back to 'title' once left (restart goes straight from 'results' to
// 'play' - see restart() below) - PLAN.md section 4.12's screen flow never asks for one.
type ScreenState = 'title' | 'play' | 'results';

class Game {
    // The single random number generator for the whole game. Every system
    // that needs randomness (buried item placement, decoration scatter, ...)
    // receives THIS instance through its own constructor, instead of
    // creating a `new Rng(...)` of its own - see TASK-004 in TODO.md. One
    // shared instance is what makes CONFIG.seed describe an entire run,
    // reproducibly, from the first placed item to the last. A `?seed=N` in the
    // page address (src/playtest.ts) wins over CONFIG.seed, so a test can pick
    // its beach.
    rng: Rng = new Rng(readSeedParam() ?? CONFIG.seed);

    // Every loaded, palette-indexed sprite sheet (see src/sprites.ts). Set
    // once by init() and read by render(); declared with the definite
    // assignment assertion (`!`) because TypeScript cannot see that init()
    // always runs - and always succeeds, per docs/basics.md - before render()
    // ever does.
    sprites!: SpriteSheets;

    // The three world systems built in init() (see below) and driven every
    // frame from update()/render(). Also declared with `!` for the same
    // reason as `sprites` above - they are built once sprites have finished
    // loading, which only init() can await.
    beach!: Beach;
    player!: Player;
    detector!: Detector;

    // Buried items (TASK-010) - built alongside the world systems above.
    // Needs only the shared Rng, not a sprite sheet: buried items are never
    // drawn by this system (see Treasures.ts's header comment) - TASK-017's
    // Pickup.ts is what eventually shows one.
    treasures!: Treasures;

    // The pickup reveal (TASK-017): the centre-screen "look what you found"
    // banner shown the instant Treasures.onCollect() fires. Needs the loaded
    // ITEMS_LARGE_SHEET (see src/sprites.ts), so, like the world systems
    // above, it waits until loadSpriteSheets() has resolved.
    pickup!: Pickup;

    // The detector tick, the pickup chime, and the watch alarm (TASK-011,
    // TASK-012/013). Built with the async create() factory (AudioClip.synth()
    // returns a Promise, so this cannot be a plain field initializer like the
    // systems above) and awaited below, same as sprite loading.
    sfx!: Sfx;

    // The looping background ambience bed (TASK-019): one clip per lighting phase, cross-faded on
    // every phase change and silent until the title-screen tap starts it (see Ambience.ts's own header
    // comment for the full set of decisions this system is built around - no music bus, per-voice
    // volume instead of a bus, no ducking against the detector tick). Built with the async create()
    // factory, same reasoning as `sfx` above.
    ambience!: Ambience;

    // The three feedback channels the beep drives - audio, border pulse, detector blink, haptics
    // (TASK-016). Built right after `sfx` above, since it needs that already-constructed instance to
    // call Sfx.playTick() on (see Signals.ts).
    signals!: Signals;

    // Real time -> game time, phase, pause-on-hidden-tab, end-of-day
    // (TASK-012). Needs no sprite sheet and no Rng - it is a pure clock, not
    // a random or drawn system - so, unlike the fields above, it does not
    // have to wait for anything else in init() and could in principle be a
    // plain field initializer; kept alongside the other `!`-declared systems
    // instead purely for consistency, since every other per-run system here
    // is also reset() alongside it by TASK-014's restart() below.
    dayClock!: DayClock;

    // The bitmap HUD (TASK-013): the collected-item count, top-left, and the
    // digital watch showing the game time, top-right. Both need a loaded sprite
    // sheet, so - like sprites itself - they are built once loadSpriteSheets()
    // resolves, not as field initializers.
    counter!: Counter;
    watch!: Watch;

    // Which of the three screens (see ScreenState above) is currently showing. Starts on 'title' -
    // the very first thing a fresh page load shows - and is the ONE switch update()/render() below
    // dispatch on every frame. Never touched by anything outside this file: TitleScreen.ts and
    // ResultsScreen.ts only ever report "was I tapped" (a boolean), they do not know this field
    // exists, exactly like Treasures.ts/DayClock.ts not knowing Sfx exists (see their own onCollect()/
    // onDayEnd() doc comments).
    screenState: ScreenState = 'title';

    // TASK-019: set the instant a title tap (or a restart) means "the ambience bed should be
    // playing", and cleared the instant it actually starts - see the 'play' branch of update() below.
    //
    // WHY THIS CANNOT JUST BE A DIRECT `this.ambience.start(...)` CALL ON THE TAP FRAME ITSELF (this
    // was tried first, and empirically produced total silence - verified by capturing zero
    // AudioBufferSourceNode.start() calls in a real browser): BT.isAudioUnlocked does NOT flip true
    // synchronously inside the same 'pointerdown' handler that begins unlocking - the engine's own
    // unlock() (node_modules/blit386/dist/blit386.js) sets an `isUnlocking` flag and only sets
    // `unlocked = true` after `await audioContext.resume()` settles, at least one microtask later than
    // the synchronous tap-detection code in TitleScreen.ts/this file's own update() runs. BT.soundPlay
    // called while still merely "isUnlocking" (not yet "unlocked") is silently dropped, per
    // docs/audio.md - and unlike BT.musicPlay, a dropped BT.soundPlay call is not remembered or
    // retried automatically. Sfx.ts's own tick/collect/alarm sounds never hit this: nothing in this
    // codebase calls BT.soundPlay on the exact SAME frame a screen-transition tap is detected (the
    // 'title'/'results' branches below return immediately after detecting a tap - see their own
    // comments), so every one of THEIR sounds naturally waits at least until the NEXT update() call,
    // by which point resume() has essentially always settled. Ambience is different only because
    // starting it needs to happen as close to "the moment Play begins" as possible - so instead of
    // gambling on one frame being enough, this flag is checked EVERY 'play' frame until
    // BT.isAudioUnlocked genuinely reads true, however many frames that takes.
    private ambiencePendingStart = false;

    // The title and results screens (TASK-014) - both need a loaded sprite sheet (the new icons.png,
    // see src/sprites.ts), so - like the world systems and the HUD above - they are built once
    // loadSpriteSheets() resolves, not as field initializers.
    titleScreen!: TitleScreen;
    resultsScreen!: ResultsScreen;

    // The best collected-item count this browser has ever recorded, persisted across reloads via
    // src/ui/HighScore.ts (which itself survives a missing/corrupt/throwing localStorage - see that
    // file). Loaded once in init() (so there is something sane to show even before this browser has
    // ever finished a run) and updated again every time a run ends - see the DayClock.onDayEnd()
    // listener in init() below.
    highScore!: number;

    configure(): Partial<HardwareSettings> {
        return {
            // Portrait logical resolution, read from config rather than typed
            // here as magic numbers - see src/config.ts for what changing
            // these does.
            displaySize: new Vector2i(CONFIG.logicalWidth, CONFIG.logicalHeight),
            targetFPS: 60,
            // The engine's debug overlay (FPS counter, palette grid, backend
            // name, ...) is ON by default and draws on top of everything
            // render() produces. This game draws its own bitmap HUD
            // (TASK-013), so the built-in overlay has to stay off or it would
            // cover it.
            isOverlayEnabled: false,
            // Ask the browser to lock the screen to portrait after startup.
            // Not every browser honors this - iOS Safari ignores it, for
            // example - see docs/basics.md ("Phones and screen orientation").
            preferredOrientation: 'portrait',
            // The player moves by tapping and dragging on the canvas; without
            // this flag a touch-drag would also try to scroll the host page
            // underneath the game.
            isCapturingPointerScroll: true,
            // The player can also move with the arrow keys; without this flag
            // the browser would scroll the page on every arrow-key press
            // instead of only moving something inside the game.
            isCapturingKeyboardScroll: true,
        };
    }

    async init(): Promise<boolean> {
        // The engine's built-in default keyboard map for player 0 (the only
        // player this game has) is WASD, not the arrow keys - arrow keys are
        // the default for player 1 only (see
        // node_modules/blit386/dist/blit386.js, the two per-player default
        // tables). TASK-008 promises the arrow keys work "as a fallback", so
        // add them alongside WASD rather than instead of it: BT.inputMap
        // REPLACES a button's whole key list (see blit386.d.ts), so both the
        // default key and the arrow key are named on every call, or the
        // default would silently stop working. Safe to call every init() run
        // (hot reload can re-run this): it always sets the same two lists.
        BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft');
        BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight');

        // Build the palette for the phase the game starts in (see
        // src/palette/palette.ts for the full slot layout - sky/sand/object
        // ramps plus HUD slots) and hand it to the engine. TASK-015's
        // startPhaseTransition() (wired below, via dayClock.onPhaseChange())
        // fades the world-ramp slots toward the next phase's colors as
        // the day clock advances; the HUD slots never move.
        const palette = buildPalette(REFERENCE_PHASE);
        BT.paletteSet(palette);

        // Load every sprite sheet (see src/sprites.ts) and match each one's
        // pixels to this exact palette by color (`sheet.indexize(palette)`,
        // called inside loadSpriteSheets). This is the only place any of
        // this happens - loading and indexing a sheet is much too slow to
        // repeat 60 times a second, so it must be awaited here in init(),
        // never in update() or render().
        this.sprites = await loadSpriteSheets(palette);

        // Build the world systems now that their sprite sheets are ready.
        // The shared Rng goes to Beach only - Player and Detector are both
        // deterministic functions of input, so they need no randomness of
        // their own (see TASK-004's rule: never construct a second Rng).
        this.beach = new Beach(this.rng, this.sprites.decorations, this.sprites.footprint);
        this.player = new Player(this.sprites.player);
        this.detector = new Detector(this.sprites.detectorHead);
        this.treasures = new Treasures(this.rng);

        // The pickup reveal (TASK-017) - needs the loaded ITEMS_LARGE_SHEET,
        // so it is built here alongside the other sprite-backed systems
        // rather than as a field initializer.
        this.pickup = new Pickup(this.sprites.itemsLarge);

        // The day clock (TASK-012) - needs neither a sprite sheet nor the
        // shared Rng, so it could have been a plain field initializer, but
        // is built here for the same "every per-run system is constructed
        // in one place" consistency as everything above.
        this.dayClock = new DayClock();

        // The bitmap HUD (TASK-013) - both widgets need a loaded sprite
        // sheet, so, like the world systems above, they wait until
        // loadSpriteSheets() has resolved.
        this.counter = new Counter(this.sprites.digits);
        this.watch = new Watch(this.sprites.watch, this.sprites.digits);

        // The title and results screens (TASK-014) - both need the new icons sheet, so, like the HUD
        // above, they wait until loadSpriteSheets() has resolved.
        this.titleScreen = new TitleScreen(this.sprites.icons);
        this.resultsScreen = new ResultsScreen(this.sprites.digits, this.sprites.icons);

        // Read whatever this browser already remembers (0 if nothing, or if localStorage is
        // unavailable/corrupt - see src/ui/HighScore.ts) so the very first results screen this run
        // could ever reach already has a real number to compare against, not a placeholder.
        this.highScore = loadHighScore();

        // Synthesizing the three clips is asynchronous - see Sfx.create()'s
        // own comment for why it cannot happen in a field initializer like
        // the systems above, and why it still has to be awaited here in
        // init() rather than update()/render().
        this.sfx = await Sfx.create();

        // The background ambience bed (TASK-019) - synthesizing its three phase clips is asynchronous
        // for the same reason Sfx.create() above is, so it is awaited here too, never in update()/
        // render(). Building the clips does not start any playback - see Ambience.ts's own create()
        // doc comment - so this line alone cannot make a sound before the title tap.
        this.ambience = await Ambience.create();

        // The three feedback channels (TASK-016) - built right after Sfx since it needs that already-
        // constructed instance to call Sfx.playTick() on (see Signals.ts's constructor).
        this.signals = new Signals(this.sfx);

        // Wire the collection event to the pickup sound. Treasures.ts never
        // imports or knows Sfx exists (see its onCollect() doc comment) -
        // this is the one place the two get introduced.
        this.treasures.onCollect(() => {
            this.sfx.playCollectSound();
        });

        // TASK-017: a second, independent onCollect() listener for the
        // centre-screen reveal - Treasures.ts supports more than one
        // subscriber (collectListeners is a plain array, see that file), so
        // this does not disturb the sound listener registered just above.
        // Only `kind` is used here - the reveal is a fixed screen-space
        // overlay with no worldX/worldY of its own (see Pickup.ts's own
        // header comment for why), so worldX/worldY are deliberately left
        // unnamed parameters rather than plumbed through for nothing.
        this.treasures.onCollect((_worldX, _worldY, kind) => {
            this.pickup.spawn(kind);
        });

        // TASK-018: stamp a footprint every time a side-step finishes.
        // Player.ts never imports Beach.ts for this - onStepComplete() was
        // built specifically so an outside listener could react to a
        // finished step (see that method's own doc comment in Player.ts) -
        // and Beach.ts owns the world's scroll and its other world-space
        // object pools (decorations), so a footprint - which scrolls exactly
        // like a decoration piece - belongs alongside them rather than as a
        // separate system of its own. See Beach.ts's stampFootprint() doc
        // comment for the full reasoning on why footprint storage lives
        // there and not in Player.ts.
        this.player.onStepComplete((worldX, worldY) => {
            this.beach.stampFootprint(worldX, worldY);
        });

        // Wire the day clock's phase-change event to the palette fade (TASK-015): every time the clock
        // crosses into a new phase, fade the world ramp toward that phase's colors. DayClock.ts never
        // imports or knows palette.ts exists (see its own onPhaseChange() doc comment) - the same
        // "introduced only here" pattern as every other cross-system wiring in this method. The second
        // argument DayPhaseChangeListener also carries (dayProgress) is not needed here, so this
        // callback only names the first parameter, `phase`.
        // TASK-019: the same listener also cross-fades the ambience bed toward the new phase's clip,
        // so the color change and the background sound change begin on the exact same frame (see
        // Ambience.ts's crossfadeTo() for why its own fade is shorter than the palette's).
        this.dayClock.onPhaseChange((phase) => {
            startPhaseTransition(phase);
            this.ambience.crossfadeTo(phase);
        });

        // Wire the end-of-day event to the watch alarm AND to the Play -> Results transition, the same
        // "src/game.ts is the one place two systems that do not know about each other get introduced"
        // pattern as Treasures.onCollect() -> Sfx.playCollectSound() just above. DayClock.ts never
        // imports or knows Sfx, HighScore.ts, or screenState exist (see its own onDayEnd() doc
        // comment) - all three only ever happen because THIS listener says so, once, right here.
        //
        // The high-score comparison and the screen switch happen together, in this one listener, so
        // they can never fall out of step with each other - a results screen that briefly shows a
        // stale best score, or a best-score update that lands on some other frame than the actual
        // transition, are both ruled out by construction rather than by careful ordering elsewhere.
        this.dayClock.onDayEnd(() => {
            this.sfx.playWatchAlarm();
            // TASK-019: the ambience bed must stop the instant Play hands off to Results, not linger
            // into the results screen (see Ambience.ts's stop()) - so it stops right alongside every
            // other end-of-day effect in this same listener, not on some later frame.
            this.ambience.stop();
            this.highScore = saveHighScoreIfBetter(this.treasures.collectedCount);
            this.screenState = 'results';
        });

        // Dev builds only: let tests and AI agents read the game state and grab exact frames
        // (src/playtest.ts). A shipped game never has window.__game.
        installPlaytestHooks(() => this.playtestState());

        return true; // tell the engine that setup worked
    }

    // The snapshot window.__game.state() returns. Reads only public getters, changes nothing.
    private playtestState(): PlaytestState {
        const nearest = this.treasures.nearestDistancePx;

        return {
            ticks: BT.ticks,
            screen: this.screenState,
            seed: this.rng.seed,
            collected: this.treasures.collectedCount,
            highScore: this.highScore,
            dayProgress: this.dayClock.dayProgress,
            gameTimeMinutes: this.dayClock.gameTimeMinutes,
            phase: this.dayClock.phase,
            dayEnded: this.dayClock.hasEnded,
            player: { x: this.player.worldX, y: this.player.worldY },
            detectorHead: { x: this.detector.headWorldX, y: this.detector.headWorldY },
            nearestTreasurePx: Number.isFinite(nearest) ? nearest : null,
        };
    }

    update(): void {
        // The state dispatch TASK-014 adds: exactly one of the three branches below runs per frame,
        // chosen by screenState, and every branch either returns or falls through on its own - never
        // more than one branch's logic executes for a single update() call. That single property is
        // what keeps "the tap that just switched screenState to 'play'" and "this frame's world
        // update" from ever running in the SAME update() call: the 'title' branch below returns
        // immediately after detecting that tap, so the world-update code at the bottom of this method
        // simply never runs on the frame the transition happens (see TODO.md TASK-014's own
        // blocking-risk note: "a new screen must not process the very same tap"). The world only ever
        // starts moving on the NEXT frame - a frame with no pending tap edge left to misread as input.
        if (this.screenState === 'title') {
            // The world (beach/player/detector/day/...) intentionally does NOT update while the title
            // is up - TODO.md TASK-014 requires it stay frozen, and TitleScreen.ts's own blink-timer
            // animation is the only thing here that advances.
            if (this.titleScreen.update(BT.deltaSeconds)) {
                this.screenState = 'play';
                // TASK-019: request the ambience bed - do NOT call this.ambience.start() directly
                // here. This tap is the same user gesture that starts unlocking audio, but the
                // unlock itself finishes asynchronously (see ambiencePendingStart's own field
                // comment above) - the 'play' branch below actually starts it, once
                // BT.isAudioUnlocked confirms the unlock has genuinely completed.
                this.ambiencePendingStart = true;
            }
            return;
        }

        if (this.screenState === 'results') {
            // Same freeze as 'title' above: the day stays parked at its final minute, the beach stops
            // scrolling, nothing recycles - until the player taps the dedicated restart button.
            if (this.resultsScreen.update()) {
                this.restart();
            }
            return;
        }

        // screenState === 'play' from here on - the ordinary per-frame update this game has always
        // done. Read BT.deltaSeconds once per frame and hand the same value to every system, rather
        // than each system reading the property itself - one read, one number, shared by everyone that
        // needs it this frame. Never derive timing from a count of update() calls (the engine can run
        // update() more than once, or not at all, for a given rendered frame - see CLAUDE.md).
        const deltaSeconds = BT.deltaSeconds;

        // TASK-019: actually start the ambience bed the first 'play' frame BT.isAudioUnlocked reads
        // true after a title tap or a restart requested it (see ambiencePendingStart's own field
        // comment for why this cannot happen on the requesting frame itself). Checked every frame
        // rather than just once, since exactly how many frames the browser's own audio-context resume
        // takes is not something this code controls.
        if (this.ambiencePendingStart && BT.isAudioUnlocked) {
            this.ambience.start(this.dayClock.phase);
            this.ambiencePendingStart = false;
        }

        // The day clock first - it depends on nothing else this frame, and
        // everything else may eventually want to read this frame's phase or
        // react to this frame's end-of-day event (see DayClock.ts).
        this.dayClock.update(deltaSeconds);
        if (this.dayClock.hasEnded) {
            // The day just ended, THIS frame - dayClock.update() above already fired onDayEnd() (see
            // the listener wired in init(), which flips screenState to 'results' and stores the high
            // score) before returning. Checking DayClock's own hasEnded getter here - rather than
            // re-reading this.screenState - is deliberate: it is the actual source-of-truth signal
            // (DayClock.ts's own doc comment on hasEnded anticipates exactly this use), and it sidesteps
            // any question of whether TypeScript would still consider this.screenState narrowed to
            // 'play' after the call above (a callback reached through it could have changed it).
            //
            // Stop right here instead of letting the rest of this same update() call keep moving the
            // player/beach/detector for one more tick after the world is already supposed to be frozen
            // - the day ending and the world freezing happen on the exact same frame, not one frame
            // apart.
            return;
        }

        // World scroll first, then the player (which reads input), then the
        // detector (which needs the player's freshly-updated position and
        // input direction) - each system's update() only depends on systems
        // that already ran this frame.
        this.beach.update(deltaSeconds);
        this.player.update(deltaSeconds);
        this.detector.update(deltaSeconds, this.player.worldX, this.player.inputDirection);

        // The point that does the digging - the detector head, or the
        // player's own body - chosen by COLLECTION_MODE (see Detector.ts,
        // PLAN.md section 4.6). Computed here, once a frame, rather than
        // inside Treasures itself, so Treasures.ts stays a plain "distance
        // to a point" system with no opinion of its own about which point
        // that is.
        const collectorWorldX = COLLECTION_MODE === 'head' ? this.detector.headWorldX : this.player.worldX;
        const collectorWorldY = COLLECTION_MODE === 'head' ? this.detector.headWorldY : this.player.worldY;
        this.treasures.update(deltaSeconds, collectorWorldX, collectorWorldY);

        // Sfx reads the distance Treasures just computed above to decide
        // whether - and how fast - to beep this frame. Must run AFTER
        // treasures.update(), or it would be reacting to last frame's
        // distance instead of this one's.
        this.sfx.update(deltaSeconds, this.treasures.nearestDistancePx);

        // Signals reads Sfx.didBeepThisFrame (just set above) to decide whether this is the frame the
        // border pulse/detector blink/haptics/tick should all fire on - see Signals.ts. Must run AFTER
        // sfx.update(), for the same reason sfx.update() itself had to run after treasures.update().
        this.signals.update(deltaSeconds);

        // TASK-017: advances every in-flight pickup reveal (hold, then slide, then discard). Does not
        // depend on anything else run this frame - a reveal's own elapsed-time clock is independent of
        // the detector/beep/signals timing above - but is called last among the per-frame systems purely
        // so a reveal spawned by treasures.update() earlier in THIS SAME frame still gets its very first
        // update() tick before render() draws it, instead of sitting one full frame behind.
        this.pickup.update(deltaSeconds);
    }

    render(): void {
        // A safety-net clear before anything else draws (see docs/drawing.md,
        // "Clear the screen first"). Beach.render() below already paints
        // sky and sand across the full canvas every frame, so in practice
        // this color is never actually visible - it only matters if that
        // ever stops being true.
        BT.clear(SKY_ZENITH);

        // Draw back-to-front: sky and sand and decoration (Beach), then the
        // player standing on top of the sand, then the detector rod reaching
        // out from the player. Buried items are never drawn here - they stay
        // hidden under the sand until TASK-017's pickup reveal shows one.
        //
        // Drawn in EVERY screen state, not just 'play' - during 'title' and 'results' their own
        // update() never runs (see update() above), so this simply redraws whatever frozen frame they
        // were last left in: the fresh, just-reset world before the very first Play, or the exact
        // moment the day ended, right before Results replaces the ordinary HUD below. A frozen beach
        // reads as a deliberate backdrop, not a blank/broken screen.
        this.beach.render();
        // TASK-017: drawn BEFORE the player on purpose - see Pickup.ts's own render() doc comment. The
        // reveal's own safe-band clamp already keeps it from ever reaching the player's row, but drawing
        // order is a second, belt-and-braces guarantee that a reveal can never visually cover the player
        // even if a future CONFIG tuning change ever narrowed that band.
        this.pickup.render();
        this.player.render();
        // TASK-016: the detector tip's "just beeped" highlight only ever has a nonzero intensity while
        // screenState === 'play' - this.signals.update() (which is what decays it back toward 0) never
        // even runs during 'title'/'results' (see update() above) - so passing 0 explicitly here, in
        // those two states, keeps the frozen title/results backdrop from showing a stale highlight left
        // over from the instant the day ended.
        this.detector.render(this.screenState === 'play' ? this.signals.detectorBlinkIntensity : 0);

        if (this.screenState === 'title') {
            this.titleScreen.render();
            return;
        }

        if (this.screenState === 'results') {
            this.resultsScreen.render(this.treasures.collectedCount, this.rng.seed, this.highScore);
            return;
        }

        // The bitmap HUD (TASK-013) is drawn LAST, on top of everything
        // above, so the counter and the watch are never hidden behind the
        // beach or the player. Zero text anywhere - see Counter.ts/Watch.ts.
        this.counter.render(this.treasures.collectedCount);
        this.watch.render(this.dayClock.gameTimeMinutes);

        // The border pulse (TASK-016) is drawn last of all, on top of the HUD - it is a screen-edge
        // accent meant to catch the eye even more than the HUD itself, and most frames it draws nothing
        // at all (see Signals.render(), which bails out immediately while no pulse is decaying).
        this.signals.render();
    }

    // Restarts a full run in place - no page reload, and no `new Beach(...)`/`new Player(...)`/etc.
    // (see TODO.md TASK-014's own blocking-risk note: DayClock.ts in particular holds a
    // 'visibilitychange' listener through a module-level AbortController, so a second constructed
    // instance would leave the FIRST one's listener still attached and dead, silently breaking
    // pause-on-hidden-tab for the rest of the page's life). Called from update()'s 'results' branch
    // above, the instant the player taps the restart button - never from render().
    private restart(): void {
        // Re-seed BEFORE any system rebuilds its pool from the shared Rng - Beach.reset() and
        // Treasures.reset() below both draw their fresh layout by calling this.rng.next()/nextInt()
        // internally, so whichever seed is live at the moment THEY run is the seed that decides the
        // next beach. Order matters here exactly the way it matters in init(): one shared Rng, always
        // read after it is in the state you want (see src/rng/Rng.ts's own "ONE INSTANCE PER GAME"
        // header note).
        if (CONFIG.reseedOnRestart) {
            // A fresh seed, drawn from THIS SAME shared Rng rather than Math.random() - TODO.md
            // TASK-004's own completion checklist is explicit that Math.random() must never appear
            // anywhere in src/, precisely so a run stays fully reproducible end to end. The state this
            // reads from has already advanced through an entire day's worth of calls (every buried
            // item placement and every recycle this run made), so the number it produces is, in every
            // practical sense, "new" - while staying entirely inside this one deterministic generator,
            // never reaching for an outside source of randomness.
            const nextSeed = this.rng.nextInt(1, 1_000_000_000);
            this.rng.reset(nextSeed);
        } else {
            // No argument - replay the CURRENT seed's sequence from the top. See Rng.reset()'s own doc
            // comment: this is what proves CONFIG.reseedOnRestart === false reproduces the exact same
            // beach, item for item (TODO.md TASK-014's own completion checklist).
            this.rng.reset();
        }

        // Every system that owns per-run state gets ITS OWN reset() call, on the exact same instance
        // constructed back in init() - never a fresh `new` anything. This list is deliberately
        // exhaustive: TODO.md TASK-014 calls out "restart must reset absolutely everything" as a
        // blocking risk in its own right - a system left out here would make the SECOND run start
        // mid-day, mid-step, or mid-beep instead of at a clean 06:00.
        this.beach.reset();
        this.player.reset();
        this.detector.reset();
        this.treasures.reset();
        this.pickup.reset();
        this.sfx.reset();
        this.ambience.reset();
        this.signals.reset();
        this.dayClock.reset();

        // Defensively undo any palette effect that might be mid-flight and reassert the exact
        // reference-phase palette. TASK-015's palette fade (src/palette/palette.ts's startPhaseTransition())
        // is the only code in this project that ever starts one, and this task's own blocking-risk note
        // already called out "an unfinished transition at the moment of restart" as something a working
        // restart must guard against - which is exactly what this pair of calls does. paletteSet() here is
        // a same-layout, same-colors swap (see palette.ts's own header comment) - it never requires
        // BT.spritesRefresh(), which every sprite-indexing file in this project warns must never follow a
        // value-only change. That said, THIS call WILL print "[BT] Active palette structure changed. Call
        // BT.spritesRefresh()..." to the console: that warning fires unconditionally whenever at least one
        // sheet is already loaded (see AGENTS.md's "Your notes" for where this is traced in the engine),
        // regardless of whether the layout actually changed - and by the time restart() runs, every sheet
        // has long since loaded. (init()'s own BT.paletteSet() call above, by contrast, runs BEFORE
        // loadSpriteSheets() - no sheet is loaded yet at that point - so it does not print this warning;
        // only this restart() call does.) It is expected noise here, not a sign spritesRefresh() should
        // be called.
        BT.paletteClearEffects();
        BT.paletteSet(buildPalette(REFERENCE_PHASE));

        // TASK-019: request the ambience bed for the new run, the same way the very first title tap
        // does (see ambiencePendingStart's own field comment) - the 'play' branch of update() actually
        // starts it on the next tick, once BT.isAudioUnlocked confirms it (audio was unlocked long ago,
        // back at the very first title tap, and stays unlocked for the rest of the page's life, so in
        // practice this fires on the very next frame with no perceptible delay). dayClock.reset() above
        // already put the phase back to 'morning', and ambience.reset() just above guaranteed no
        // leftover voice from the previous run is still fading.
        this.ambiencePendingStart = true;

        this.screenState = 'play';
    }

    // Optional hot-reload hook (engine 1.4.0+). The blit386() Vite plugin
    // calls this after a save that re-runs init() (a "reinit", see
    // AGENTS.md), so state that init() would otherwise reset - like the RNG
    // below, or the score once it exists - can be carried across the edit.
    // Leave it commented until a system actually needs it.
    // Full detail: docs/hot-reload.md
    //
    // onHotReload(context: { reason: string; snapshot?: Record<string, unknown> }): void {
    //     // Only restore after a re-init (not after a method-only swap).
    //     if (context.reason !== 'reinit' || !context.snapshot) {
    //         return;
    //     }
    //     // Example: keep replaying the same beach across an init() edit
    //     // instead of silently re-rolling it mid-session.
    //     if (context.snapshot.rng instanceof Rng) {
    //         this.rng = context.snapshot.rng;
    //     }
    // }
}

// Hand the Game class to BLIT386. It builds one instance, runs init() once,
// then calls update() and render() about 60 times a second.
bootstrap(Game);
