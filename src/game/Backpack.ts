/**
 * Per-run item counts by kind, plus first-of-kind tracking for a "NEW" marker on a find panel. Not
 * wired into game.ts yet. Declares six kinds where ITEMS_SHEET has four.
 */

export const ITEM_STARFISH = 0;
export const ITEM_CAN = 1;
export const ITEM_SHELL = 2;
export const ITEM_COIN = 3;
export const ITEM_GLASS_STROP = 4;
export const ITEM_KEY = 5;
export const ITEM_TYPE_COUNT = 6;

function isValidKind(kind: number): boolean {
    return kind >= 0 && kind < ITEM_TYPE_COUNT;
}

export class Backpack {
    private counts: number[];
    private seenTypes: boolean[];

    constructor() {
        this.counts = new Array(ITEM_TYPE_COUNT).fill(0);
        this.seenTypes = new Array(ITEM_TYPE_COUNT).fill(false);
    }

    /** Returns true when this is the first item of its kind this run. */
    add(kind: number): boolean {
        if (!isValidKind(kind)) return false;

        this.counts[kind] += 1;
        const isNew = !this.seenTypes[kind];
        this.seenTypes[kind] = true;
        return isNew;
    }

    count(kind: number): number {
        if (!isValidKind(kind)) return 0;
        return this.counts[kind];
    }

    total(): number {
        return this.counts.reduce((sum, c) => sum + c, 0);
    }

    /** True while exactly one of `kind` has been collected. */
    isNew(kind: number): boolean {
        if (!isValidKind(kind)) return false;
        return this.seenTypes[kind] && this.counts[kind] === 1;
    }

    reset(): void {
        this.counts.fill(0);
        this.seenTypes.fill(false);
    }

    /** A copy. */
    getAllCounts(): number[] {
        return [...this.counts];
    }
}
