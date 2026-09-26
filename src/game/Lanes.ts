/** Pure lane-index <-> screen-x helpers over CONFIG.lane*. */

import { CONFIG } from '../config';

/** [left, right) in screen pixels. */
export function playableRange(): [number, number] {
    return [CONFIG.laneOriginX, CONFIG.logicalWidth - CONFIG.laneOriginX];
}

/** 33, 63, 93, 123, 153 with the default config. */
export function laneCenterX(lane: number): number {
    return CONFIG.laneOriginX + lane * CONFIG.laneWidth + CONFIG.laneWidth / 2;
}

export function clampLane(lane: number): number {
    return Math.max(0, Math.min(CONFIG.laneCount - 1, lane));
}

/** The lane containing `x`, or -1 outside the playable range. */
export function laneFromX(x: number): number {
    const [left, right] = playableRange();

    if (x < left || x >= right) {
        return -1;
    }

    return Math.floor((x - left) / CONFIG.laneWidth);
}

if (laneFromX(laneCenterX(0)) !== 0 || laneFromX(laneCenterX(CONFIG.laneCount - 1)) !== CONFIG.laneCount - 1) {
    throw new Error('Lanes.ts: a lane centre is outside its lane');
}
