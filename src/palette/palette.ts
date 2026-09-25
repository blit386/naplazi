// The palette: every color the game can draw, as one flat list of numbered
// slots. BLIT386 is "palette-first" (see docs/palette.md) - sprites and
// shapes never carry an RGB value of their own, only a slot number, so
// recoloring the whole world is a matter of overwriting a handful of slots
// instead of touching every sprite.
//
// SLOT LAYOUT (the whole palette in one picture, 64 slots total):
//
//   0            1 .. 27 ("the world ramp")             28 .. 33      34 .. 63
//   +--------+---------------------------------------+------------+-----------+
//   | trans- | sky (1-5) | sand (6-11) | object (12-27)| HUD (fixed)| unused,  |
//   | parent |           |             |               |            | room to  |
//   |        |<---------- WORLD_RAMP_START..END ------>|            | grow     |
//   +--------+---------------------------------------+------------+-----------+
//
// - Slot 0 is the engine's transparent sentinel (see docs/palette.md,
//   "The transparent slot") - nothing here ever writes to it.
// - Slots 1-27 are "the world ramp": every color a sky pixel, a sand pixel,
//   or a game-object pixel (player, detector, buried item, decoration) can
//   be drawn with. TASK-015 fades this ENTIRE range at once, in one
//   `BT.paletteFadeRange(WORLD_RAMP_START, WORLD_RAMP_END, ...)` call, to
//   carry the whole scene from morning light to evening light. Three
//   contiguous sub-ranges live inside it (sky, sand, object) purely for
//   readability - the fade does not care about the sub-boundaries, only
//   about the outer WORLD_RAMP_START/END pair.
// - Slots 28-33 are the HUD colors (counter, watch, border pulse, ...).
//   They sit OUTSIDE the world range on purpose: TASK-015's fade must never
//   touch them, or the counter and watch would dim into unreadable mush at
//   the end of the day. Every phase writes the exact same HUD colors (see
//   HUD_COLORS below, which is not keyed by phase at all) - "HUD stays
//   readable all day" is a hard requirement from PLAN.md section 4.9.
// - Slots 34-63 are unused. Left free on purpose for headroom - as it turned out, the title and
//   results screens (TASK-014, src/ui/TitleScreen.ts and ResultsScreen.ts) never needed any of them:
//   they reuse the existing HUD_INK/HUD_PAPER/HUD_ACCENT/HUD_METAL slots (28-33) instead. This range
//   is still free for whatever grows the object ramp later (more buried item kinds, ...) without
//   having to renumber anything above.
//
// Why 64 slots? `BT.paletteCreate` only accepts 2, 4, 16, 32, 64, 128, or 256
// (see node_modules/blit386/dist/blit386.d.ts, Palette constructor). 32 would
// have been too tight once HUD and headroom are added on top of 27 world
// slots; 64 leaves comfortable room without jumping all the way to 128.
//
// Why hand-picked slots instead of `SpriteSheet.loadIndexed`? `loadIndexed`
// scans a PNG and assigns slots itself, sorted by luminance - convenient, but
// it decides where the ramp boundaries fall, and `paletteFadeRange` needs
// those boundaries decided *here*, before a single sprite exists. So sprites
// are loaded with the plain `SpriteSheet.load()` and then matched against
// this palette by exact RGB with `sheet.indexize(palette)` instead (see
// tools/make-sprites.mjs, which paints every sprite using colors read
// straight from this file, and src/sprites.ts, which calls `indexize`).
//
// Never call `BT.spritesRefresh()` from this module or from anything that
// uses it. That call is for when a palette's slot *layout* changes (colors
// moved to different indices); this file's layout never changes, only the
// color *values* at each index change (that is exactly what
// `paletteFadeRange` does), and refreshing sprites in that situation can
// drop a sheet from the engine's registry instead of helping (see the
// warning on `BT.spritesRefresh` in blit386.d.ts).

import { BT, Color32, type Palette } from 'blit386';

// --- Sky ramp (1-5): the strip of color above the horizon, brightest near
// the sun/horizon glow, deepest at the top of the screen. ------------------
export const SKY_RAMP_START = 1;
export const SKY_ZENITH = 1; // top of the screen, the deepest sky color
export const SKY_UPPER = 2;
export const SKY_MID = 3;
export const SKY_HORIZON = 4; // just above the horizon line
export const SKY_GLOW = 5; // the warm glow right at the horizon/sun
export const SKY_RAMP_END = 5;

// --- Sand ramp (6-11): the beach strip below the horizon. Ordered dark to
// light so "sand gets darker near the waterline, lighter near the player's
// feet" is just picking a slot further along the ramp. SAND_SHADOW doubles
// as the footprint stamp color - a footprint is nothing more than sand
// pressed dark, so it did not need a slot of its own. ----------------------
export const SAND_RAMP_START = 6;
export const SAND_SHADOW = 6; // darkest: wet sand near the water AND footprints
export const SAND_WET = 7;
export const SAND_DARK = 8;
export const SAND_MID = 9;
export const SAND_LIGHT = 10;
export const SAND_HIGHLIGHT = 11; // brightest: dry sand nearest the player
export const SAND_RAMP_END = 11;

// --- Object ramp (12-27): everything that stands on the sand - the player,
// the detector, buried items, and loose decoration - shares this one range
// of slots. Sharing a range (instead of giving every sprite its own private
// colors) is what lets a single palette fade dim the whole cast of objects
// together at dusk, the same way it dims the sky and the sand. Each sprite
// still only touches a handful of these indices (see tools/make-sprites.mjs
// for exactly which ones). ---------------------------------------------------
export const OBJECT_RAMP_START = 12;
export const OBJECT_INK = 12; // near-black outline, used by almost every sprite
export const OBJECT_SKIN = 13; // player skin (head, neck, arms, legs)
export const OBJECT_SHIRT = 14; // player shirt
export const OBJECT_SHORTS = 15; // player shorts
export const OBJECT_METAL = 16; // detector rod/coil body, can body
export const OBJECT_METAL_LIGHT = 17; // metal highlight/shine
export const OBJECT_STARFISH = 18;
export const OBJECT_STARFISH_DARK = 19; // starfish shading
export const OBJECT_SHELL = 20;
export const OBJECT_SHELL_ACCENT = 21; // shell ridge/stripe
export const OBJECT_COIN = 22;
export const OBJECT_COIN_DARK = 23; // coin engraving
export const OBJECT_LITTER_A = 24; // litter, color 1
export const OBJECT_LITTER_B = 25; // litter, color 2
export const OBJECT_CUP_RING = 26; // cup-ring stain on the sand
export const OBJECT_ACCENT = 27; // bright shared sparkle/glint highlight
export const OBJECT_RAMP_END = 27;

// The single range TASK-015 hands to `BT.paletteFadeRange`. Covers sky, sand,
// and object slots as one contiguous block - see the picture above.
export const WORLD_RAMP_START = SKY_RAMP_START;
export const WORLD_RAMP_END = OBJECT_RAMP_END;

// --- HUD (28-33): outside the world range, identical in every phase. ------
export const HUD_RAMP_START = 28;
export const HUD_INK = 28; // dark outline / "segment off" color
export const HUD_PAPER = 29; // light plate behind the counter and watch face
export const HUD_ACCENT = 30; // bright digit / hand color - the readable bit
export const HUD_DIM = 31; // muted secondary marks (watch ticks, off segments)
export const HUD_ALERT = 32; // beep border-pulse color (TASK-016)
export const HUD_METAL = 33; // watch bezel / rim gray
export const HUD_RAMP_END = 33;

// Total palette size. Must be one of the sizes `BT.paletteCreate` accepts
// (2, 4, 16, 32, 64, 128, 256) - see the comment above for why 64.
export const PALETTE_SIZE = 64;

// The four lighting phases a run passes through. TASK-012's day clock picks
// one of these from CONFIG.phaseNoonAt / CONFIG.phaseEveningAt / CONFIG.phaseNightAt,
// and TASK-015 fades the world ramp toward whichever phase comes next.
export type DayPhase = 'morning' | 'noon' | 'evening' | 'night';

// A plain RGB triplet, 0-255 per channel - the same shape Color32 takes,
// kept as raw numbers here so this file (and tools/make-sprites.mjs, which
// reads colors back out through `buildPalette`) never has to import a
// browser-only rendering path just to look up a color.
type Rgb = readonly [number, number, number];

// The exact set of object-ramp slot numbers, derived from the constants
// above rather than retyped. Using this as the key type of a `Record` below
// means a phase table that forgets a slot, or writes an index that is not
// part of the object ramp, fails `pnpm typecheck` instead of shipping a gap
// in the ramp that only shows up as a missing color at runtime.
type WorldSlot =
    | typeof SKY_ZENITH
    | typeof SKY_UPPER
    | typeof SKY_MID
    | typeof SKY_HORIZON
    | typeof SKY_GLOW
    | typeof SAND_SHADOW
    | typeof SAND_WET
    | typeof SAND_DARK
    | typeof SAND_MID
    | typeof SAND_LIGHT
    | typeof SAND_HIGHLIGHT
    | typeof OBJECT_INK
    | typeof OBJECT_SKIN
    | typeof OBJECT_SHIRT
    | typeof OBJECT_SHORTS
    | typeof OBJECT_METAL
    | typeof OBJECT_METAL_LIGHT
    | typeof OBJECT_STARFISH
    | typeof OBJECT_STARFISH_DARK
    | typeof OBJECT_SHELL
    | typeof OBJECT_SHELL_ACCENT
    | typeof OBJECT_COIN
    | typeof OBJECT_COIN_DARK
    | typeof OBJECT_LITTER_A
    | typeof OBJECT_LITTER_B
    | typeof OBJECT_CUP_RING
    | typeof OBJECT_ACCENT;

type HudSlot =
    | typeof HUD_INK
    | typeof HUD_PAPER
    | typeof HUD_ACCENT
    | typeof HUD_DIM
    | typeof HUD_ALERT
    | typeof HUD_METAL;

// One entry per world slot, per phase. Every phase MUST define every slot in
// `WorldSlot` - that is what keeps the three ramps the same length and the
// same order, which TASK-005's brief calls out as the whole point: a fade
// only makes sense between two palettes that agree on what each index means.
const WORLD_COLORS: Record<DayPhase, Record<WorldSlot, Rgb>> = {
    // Soft, slightly hazy morning light: cool sky, pale sand, muted objects.
    morning: {
        [SKY_ZENITH]: [100, 140, 195],
        [SKY_UPPER]: [140, 175, 210],
        [SKY_MID]: [180, 205, 220],
        [SKY_HORIZON]: [225, 220, 205],
        [SKY_GLOW]: [255, 230, 180],
        [SAND_SHADOW]: [120, 100, 80],
        [SAND_WET]: [150, 128, 100],
        [SAND_DARK]: [180, 155, 120],
        [SAND_MID]: [205, 180, 140],
        [SAND_LIGHT]: [225, 200, 160],
        [SAND_HIGHLIGHT]: [240, 220, 180],
        [OBJECT_INK]: [40, 32, 30],
        [OBJECT_SKIN]: [225, 175, 140],
        [OBJECT_SHIRT]: [70, 120, 150],
        [OBJECT_SHORTS]: [200, 90, 70],
        [OBJECT_METAL]: [150, 155, 165],
        [OBJECT_METAL_LIGHT]: [210, 215, 220],
        [OBJECT_STARFISH]: [225, 120, 70],
        [OBJECT_STARFISH_DARK]: [170, 80, 45],
        [OBJECT_SHELL]: [235, 220, 205],
        [OBJECT_SHELL_ACCENT]: [225, 165, 170],
        [OBJECT_COIN]: [215, 175, 70],
        [OBJECT_COIN_DARK]: [160, 120, 40],
        [OBJECT_LITTER_A]: [150, 190, 150],
        [OBJECT_LITTER_B]: [190, 150, 170],
        [OBJECT_CUP_RING]: [140, 110, 75],
        [OBJECT_ACCENT]: [250, 245, 230],
    },
    // High sun: the most saturated and brightest of the three phases.
    noon: {
        [SKY_ZENITH]: [60, 130, 210],
        [SKY_UPPER]: [90, 160, 225],
        [SKY_MID]: [140, 195, 235],
        [SKY_HORIZON]: [200, 225, 235],
        [SKY_GLOW]: [255, 250, 220],
        [SAND_SHADOW]: [150, 120, 85],
        [SAND_WET]: [185, 150, 105],
        [SAND_DARK]: [210, 175, 120],
        [SAND_MID]: [230, 195, 140],
        [SAND_LIGHT]: [245, 215, 160],
        [SAND_HIGHLIGHT]: [255, 235, 185],
        [OBJECT_INK]: [35, 28, 25],
        [OBJECT_SKIN]: [235, 180, 140],
        [OBJECT_SHIRT]: [60, 140, 170],
        [OBJECT_SHORTS]: [220, 80, 60],
        [OBJECT_METAL]: [165, 170, 180],
        [OBJECT_METAL_LIGHT]: [225, 230, 235],
        [OBJECT_STARFISH]: [240, 120, 55],
        [OBJECT_STARFISH_DARK]: [180, 75, 35],
        [OBJECT_SHELL]: [245, 230, 210],
        [OBJECT_SHELL_ACCENT]: [235, 160, 165],
        [OBJECT_COIN]: [230, 185, 65],
        [OBJECT_COIN_DARK]: [175, 130, 35],
        [OBJECT_LITTER_A]: [140, 195, 140],
        [OBJECT_LITTER_B]: [195, 145, 175],
        [OBJECT_CUP_RING]: [150, 115, 70],
        [OBJECT_ACCENT]: [255, 252, 235],
    },
    // Sunset: warm, dimmer, and shifted toward orange/purple.
    evening: {
        [SKY_ZENITH]: [60, 55, 100],
        [SKY_UPPER]: [120, 80, 120],
        [SKY_MID]: [200, 110, 100],
        [SKY_HORIZON]: [240, 150, 90],
        [SKY_GLOW]: [255, 190, 100],
        [SAND_SHADOW]: [95, 70, 65],
        [SAND_WET]: [130, 95, 80],
        [SAND_DARK]: [160, 115, 90],
        [SAND_MID]: [190, 135, 100],
        [SAND_LIGHT]: [215, 155, 110],
        [SAND_HIGHLIGHT]: [235, 175, 125],
        [OBJECT_INK]: [35, 22, 25],
        [OBJECT_SKIN]: [205, 145, 120],
        [OBJECT_SHIRT]: [55, 90, 115],
        [OBJECT_SHORTS]: [175, 65, 55],
        [OBJECT_METAL]: [120, 115, 130],
        [OBJECT_METAL_LIGHT]: [180, 175, 190],
        [OBJECT_STARFISH]: [200, 95, 50],
        [OBJECT_STARFISH_DARK]: [140, 60, 30],
        [OBJECT_SHELL]: [215, 190, 175],
        [OBJECT_SHELL_ACCENT]: [205, 130, 140],
        [OBJECT_COIN]: [195, 150, 55],
        [OBJECT_COIN_DARK]: [140, 100, 30],
        [OBJECT_LITTER_A]: [110, 150, 115],
        [OBJECT_LITTER_B]: [160, 115, 140],
        [OBJECT_CUP_RING]: [110, 85, 60],
        [OBJECT_ACCENT]: [230, 210, 190],
    },
    // Night: dark blue sky, gray sand, objects still visible.
    // The sand must not go completely black or the player becomes invisible.
    night: {
        [SKY_ZENITH]: [20, 20, 50],
        [SKY_UPPER]: [40, 35, 70],
        [SKY_MID]: [80, 70, 100],
        [SKY_HORIZON]: [120, 100, 140],
        [SKY_GLOW]: [150, 130, 170],
        [SAND_SHADOW]: [40, 35, 35],
        [SAND_WET]: [60, 50, 50],
        [SAND_DARK]: [80, 70, 70],
        [SAND_MID]: [100, 90, 90],
        [SAND_LIGHT]: [120, 110, 110],
        [SAND_HIGHLIGHT]: [140, 130, 130],
        [OBJECT_INK]: [25, 22, 22],
        [OBJECT_SKIN]: [180, 130, 110],
        [OBJECT_SHIRT]: [50, 80, 100],
        [OBJECT_SHORTS]: [140, 60, 50],
        [OBJECT_METAL]: [80, 85, 95],
        [OBJECT_METAL_LIGHT]: [130, 125, 130],
        [OBJECT_STARFISH]: [140, 70, 40],
        [OBJECT_STARFISH_DARK]: [100, 50, 35],
        [OBJECT_SHELL]: [150, 130, 120],
        [OBJECT_SHELL_ACCENT]: [140, 90, 100],
        [OBJECT_COIN]: [130, 100, 45],
        [OBJECT_COIN_DARK]: [100, 70, 30],
        [OBJECT_LITTER_A]: [80, 110, 90],
        [OBJECT_LITTER_B]: [120, 90, 110],
        [OBJECT_CUP_RING]: [80, 65, 50],
        [OBJECT_ACCENT]: [180, 165, 150],
    },
};

// HUD colors: ONE table, not one per phase - see the big comment above for
// why (readability all day is a hard requirement, not a preference).
const HUD_COLORS: Record<HudSlot, Rgb> = {
    [HUD_INK]: [30, 26, 24],
    [HUD_PAPER]: [238, 230, 210],
    [HUD_ACCENT]: [225, 70, 55],
    [HUD_DIM]: [150, 140, 125],
    [HUD_ALERT]: [255, 205, 40],
    [HUD_METAL]: [170, 165, 160],
};

// The phase every sprite's pixel colors are painted in (see
// tools/make-sprites.mjs). It only matters that this is ONE fixed phase, so
// `sheet.indexize(palette)` (called once, in src/game.ts's init()) resolves
// every opaque pixel to a real slot; whichever phase the game is actually
// showing at that moment then takes over by changing the slot *values*, not
// the sprite's stored indices. Morning is picked because the day (and the
// day clock) starts there.
export const REFERENCE_PHASE: DayPhase = 'morning';

// Writes one `Rgb` table into a palette at the slot numbers used as its own
// keys. Shared by the world-ramp and HUD halves of buildPalette below so the
// "read the table, look up Color32, call palette.set" step is written once.
function writeColors<Slot extends number>(palette: Palette, colors: Record<Slot, Rgb>): void {
    for (const [slotText, rgb] of Object.entries(colors)) {
        const slot = Number(slotText);
        const [r, g, b] = rgb as Rgb;
        palette.set(slot, new Color32(r, g, b));
    }
}

// Builds a complete, ready-to-use Palette for one lighting phase. Called
// exactly the same way for all three phases - only the WORLD_COLORS lookup
// changes; the HUD half is always identical. TASK-015 calls this once per
// phase transition (to get a fade *target*), and src/game.ts's init() calls
// it once at startup to get the palette the game actually starts with.
export function buildPalette(phase: DayPhase): Palette {
    const palette = BT.paletteCreate(PALETTE_SIZE);
    writeColors(palette, WORLD_COLORS[phase]);
    writeColors(palette, HUD_COLORS);
    return palette;
}

// --- TASK-015: fading the world ramp toward the next phase -----------------

// Tuning for one phase-to-phase fade. A small file-local block rather than an addition to
// src/config.ts's CONFIG - this is a single-system knob (only startPhaseTransition below reads it),
// and CLAUDE.md's rule for src/config.ts is "belongs there only if more than one system reads it".
const PHASE_TRANSITION = {
    // How long one fade takes, in milliseconds - passed straight through to BT.paletteFadeRange's own
    // durationMs. A whole run only ever crosses a phase boundary twice (see CONFIG.phaseNoonAt /
    // phaseEveningAt in src/config.ts - dayProgress spends far longer inside a phase than crossing
    // into one), so there is plenty of room for a fade slow enough to read as the sky and sand
    // genuinely changing - long enough to notice, short enough that it never feels like the game
    // stalled or that the player is waiting on it.
    durationMs: 4000,
    // 'ease-in-out' rather than the default 'linear' - the color change visibly settles in and out
    // instead of moving at a constant rate the whole way through, which reads as a gentler, more
    // natural light change (a linear fade of a sky color reads a little mechanical). See
    // node_modules/blit386/dist/blit386.d.ts's EasingFunction for the full set of four options this
    // engine supports.
    easing: 'ease-in-out',
} as const;

// Starts (or restarts) a palette fade from whatever the world ramp currently shows toward `phase`'s
// colors. Called exactly once per phase change, from src/game.ts's init(), via a
// `dayClock.onPhaseChange((phase) => startPhaseTransition(phase))` listener - this file never imports
// DayClock.ts itself, the same "introduced only in src/game.ts" pattern every other pair of systems in
// this project follows (see DayClock.ts's own onPhaseChange() doc comment).
//
// Only ever fades WORLD_RAMP_START..WORLD_RAMP_END - never BT.paletteFadeRange's un-ranged sibling
// BT.paletteFade, which would also carry the HUD slots (28-33) along for the ride. That is the one
// hard rule this whole task exists to protect: "the HUD must keep the same colors all day long" (see
// this file's own header comment) would break the instant a HUD slot got handed to any fade.
//
// Builds a COMPLETE target Palette with buildPalette(phase), HUD colors and all, rather than a
// bespoke "just the world slots" object: BT.paletteFadeRange only ever reads the target's values
// inside [start, end] and ignores everything outside that range (see blit386.d.ts), so handing it a
// full palette is exactly as safe as a partial one, and it means this function never has to duplicate
// WORLD_COLORS' own color-picking logic.
//
// Never followed by BT.spritesRefresh() - see this file's own header comment for the full reasoning.
// A fade only ever changes what color a slot HOLDS, never which slot a sprite's pixel resolves to;
// spritesRefresh() exists for the opposite situation (a changed slot LAYOUT) and calling it here could
// drop a sheet from the engine's registry instead of helping.
export function startPhaseTransition(phase: DayPhase): void {
    const target = buildPalette(phase);
    BT.paletteFadeRange(WORLD_RAMP_START, WORLD_RAMP_END, target, PHASE_TRANSITION.durationMs, PHASE_TRANSITION.easing);
}
