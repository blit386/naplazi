// Backpack: tracks collected items by type for the current run.
// Each type has a count, and we track whether we've seen each type before
// to show the "NEW" marker on the find panel.

// The six item types (indices into ITEMS_SHEET)
export const ITEM_STARFISH = 0;
export const ITEM_CAN = 1;
export const ITEM_SHELL = 2;
export const ITEM_COIN = 3;
export const ITEM_GLASS_STROP = 4;
export const ITEM_KEY = 5;
export const ITEM_TYPE_COUNT = 6;

// Check if a kind is valid
function isValidKind(kind: number): boolean {
    return kind >= 0 && kind < ITEM_TYPE_COUNT;
}

// The backpack state for the current run
export class Backpack {
    private counts: number[];
    private seenTypes: boolean[];

    constructor() {
        this.counts = new Array(ITEM_TYPE_COUNT).fill(0);
        this.seenTypes = new Array(ITEM_TYPE_COUNT).fill(false);
    }

    // Add an item of the given type. Returns true if this is the first of this type.
    add(kind: number): boolean {
        if (!isValidKind(kind)) return false;

        this.counts[kind] += 1;
        const isNew = !this.seenTypes[kind];
        this.seenTypes[kind] = true;
        return isNew;
    }

    // Get the count of a specific type
    count(kind: number): number {
        if (!isValidKind(kind)) return 0;
        return this.counts[kind];
    }

    // Get the total number of items collected
    total(): number {
        return this.counts.reduce((sum, c) => sum + c, 0);
    }

    // Check if this is the first item of this type in this run
    isNew(kind: number): boolean {
        if (!isValidKind(kind)) return false;
        return this.seenTypes[kind] && this.counts[kind] === 1;
    }

    // Reset for a new run
    reset(): void {
        this.counts.fill(0);
        this.seenTypes.fill(false);
    }

    // Get all counts as an array (for the results screen)
    getAllCounts(): number[] {
        return [...this.counts];
    }
}
