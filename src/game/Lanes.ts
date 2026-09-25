// The lanes: a grid of 5 invisible lanes, 30 pixels wide each, starting at
// x=18. The player moves between lanes by tapping left/right, and the
// detector's reach is calculated from these lane positions.
//
// This file provides pure functions for converting between lane indices and
// screen positions, without any mutable state. All values come from CONFIG.

import { CONFIG } from '../config';

// The playable range of the lane system, as [left, right) in screen pixels.
// Everything outside this range is off-limits for player movement.
export function playableRange(): [number, number] {
    return [CONFIG.laneOriginX, CONFIG.logicalWidth - CONFIG.laneOriginX];
}

// The center X coordinate of a lane, in screen pixels.
// Lane centers: 33, 63, 93, 123, 153 for default config.
export function laneCenterX(lane: number): number {
    return CONFIG.laneOriginX + lane * CONFIG.laneWidth + CONFIG.laneWidth / 2;
}

// Clamp a lane index to the valid range [0, laneCount - 1].
// Used to prevent the player from moving off the edges.
export function clampLane(lane: number): number {
    return Math.max(0, Math.min(CONFIG.laneCount - 1, lane));
}

// Convert a world X coordinate (screen X, since they're the same scale) to
// a lane index. Returns the lane that the X coordinate falls into.
export function laneFromX(x: number): number {
    const [left, right] = playableRange();
    if (x < left || x >= right) {
        return -1; // Outside playable range
    }
    return Math.floor((x - left) / CONFIG.laneWidth);
}
