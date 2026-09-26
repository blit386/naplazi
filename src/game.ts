/**
 * Entry point. Builds the palette, loads the sprite sheets, constructs every system, wires their
 * events together, and drives the title / play / results state machine. Gameplay logic lives in the
 * other files; this is the only place two systems ever meet.
 */

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
import { installPlaytestHooks, type PlaytestState } from './playtest';
import { loadSpriteSheets, type SpriteSheets } from './sprites';
import { loadHighScore, saveHighScoreIfBetter } from './ui/HighScore';
import { ResultsScreen } from './ui/ResultsScreen';
import { TitleScreen } from './ui/TitleScreen';

/** 'title' is never returned to: restart goes straight from 'results' to 'play'. */
type ScreenState = 'title' | 'play' | 'results';

class Game {
    /**
     * Every system is built in init() once the sprite sheets have loaded. The `!` assertions exist
     * because TypeScript cannot see that init() always runs before update()/render().
     */
    sprites!: SpriteSheets;

    beach!: Beach;

    player!: Player;

    detector!: Detector;

    treasures!: Treasures;

    pickup!: Pickup;

    /** Built by async create() factories: AudioClip.synth returns a Promise. */
    sfx!: Sfx;

    ambience!: Ambience;

    /** Needs the constructed Sfx, so it is built right after it. */
    signals!: Signals;

    dayClock!: DayClock;

    counter!: Counter;

    watch!: Watch;

    /** The only switch update()/render() dispatch on. */
    screenState: ScreenState = 'title';

    /**
     * Set when a title tap or a restart wants the ambience bed running; cleared once it starts. The bed
     * cannot start on the tap frame itself: BT.isAudioUnlocked only flips true after the engine's
     * `await audioContext.resume()` settles, and a BT.soundPlay issued before that is dropped silently
     * (unlike BT.musicPlay, it is not retried). The 'play' branch of update() polls this flag until the
     * unlock is real.
     */
    private ambiencePendingStart = false;

    titleScreen!: TitleScreen;
    resultsScreen!: ResultsScreen;

    /** Best count this browser remembers (ui/HighScore.ts). Loaded in init(), updated on every day end. */
    highScore!: number;

    configure(): Partial<HardwareSettings> {
        return {
            displaySize: new Vector2i(CONFIG.logicalWidth, CONFIG.logicalHeight),

            targetFPS: 60,

            // The engine overlay would draw over our bitmap HUD.
            isOverlayEnabled: false,

            // Android honors this; iOS Safari ignores it.
            preferredOrientation: 'portrait',

            // Touch-drag and arrow keys move the player; without these the page would scroll instead.
            isCapturingPointerScroll: true,
            isCapturingKeyboardScroll: true,
        };
    }

    async init(): Promise<boolean> {
        // Player 0 defaults to WASD; arrow keys are player 1's. inputMap replaces a button's whole key
        // list, so both keys are named. Idempotent, so safe to re-run on hot reload.
        BT.inputMap(0, BT.BTN_LEFT, 'KeyA', 'ArrowLeft');
        BT.inputMap(0, BT.BTN_RIGHT, 'KeyD', 'ArrowRight');

        const palette = buildPalette(REFERENCE_PHASE);
        BT.paletteSet(palette);

        // Loads and indexes every sheet against this exact palette. Far too slow for update()/render().
        this.sprites = await loadSpriteSheets(palette);

        this.beach = new Beach(this.sprites.decorations, this.sprites.footprint);
        this.player = new Player(this.sprites.player);
        this.detector = new Detector(this.sprites.detectorHead);
        this.treasures = new Treasures();
        this.pickup = new Pickup(this.sprites.itemsLarge);
        this.dayClock = new DayClock();
        this.counter = new Counter(this.sprites.digits);
        this.watch = new Watch(this.sprites.watch, this.sprites.digits);
        this.titleScreen = new TitleScreen(this.sprites.icons);
        this.resultsScreen = new ResultsScreen(this.sprites.digits, this.sprites.icons);
        this.highScore = loadHighScore();

        this.sfx = await Sfx.create();
        this.ambience = await Ambience.create(); // synthesizes only; nothing plays before the title tap
        this.signals = new Signals(this.sfx);

        // Cross-system wiring. None of these systems import each other; they only meet here.
        this.treasures.onCollect(() => {
            this.sfx.playCollectSound();
        });

        this.treasures.onCollect((_worldX, _worldY, kind) => {
            this.pickup.spawn(kind);
        });

        this.player.onFootprint((worldX, worldY) => {
            this.beach.stampFootprint(worldX, worldY);
        });

        // Color and sound change on the same frame; the ambience crossfade is shorter than the palette fade.
        this.dayClock.onPhaseChange((phase) => {
            startPhaseTransition(phase);
            this.ambience.crossfadeTo(phase);
        });

        // Everything that happens at day end happens in this one listener, so nothing can fall out of step.
        this.dayClock.onDayEnd(() => {
            this.sfx.playWatchAlarm();
            this.ambience.stop();
            this.highScore = saveHighScoreIfBetter(this.treasures.collectedCount);
            this.screenState = 'results';
        });

        installPlaytestHooks(() => this.playtestState());

        // Title renders before the first play update, so the rod has to start on the figure.
        this.detector.update(0, this.player.worldX, 0);

        return true;
    }

    /** The snapshot window.__game.state() returns. Reads public getters only. */
    private playtestState(): PlaytestState {
        const nearest = this.treasures.nearestDistancePx;

        return {
            ticks: BT.ticks,
            screen: this.screenState,
            seed: BT.random.seedValue ?? 0,
            collected: this.treasures.collectedCount,
            highScore: this.highScore,
            dayProgress: this.dayClock.dayProgress,
            gameTimeMinutes: this.dayClock.gameTimeMinutes,
            phase: this.dayClock.phase,
            dayEnded: this.dayClock.hasEnded,
            player: { x: this.player.worldX, y: this.player.worldY },
            lane: this.player.lane,
            detectorHead: { x: this.detector.headWorldX, y: this.detector.headWorldY },
            nearestTreasurePx: Number.isFinite(nearest) ? nearest : null,
        };
    }

    update(): void {
        // The title and results branches return right after a tap, so the same tap is never also read as movement.
        if (this.screenState === 'title') {
            if (this.titleScreen.update(BT.deltaSeconds)) {
                this.screenState = 'play';
                this.ambiencePendingStart = true; // cannot start on this frame, see the field comment
            }

            return;
        }

        if (this.screenState === 'results') {
            if (this.resultsScreen.update()) {
                this.restart();
            }

            return;
        }

        const deltaSeconds = BT.deltaSeconds;

        if (this.ambiencePendingStart && BT.isAudioUnlocked) {
            this.ambience.start(this.dayClock.phase);
            this.ambiencePendingStart = false;
        }

        this.dayClock.update(deltaSeconds);

        if (this.dayClock.hasEnded) {
            // The onDayEnd listener already switched screens. Stop here so the world freezes on this frame.
            return;
        }

        // Order matters: the beach projects against the walk clock the player just advanced.
        this.player.update(deltaSeconds);
        this.beach.update(this.player.worldY);
        this.detector.update(deltaSeconds, this.player.worldX, this.player.inputDirection);

        const collectorWorldX = COLLECTION_MODE === 'head' ? this.detector.headWorldX : this.player.worldX;
        const collectorWorldY = COLLECTION_MODE === 'head' ? this.detector.headWorldY : this.player.worldY;

        this.treasures.update(deltaSeconds, collectorWorldX, collectorWorldY);

        this.sfx.update(deltaSeconds, this.treasures.nearestDistancePx);
        this.signals.update(deltaSeconds);

        // Last, so a reveal spawned by treasures.update() this frame gets its first tick before render().
        this.pickup.update(deltaSeconds);
    }

    render(): void {
        BT.clear(SKY_ZENITH); // safety net; Beach.render() covers the whole canvas

        // The world is drawn in every screen state. During title and results its update() never runs,
        // so this redraws the frozen last frame as a backdrop.
        this.beach.render(this.player.worldY);
        this.pickup.render(); // under the player, so a reveal can never cover the figure
        this.player.render();

        // Signals.update() does not run outside 'play'; pass 0 there so no stale highlight lingers.
        this.detector.render(this.screenState === 'play' ? this.signals.detectorBlinkIntensity : 0);

        if (this.screenState === 'title') {
            this.titleScreen.render();

            return;
        }

        if (this.screenState === 'results') {
            this.resultsScreen.render(this.treasures.collectedCount, BT.random.seedValue ?? 0, this.highScore);

            return;
        }

        this.counter.render(this.treasures.collectedCount);
        this.watch.render(this.dayClock.gameTimeMinutes);
        this.signals.render(); // border pulse, on top of the HUD
    }

    /**
     * Restarts a run in place on the same instances. Never constructs a fresh system: DayClock holds a
     * module-level visibility listener, and a second instance would leave the first one's attached.
     */
    private restart(): void {
        // Reseed before Beach and Treasures rebuild their pools from BT.random.
        BT.randomSeed(CONFIG.reseedOnRestart ? BT.random.int(1, 1_000_000_000) : (BT.random.seedValue ?? 0));

        this.beach.reset();
        this.player.reset();
        this.detector.reset();
        this.detector.update(0, this.player.worldX, 0);
        this.treasures.reset();
        this.pickup.reset();
        this.sfx.reset();
        this.ambience.reset();
        this.signals.reset();
        this.dayClock.reset();

        // Abort any palette fade still in flight and reassert the reference palette. This paletteSet()
        // prints the engine's "palette structure changed, call BT.spritesRefresh()" warning because
        // sheets are already loaded; the layout is unchanged, so ignore it and never call spritesRefresh.
        BT.paletteClearEffects();
        BT.paletteSet(buildPalette(REFERENCE_PHASE));

        this.ambiencePendingStart = true;

        this.screenState = 'play';
    }
}

bootstrap(Game);
