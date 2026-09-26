/**
 * Every color the game draws, as 64 numbered slots. Sprites carry slot numbers, not RGB, so
 * recoloring the world means overwriting slots.
 *
 * Layout:
 *   0       transparent (engine sentinel, never written)
 *   1-27    the world ramp: sky 1-5, sand 6-11, objects 12-27. startPhaseTransition() fades this
 *           whole range as one block with BT.paletteFadeRange.
 *   28-33   HUD, identical in every phase so the counter and watch stay readable all day.
 *   34-63   free.
 *
 * 64 because BT.paletteCreate accepts 2/4/16/32/64/128/256 and 32 was too tight.
 *
 * Slots are hand-assigned rather than via SpriteSheet.loadIndexed, which sorts by luminance and would
 * decide the ramp boundaries itself. Sheets are loaded plain and matched by exact RGB with
 * sheet.indexize(palette); tools/make-sprites.mjs paints them from this file's colors.
 *
 * Never call BT.spritesRefresh() after a fade or a paletteSet from this module: the slot layout never
 * changes, only the values, and refreshing can drop a sheet from the engine's registry.
 *
 * This file may only import from 'blit386' and must stay erasable TypeScript, because the sprite
 * generator runs it through Node type stripping.
 */

import { BT, Color32, type Palette } from 'blit386';

/** Sky ramp: deepest at the top of the screen, warm glow at the horizon. */
export const SKY_RAMP_START = 1;
export const SKY_ZENITH = 1;
export const SKY_UPPER = 2;
export const SKY_MID = 3;
export const SKY_HORIZON = 4;
export const SKY_GLOW = 5;
export const SKY_RAMP_END = 5;

/** Sand ramp, dark (wet, near the water) to light (dry, near the feet). SAND_SHADOW doubles as the footprint color. */
export const SAND_RAMP_START = 6;
export const SAND_SHADOW = 6;
export const SAND_WET = 7;
export const SAND_DARK = 8;
export const SAND_MID = 9;
export const SAND_LIGHT = 10;
export const SAND_HIGHLIGHT = 11;
export const SAND_RAMP_END = 11;

/** Object ramp: everything standing on the sand shares it, so one fade dims the whole cast together. */
export const OBJECT_RAMP_START = 12;
export const OBJECT_INK = 12; // outline, used by almost every sprite
export const OBJECT_SKIN = 13;
export const OBJECT_SHIRT = 14;
export const OBJECT_SHORTS = 15;
export const OBJECT_METAL = 16; // detector rod and coil, can body
export const OBJECT_METAL_LIGHT = 17;
export const OBJECT_STARFISH = 18;
export const OBJECT_STARFISH_DARK = 19;
export const OBJECT_SHELL = 20;
export const OBJECT_SHELL_ACCENT = 21;
export const OBJECT_COIN = 22;
export const OBJECT_COIN_DARK = 23;
export const OBJECT_LITTER_A = 24;
export const OBJECT_LITTER_B = 25;
export const OBJECT_CUP_RING = 26;
export const OBJECT_ACCENT = 27; // shared sparkle/glint; also the detector's beep ring
export const OBJECT_RAMP_END = 27;

/** The one range handed to BT.paletteFadeRange. */
export const WORLD_RAMP_START = SKY_RAMP_START;
export const WORLD_RAMP_END = OBJECT_RAMP_END;

/** HUD slots, outside the fade range. */
export const HUD_RAMP_START = 28;
export const HUD_INK = 28; // outlines
export const HUD_PAPER = 29; // plate behind the counter, watch, title badge and results panel
export const HUD_ACCENT = 30; // bright digit color
export const HUD_DIM = 31; // muted secondary marks
export const HUD_ALERT = 32; // beep border pulse
export const HUD_METAL = 33; // watch bezel
export const HUD_RAMP_END = 33;

/** Must be a size BT.paletteCreate accepts. */
export const PALETTE_SIZE = 64;

/** The lighting phases, in day order. DayClock picks one from CONFIG.phase*At. */
export type DayPhase = 'morning' | 'noon' | 'evening' | 'night';

/** A raw 0-255 triplet, so tools/make-sprites.mjs can read colors without a browser rendering path. */
type Rgb = readonly [number, number, number];

/** Derived from the constants, so a phase table that misses a slot fails typecheck. */
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

/**
 * One full set of world colors per phase. Every phase must define every slot: a fade only makes sense
 * between palettes that agree on what each index means.
 */
const WORLD_COLORS: Record<DayPhase, Record<WorldSlot, Rgb>> = {
    // Soft and hazy: cool sky, pale sand, muted objects.
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
    // High sun: brightest and most saturated.
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
    // Sunset: warm, dimmer, shifted toward orange and purple.
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
    // Dark blue sky and gray sand, kept well above black so the player stays visible.
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

/** One table, not one per phase. */
const HUD_COLORS: Record<HudSlot, Rgb> = {
    [HUD_INK]: [30, 26, 24],
    [HUD_PAPER]: [238, 230, 210],
    [HUD_ACCENT]: [225, 70, 55],
    [HUD_DIM]: [150, 140, 125],
    [HUD_ALERT]: [255, 205, 40],
    [HUD_METAL]: [170, 165, 160],
};

/**
 * The phase the sprites are painted in, and the one sheet.indexize() runs against. Any fixed phase
 * works, since a fade changes slot values and not the indices stored in a sprite; morning is where
 * the day starts.
 */
export const REFERENCE_PHASE: DayPhase = 'morning';

/** Writes a table into the palette at its own slot keys. */
function writeColors<Slot extends number>(palette: Palette, colors: Record<Slot, Rgb>): void {
    for (const [slotText, rgb] of Object.entries(colors)) {
        const slot = Number(slotText);
        const [r, g, b] = rgb as Rgb;
        palette.set(slot, new Color32(r, g, b));
    }
}

/** A complete palette for one phase: its world colors plus the fixed HUD colors. Used as the starting palette and as a fade target. */
export function buildPalette(phase: DayPhase): Palette {
    const palette = BT.paletteCreate(PALETTE_SIZE);
    writeColors(palette, WORLD_COLORS[phase]);
    writeColors(palette, HUD_COLORS);
    return palette;
}

/** A single-system knob, so it lives here rather than in CONFIG. */
const PHASE_TRANSITION = {
    /** Long enough to read as the light changing; a run only crosses three phase boundaries. */
    durationMs: 4000,
    /** Linear reads mechanical on a sky color. */
    easing: 'ease-in-out',
} as const;

/**
 * Fades the world ramp toward `phase`. Wired to DayClock.onPhaseChange() in game.ts. Uses the ranged
 * BT.paletteFadeRange, never BT.paletteFade, which would carry the HUD slots along. The target is a
 * full buildPalette(); the fade only reads the slots inside the range.
 */
export function startPhaseTransition(phase: DayPhase): void {
    const target = buildPalette(phase);
    BT.paletteFadeRange(WORLD_RAMP_START, WORLD_RAMP_END, target, PHASE_TRANSITION.durationMs, PHASE_TRANSITION.easing);
}
