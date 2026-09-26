// Shared, cross-system settings for the whole game.
//
// This is the one file to open when you want to change the "shape" of Beach
// Detector: how big the screen is, how long a day lasts, which random beach you
// get, how loud things are, and so on. Every value below is read by more than
// one system - that is the rule for belonging here. A value only one system
// cares about (say, how fast the detector rod turns) lives in a small `CONFIG`
// block at the top of that system's own file instead, so this file does not
// grow into a junk drawer.
//
// `as const` locks every value to its literal type (for example `180` instead
// of the wider `number`) and makes the whole object deeply read-only, so a typo
// like `CONFIG.logicalWidth = 999` fails to compile instead of silently
// reshaping the game somewhere far from here.
//
// A note on editing this file while `pnpm dev` is running: CONFIG is imported
// by src/game.ts, not copied into it, so most edits here take effect the same
// way an init()-level change does (see AGENTS.md, "Your notes", for exactly
// which values need a manual refresh to be seen).
export const CONFIG = {
    // --- Screen -----------------------------------------------------------
    // Logical (pixel-art) resolution, in whole pixels. This is the grid the
    // game actually draws to; the browser scales it up to fill the window
    // (see index.html), so raising these numbers does not make the game
    // "bigger" on screen - it makes every drawn pixel smaller and adds more
    // room for detail. Portrait (taller than wide) to match a phone held
    // upright, per the game's design (PLAN.md section 1).
    logicalWidth: 180,
    logicalHeight: 320,

    // --- Beach layers -------------------------------------------------------
    // Where the sky meets the sand, measured in logical pixels down from the
    // top of the screen. Everything above this line is sky; everything at or
    // below it is beach. Must stay smaller than logicalHeight, or there is no
    // beach left to stand on. Raising it pushes the horizon down and gives
    // more screen to the sky; lowering it does the opposite.
    horizonY: 90,

    // The height of the sea band below the horizon, in pixels. The sea is
    // visible as a horizontal band at y 90-107, and also as a vertical strip
    // at the left edge of the play area.
    seaBandHeight: 18,

    // The vertical screen row where the player stands and digs. The player
    // figure is drawn at this Y coordinate, and treasures are collected when
    // they cross this line.
    playerRowY: 276,

    // The top Y coordinate of the signal bar (feedback channel). The bar
    // extends downward from here to the bottom of the screen.
    signalBarY: 288,

    // --- The day ------------------------------------------------------------
    // How long one full playthrough lasts, in real seconds, from the moment
    // Play starts to the moment the watch strikes dayEndMinutes. Raising this
    // makes for a longer, more relaxed run; lowering it makes the hunt more
    // frantic because the same beach has to be searched faster.
    dayLengthSeconds: 120,

    // The in-game clock time shown on the watch at the very start of a run, in
    // minutes since midnight (6 * 60 = 06:00). Only affects what the watch
    // reads, not how long the run takes - that is dayLengthSeconds above.
    dayStartMinutes: 6 * 60,

    // The in-game clock time at which the day ends and the run stops, in
    // minutes since midnight (22 * 60 = 22:00). Must stay greater than
    // dayStartMinutes, or the clock would have to count backwards.
    dayEndMinutes: 22 * 60,

    // --- Phase times (0..1 across the day) ----------------------------------
    // The day's progress is split into four lighting phases: morning, noon,
    // evening, and night. These thresholds mark where each phase begins.
    // The palette fader, the day clock, and the ambience switcher all read
    // the same numbers, so the visuals, the label the watch could show, and
    // the background sound change phase together.
    //
    // phaseNoonAt: 0.3 (10:48) - transition from morning to noon
    // phaseEveningAt: 0.6 (15:36) - transition from noon to evening
    // phaseNightAt: 0.85 (19:36) - transition from evening to night
    phaseNoonAt: 0.3,
    phaseEveningAt: 0.6,
    phaseNightAt: 0.85,

    // --- Randomness ---------------------------------------------------------
    // Whether pressing "restart" rolls a brand-new random seed (true) or
    // replays the exact same beach again (false). Handy to set false
    // temporarily while debugging a specific layout.
    reseedOnRestart: true,

    // --- Lane configuration -------------------------------------------------
    // The beach is divided into 5 invisible lanes. Players move between them
    // by tapping left or right. The lanes are 30 pixels wide, starting at x=18.
    laneCount: 5,
    laneWidth: 30,
    laneOriginX: 18,

    // The starting lane (0-4, where 0 is the leftmost). Game starts in the
    // center lane (2) by default.
    startLane: 2,

    // --- Volume (0 = silent, 1 = full) -------------------------------------
    // Overall volume multiplier applied on top of every other volume below.
    // Turning this to 0 silences the whole game without touching the
    // individual sliders.
    masterVolume: 0.8,

    // Volume for short sound effects: the detector tick and the pickup chime.
    // Kept near full volume on purpose - the beep is the main gameplay signal,
    // so it needs to read clearly even on a phone's tiny speaker.
    sfxVolume: 1.0,

    // Volume for the background ambience bed. Kept lower than sfxVolume
    // so it never competes with the beep for attention.
    ambienceVolume: 0.35,

    // --- Feedback channels (turn any off to compare) --------------------------
    // The detector's "I found something closer" signal is deliberately sent
    // through more than one sense at once, because a lot of people play phone
    // games muted. Each flag below switches one channel on or off; flip one to
    // false to see (or hear) how much it was carrying on its own.
    // Whether the detector tick actually plays through the speakers.
    beepAudio: true,
    // Whether the screen edge flashes/pulses in time with the beep.
    beepBorderPulse: true,
    // Whether the detector's tip sprite blinks in time with the beep.
    beepDetectorBlink: true,
    // Whether the phone vibrates briefly on each beep (navigator.vibrate).
    // Silently does nothing on devices/browsers that do not support it.
    beepHaptic: true,
} as const;
