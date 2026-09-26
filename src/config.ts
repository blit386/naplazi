/**
 * Settings read by more than one system. A value only one system needs lives in a const block at the
 * top of that system's own file instead (BEACH, PLAYER, DETECTOR, ...).
 *
 * `as const` makes every value a literal type and the whole object read-only.
 */
export const CONFIG = {
    /** Logical pixel-art resolution. The browser scales it up; raising it adds detail, not size. */
    logicalWidth: 180,
    logicalHeight: 320,

    /** Screen row where sky meets sand. Must stay below logicalHeight and at or below HUD_BAND_HEIGHT_PX. */
    horizonY: 90,

    /** Top edge of the signal bar. Read only by hud/SignalBar.ts, which is not wired in yet. */
    signalBarY: 288,

    /** Real seconds one run lasts, from the Play tap to the watch striking dayEndMinutes. */
    dayLengthSeconds: 120,

    /** What the watch reads at the start and end of a run, in minutes since midnight. End must exceed start. */
    dayStartMinutes: 6 * 60,
    dayEndMinutes: 22 * 60,

    /**
     * Where each lighting phase begins, as a fraction of the day (0.3 = 10:48, 0.6 = 15:36,
     * 0.85 = 19:36). DayClock derives the phase; the palette fade and the ambience crossfade both react
     * to the resulting phase change, so all three switch together.
     */
    phaseNoonAt: 0.3,
    phaseEveningAt: 0.6,
    phaseNightAt: 0.85,

    /** Restart rolls a fresh seed when true; false replays the same beach, handy when debugging a layout. */
    reseedOnRestart: true,

    /** Five-lane grid. Read only by game/Lanes.ts, which is not wired in yet. */
    laneCount: 5,
    laneWidth: 30,
    laneOriginX: 18,

    /**
     * Volumes, 0-1. master is the 'main' bus, sfx the 'sfx' bus. ambience is applied per voice, not as
     * a bus, because BT.soundPlay has no bus of its own (see Ambience.ts).
     */
    masterVolume: 0.8,
    sfxVolume: 1.0,
    ambienceVolume: 0.35,

    /**
     * The beep's feedback channels. Flip one off to see what it was carrying on its own. Haptic is a
     * no-op where navigator.vibrate is missing.
     */
    beepAudio: true,
    beepBorderPulse: true,
    beepDetectorBlink: true,
    beepHaptic: true,
} as const;
