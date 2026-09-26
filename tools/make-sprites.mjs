// Generates every PNG under public/sprites/ from the SAME color and layout
// definitions the game itself uses (src/palette/palette.ts, src/sprites.ts),
// so the art can never drift out of sync with the palette. How the script
// works, and how the game loads what it writes, is written up in
// tools/make-sprites.md. Run it with:
//
//   pnpm sprites
//
// (which is `node --experimental-strip-types tools/make-sprites.mjs` - see
// package.json). Node's type-stripping flag lets this plain .mjs script
// `import` the two .ts files below directly, with no build step and no
// second copy of the color table living in JavaScript.
//
// This script is idempotent: run it twice and every PNG comes out
// byte-for-byte identical, because the pixel data, the PNG encoder, and the
// zlib compression settings below are all fully deterministic. That matters
// because these PNGs are committed to the repo - a re-run should never touch
// git history it does not need to.
//
// Why write PNGs by hand instead of a library? `SpriteSheet.indexize()`
// matches a sprite's pixels back to a palette slot by an EXACT RGB match
// (see src/palette/palette.ts's header comment), and PNG-writing libraries
// commonly attach a color-management chunk (iCCP/gAMA/sRGB) that a browser
// can use to *shift* the decoded RGB values to match a color profile - which
// would break that exact match in a way that is invisible until indexize()
// throws (or worse, silently resolves to the wrong slot). The encoder below
// writes only IHDR/IDAT/IEND, so there is no profile for a decoder to apply.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync, constants as zlibConstants } from 'node:zlib';

import {
    buildPalette,
    HUD_ACCENT,
    HUD_ALERT,
    HUD_DIM,
    HUD_INK,
    HUD_METAL,
    HUD_PAPER,
    OBJECT_ACCENT,
    OBJECT_COIN,
    OBJECT_COIN_DARK,
    OBJECT_CUP_RING,
    OBJECT_INK,
    OBJECT_LITTER_A,
    OBJECT_LITTER_B,
    OBJECT_METAL,
    OBJECT_METAL_LIGHT,
    OBJECT_SHELL,
    OBJECT_SHELL_ACCENT,
    OBJECT_SHIRT,
    OBJECT_SHORTS,
    OBJECT_SKIN,
    OBJECT_STARFISH,
    OBJECT_STARFISH_DARK,
    REFERENCE_PHASE,
    SAND_DARK,
    SAND_HIGHLIGHT,
    SAND_LIGHT,
    SAND_MID,
    SAND_SHADOW,
    SAND_WET,
    SKY_GLOW,
    SKY_HORIZON,
    SKY_MID,
    SKY_UPPER,
    SKY_ZENITH,
} from '../src/palette/palette.ts';

import {
    cellRect,
    DECORATION_CUP_RING,
    DECORATION_LITTER,
    DECORATION_SPECK,
    DECORATIONS_SHEET,
    DETECTOR_HEAD_SHEET,
    DIGIT_COLON_INDEX,
    DIGIT_GLYPH_HEIGHT,
    DIGIT_GLYPH_WIDTH,
    DIGITS_SHEET,
    FOOTPRINT_SHEET,
    ICON_BEST,
    ICON_FOUND,
    ICON_PLAY,
    ICON_RESTART,
    ICON_SEED,
    ICONS_SHEET,
    ITEM_CAN,
    ITEM_CELL,
    ITEM_COIN,
    ITEM_LARGE_CELL,
    ITEM_SHELL,
    ITEM_STARFISH,
    ITEMS_LARGE_SHEET,
    ITEMS_SHEET,
    PLAYER_SHEET,
    sheetSize,
    WATCH_BUTTON_WIDTH_PX,
    WATCH_LCD_HEIGHT,
    WATCH_LCD_WIDTH,
    WATCH_LCD_X,
    WATCH_LCD_Y,
    WATCH_SHEET,
} from '../src/sprites.ts';

// -----------------------------------------------------------------------
// Paths
// -----------------------------------------------------------------------

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const publicDir = path.join(projectRoot, 'public');

// -----------------------------------------------------------------------
// A tiny in-memory RGBA image, plus the drawing primitives every sprite
// below is built from. Nothing here is BLIT386-specific - it is only
// concerned with producing a flat pixel buffer that the PNG encoder further
// down can turn into a file.
// -----------------------------------------------------------------------

function createImage(width, height) {
    // Every pixel starts at (0, 0, 0, 0) - fully transparent - which is
    // exactly what an un-painted background or a reserved sheet cell needs.
    return { width, height, pixels: new Uint8Array(width * height * 4) };
}

function setPixel(image, x, y, rgba) {
    // Silently ignore anything outside the canvas instead of throwing - art
    // helpers below sometimes compute a circle/star bounding box that pokes
    // a fraction of a pixel past an edge, and clamping here is simpler than
    // clamping every caller.
    const px = Math.round(x);
    const py = Math.round(y);
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) {
        return;
    }
    const i = (py * image.width + px) * 4;
    image.pixels[i] = rgba[0];
    image.pixels[i + 1] = rgba[1];
    image.pixels[i + 2] = rgba[2];
    image.pixels[i + 3] = rgba[3];
}

function fillRect(image, x, y, width, height, rgba) {
    for (let yy = 0; yy < height; yy += 1) {
        for (let xx = 0; xx < width; xx += 1) {
            setPixel(image, x + xx, y + yy, rgba);
        }
    }
}

// Fills an exact ring of pixels between innerRadius (exclusive) and
// outerRadius (inclusive) of (cx, cy). Pass innerRadius < 0 for a solid disk.
// Distance is measured from each pixel's CENTER (x + 0.5, y + 0.5), which is
// what keeps circles built this way symmetric instead of lopsided.
function ring(image, cx, cy, outerRadius, innerRadius, rgba) {
    const minX = Math.max(0, Math.floor(cx - outerRadius));
    const maxX = Math.min(image.width - 1, Math.ceil(cx + outerRadius));
    const minY = Math.max(0, Math.floor(cy - outerRadius));
    const maxY = Math.min(image.height - 1, Math.ceil(cy + outerRadius));
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance <= outerRadius && distance > innerRadius) {
                setPixel(image, x, y, rgba);
            }
        }
    }
}

function disk(image, cx, cy, radius, rgba) {
    ring(image, cx, cy, radius, -1, rgba);
}

// Fills an arc-shaped slice of a ring: same annulus shape as ring() above (measured from each pixel's
// CENTER, so the edges stay symmetric), but restricted to the angular range [startDeg, endDeg] -
// degrees measured the same way Math.atan2 does (0 = pointing right, 90 = pointing down, since screen
// Y grows downward), wrapping forward from startDeg toward endDeg. Only icons.png's ICON_RESTART below
// needs a partial ring (a closed annulus reads as a solid circle, not a "loop again" arrow), so this
// stays local to that one use instead of living alongside ring()/disk() as if every sprite needed it.
function arcRing(image, cx, cy, outerRadius, innerRadius, startDeg, endDeg, rgba) {
    const minX = Math.max(0, Math.floor(cx - outerRadius));
    const maxX = Math.min(image.width - 1, Math.ceil(cx + outerRadius));
    const minY = Math.max(0, Math.floor(cy - outerRadius));
    const maxY = Math.min(image.height - 1, Math.ceil(cy + outerRadius));
    const startRad = (startDeg * Math.PI) / 180;
    const endRad = (endDeg * Math.PI) / 180;
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x + 0.5 - cx;
            const dy = y + 0.5 - cy;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance > outerRadius || distance <= innerRadius) {
                continue;
            }
            let angle = Math.atan2(dy, dx);
            while (angle < startRad) {
                angle += 2 * Math.PI;
            }
            if (angle <= endRad) {
                setPixel(image, x, y, rgba);
            }
        }
    }
}

// Point-in-polygon test (even-odd rule / ray casting). Used by fillPolygon
// below, which is how the starfish gets a mathematically regular 5-point
// shape instead of a freehand approximation.
function pointInPolygon(px, py, vertices) {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i, i += 1) {
        const [xi, yi] = vertices[i];
        const [xj, yj] = vertices[j];
        const crossesScanline = yi > py !== yj > py;
        if (crossesScanline) {
            const xAtScanline = ((xj - xi) * (py - yi)) / (yj - yi) + xi;
            if (px < xAtScanline) {
                inside = !inside;
            }
        }
    }
    return inside;
}

function fillPolygon(image, vertices, rgba) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (const [x, y] of vertices) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }
    const startX = Math.max(0, Math.floor(minX));
    const endX = Math.min(image.width - 1, Math.ceil(maxX));
    const startY = Math.max(0, Math.floor(minY));
    const endY = Math.min(image.height - 1, Math.ceil(maxY));
    for (let y = startY; y <= endY; y += 1) {
        for (let x = startX; x <= endX; x += 1) {
            if (pointInPolygon(x + 0.5, y + 0.5, vertices)) {
                setPixel(image, x, y, rgba);
            }
        }
    }
}

// Builds the 2*points vertices of a regular star polygon (outer point,
// inner point, outer point, ...), centered on (cx, cy). rotationDeg = -90
// puts the first outer point straight up, which is what makes the result
// symmetric left-to-right - handy since BLIT386 sprites never rotate.
function starVertices(cx, cy, outerRadius, innerRadius, points, rotationDeg) {
    const rotation = (rotationDeg * Math.PI) / 180;
    const vertices = [];
    for (let i = 0; i < points * 2; i += 1) {
        const radius = i % 2 === 0 ? outerRadius : innerRadius;
        const angle = rotation + (i * Math.PI) / points;
        vertices.push([cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)]);
    }
    return vertices;
}

// Paints a block of ASCII art onto `image` at (originX, originY). Every
// character in `rows` is looked up in `legend`; '.' always means "leave
// this pixel alone" (the canvas starts fully transparent, so that is
// usually what you want). Rows must all be the same length - see
// assertRectangularRows - or a typo silently shifts every pixel after it.
function paintArt(image, originX, originY, rows, legend) {
    for (let ry = 0; ry < rows.length; ry += 1) {
        const row = rows[ry];
        for (let rx = 0; rx < row.length; rx += 1) {
            const ch = row[rx];
            if (ch === '.') {
                continue;
            }
            const rgba = legend[ch];
            if (!rgba) {
                throw new Error(`unmapped art character "${ch}" in row "${row}"`);
            }
            setPixel(image, originX + rx, originY + ry, rgba);
        }
    }
}

function assertRectangularRows(rows, expectedWidth, label) {
    for (const row of rows) {
        if (row.length !== expectedWidth) {
            throw new Error(`${label}: expected every row to be ${expectedWidth} characters, got "${row}"`);
        }
    }
}

// Turns an array of "left half" rows into full, mirrored rows - halving the
// hand-authoring work for anything bilaterally symmetric (a person viewed
// from behind, a can, a shell, a 5-point star standing upright) AND
// guaranteeing the result is exactly symmetric, with no eyeballing.
function mirrorHalf(halfRows) {
    return halfRows.map((row) => row + [...row].reverse().join(''));
}

// Copies a (w x h) region out of `source` at (sx, sy), scaled up `scale`
// times with plain nearest-neighbor repetition (each source pixel becomes a
// scale x scale block). This is how items-large.png is built from
// items.png: a real, separate, pre-scaled sprite (the engine cannot scale a
// sprite at draw time - see PLAN.md section 9), produced by copying exact
// palette-colored pixels rather than redrawing the shape a second time.
function upscaleRegion(source, sx, sy, w, h, scale) {
    const out = createImage(w * scale, h * scale);
    for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
            const i = ((sy + y) * source.width + (sx + x)) * 4;
            const rgba = [source.pixels[i], source.pixels[i + 1], source.pixels[i + 2], source.pixels[i + 3]];
            for (let dy = 0; dy < scale; dy += 1) {
                for (let dx = 0; dx < scale; dx += 1) {
                    setPixel(out, x * scale + dx, y * scale + dy, rgba);
                }
            }
        }
    }
    return out;
}

function compositeInto(target, source, destX, destY) {
    for (let y = 0; y < source.height; y += 1) {
        for (let x = 0; x < source.width; x += 1) {
            const i = (y * source.width + x) * 4;
            const rgba = [source.pixels[i], source.pixels[i + 1], source.pixels[i + 2], source.pixels[i + 3]];
            if (rgba[3] === 0) {
                continue; // nothing to copy - leave the target pixel as-is
            }
            setPixel(target, destX + x, destY + y, rgba);
        }
    }
}

// -----------------------------------------------------------------------
// A minimal, dependency-free PNG encoder. Writes exactly three chunks -
// IHDR, IDAT, IEND - and nothing else: no iCCP/gAMA/sRGB color-management
// chunk, no tEXt/tIME metadata. See the file header comment for why that
// matters to indexize().
// -----------------------------------------------------------------------

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n += 1) {
        let c = n;
        for (let k = 0; k < 8; k += 1) {
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        }
        table[n] = c >>> 0;
    }
    return table;
})();

function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
        crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length, 0);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 0);
    return Buffer.concat([length, typeBytes, data, crc]);
}

function encodePng(image) {
    const { width, height, pixels } = image;

    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; // bit depth: 8 bits per channel
    ihdr[9] = 6; // color type: 6 = truecolor with alpha (RGBA)
    ihdr[10] = 0; // compression method: 0 is the only value the spec defines
    ihdr[11] = 0; // filter method: 0 is the only value the spec defines
    ihdr[12] = 0; // interlace method: 0 = no interlacing

    // Every PNG scanline is prefixed with a one-byte filter type. Filter 0
    // (None) keeps the encoder simple; these sprites are a few hundred
    // pixels each, so there is nothing to gain from the fancier filters.
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
        const rowStart = y * (stride + 1);
        raw[rowStart] = 0; // filter type: None
        const srcStart = y * stride;
        for (let i = 0; i < stride; i += 1) {
            raw[rowStart + 1 + i] = pixels[srcStart + i];
        }
    }

    // A fixed compression level makes the output deterministic run to run -
    // required for "pnpm sprites twice in a row produces identical bytes".
    const idatData = deflateSync(raw, { level: zlibConstants.Z_BEST_COMPRESSION });

    return Buffer.concat([
        PNG_SIGNATURE,
        pngChunk('IHDR', ihdr),
        pngChunk('IDAT', idatData),
        pngChunk('IEND', Buffer.alloc(0)),
    ]);
}

function savePng(url, image) {
    const filePath = path.join(publicDir, url);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const bytes = encodePng(image);
    fs.writeFileSync(filePath, bytes);
    console.log(`wrote ${url} (${image.width}x${image.height}, ${bytes.length} bytes)`);
}

// -----------------------------------------------------------------------
// The palette every sprite below is painted against. REFERENCE_PHASE (see
// src/palette/palette.ts) is the one phase used for authoring art - the
// slot INDEX a pixel resolves to never changes after that; only the RGB
// VALUE stored at that slot changes as the day passes (that is the whole
// point of paletteFadeRange).
// -----------------------------------------------------------------------

const palette = buildPalette(REFERENCE_PHASE);

function colorOf(slot) {
    const c = palette.get(slot);
    return [c.r, c.g, c.b, 255];
}

// Every slot this script paints with. Checked for accidental RGB collisions
// before anything is drawn - see the note below.
const PAINTED_SLOTS = [
    SKY_ZENITH,
    SKY_UPPER,
    SKY_MID,
    SKY_HORIZON,
    SKY_GLOW,
    SAND_SHADOW,
    SAND_WET,
    SAND_DARK,
    SAND_MID,
    SAND_LIGHT,
    SAND_HIGHLIGHT,
    OBJECT_INK,
    OBJECT_SKIN,
    OBJECT_SHIRT,
    OBJECT_SHORTS,
    OBJECT_METAL,
    OBJECT_METAL_LIGHT,
    OBJECT_STARFISH,
    OBJECT_STARFISH_DARK,
    OBJECT_SHELL,
    OBJECT_SHELL_ACCENT,
    OBJECT_COIN,
    OBJECT_COIN_DARK,
    OBJECT_LITTER_A,
    OBJECT_LITTER_B,
    OBJECT_CUP_RING,
    OBJECT_ACCENT,
    HUD_INK,
    HUD_PAPER,
    HUD_ACCENT,
    HUD_DIM,
    HUD_ALERT,
    HUD_METAL,
];

// `Palette.findColor` (blit386.d.ts) returns the FIRST slot whose RGBA
// matches exactly. If two of the slots above ever end up with the same RGB
// in REFERENCE_PHASE, a sprite pixel meant for the second slot would
// silently index to the first one instead - correct today, and wrong the
// moment palette.ts changes one of them off the collision. Catch it here,
// at generation time, instead of as a rendering mystery later.
for (const slot of PAINTED_SLOTS) {
    const found = palette.findColor(palette.get(slot));
    if (found !== slot) {
        throw new Error(
            `src/palette/palette.ts: slot ${slot} has the same RGB as slot ${found} in the "${REFERENCE_PHASE}" ` +
                'phase. Give one of them a distinct color before regenerating sprites.',
        );
    }
}

// Note: HUD_DIM is reserved for future HUD art (watch tick shading,
// inactive digit segments) and is not yet used by any sprite painted below -
// it is only referenced through PAINTED_SLOTS above, which still checks it
// for collisions even though nothing draws with it yet.

// -----------------------------------------------------------------------
// player.png - the player, seen from behind, drawn as a left half that gets
// mirrored into the full 16px width (see mirrorHalf).
// -----------------------------------------------------------------------
{
    const halfRows = [
        '......HH',
        '.....HHH',
        '....HHHH',
        '...HHHHH',
        '...HHHHH',
        '....HHHH',
        '......KK',
        'ASSSSSSS',
        'ASSSSSSS',
        'ASSSSSSS',
        'ASSSSSSS',
        'ASSSSSSS',
        'ASSSSSSS',
        'ASSSSSSS',
        'ASSSSSSS',
        'AWWWWWWW',
        'AWWWWWWW',
        'AWWWWWWW',
        'AWWWWWWW',
        '...LLLL.',
        '...LLLL.',
        '...LLLL.',
        '...FFFF.',
        '...FFFF.',
    ];
    const rows = mirrorHalf(halfRows);
    assertRectangularRows(rows, PLAYER_SHEET.cellWidth, 'player.png');
    if (rows.length !== PLAYER_SHEET.cellHeight) {
        throw new Error(`player.png: expected ${PLAYER_SHEET.cellHeight} rows, got ${rows.length}`);
    }
    const image = createImage(PLAYER_SHEET.cellWidth, PLAYER_SHEET.cellHeight);
    paintArt(image, 0, 0, rows, {
        H: colorOf(OBJECT_INK), // hair, the back of the head
        K: colorOf(OBJECT_SKIN), // neck
        A: colorOf(OBJECT_SKIN), // arm, hanging at the side
        S: colorOf(OBJECT_SHIRT),
        W: colorOf(OBJECT_SHORTS),
        L: colorOf(OBJECT_SKIN), // leg
        F: colorOf(OBJECT_INK), // foot / sandal
    });
    savePng(PLAYER_SHEET.url, image);
}

// -----------------------------------------------------------------------
// detector-head.png - the detector tip. Drawn as a ring (outline + metal
// band) around a hollow, radially-symmetric center: at any implied swing
// angle it looks the same, because the engine never rotates a sprite to
// begin with (see src/sprites.ts's comment on this constant).
// -----------------------------------------------------------------------
{
    const image = createImage(DETECTOR_HEAD_SHEET.cellWidth, DETECTOR_HEAD_SHEET.cellHeight);
    const cx = DETECTOR_HEAD_SHEET.cellWidth / 2;
    const cy = DETECTOR_HEAD_SHEET.cellHeight / 2;
    ring(image, cx, cy, 3.9, 3.0, colorOf(OBJECT_INK)); // outer outline
    ring(image, cx, cy, 3.0, 2.1, colorOf(OBJECT_METAL)); // coil band
    disk(image, cx, cy, 1.1, colorOf(OBJECT_METAL_LIGHT)); // center connector dot
    savePng(DETECTOR_HEAD_SHEET.url, image);
}

// -----------------------------------------------------------------------
// footprint.png - a small symmetric sand-impression stamp (see
// src/sprites.ts's comment: stamped down without rotating or flipping,
// whichever way the player just stepped, so it has to look right either
// way on its own).
// -----------------------------------------------------------------------
{
    const rows = ['.SS.', 'SSSS', 'SSSS', '.SS.'];
    assertRectangularRows(rows, FOOTPRINT_SHEET.cellWidth, 'footprint.png');
    const image = createImage(FOOTPRINT_SHEET.cellWidth, FOOTPRINT_SHEET.cellHeight);
    paintArt(image, 0, 0, rows, { S: colorOf(SAND_SHADOW) });
    savePng(FOOTPRINT_SHEET.url, image);
}

// -----------------------------------------------------------------------
// watch.png - ONE generic digital wristwatch, seen head on: a dark resin
// case, a pale LCD window punched into it, and four small side buttons. No
// dial, no hands, and no digits baked in - TASK-013's Watch.ts draws the live
// HH:MM into the LCD window from digits.png (see WATCH_LCD_* in
// src/sprites.ts, the shared description of that window this painter and
// Watch.ts both read). Generic shape only, no logo and no branded or
// copyrighted design, as required by TODO.md TASK-006 and PLAN.md 4.11.
//
// Every rectangle below is positioned from WATCH_LCD_X/Y/WIDTH/HEIGHT rather
// than from hand-picked pixel numbers, so the case follows the LCD window if
// the digit font ever changes size - the same reason src/sprites.ts derives
// that window from DIGIT_CELL_WIDTH/HEIGHT in the first place.
// -----------------------------------------------------------------------
{
    const width = WATCH_SHEET.cellWidth;
    const height = WATCH_SHEET.cellHeight;
    const image = createImage(width, height);

    // The case body. It stops short of both side edges, leaving those columns
    // for the buttons below, and its four corner pixels are left transparent
    // so the silhouette reads as rounded resin rather than a hard rectangle.
    const bodyX = WATCH_BUTTON_WIDTH_PX;
    const bodyWidth = width - WATCH_BUTTON_WIDTH_PX * 2;
    fillRect(image, bodyX, 0, bodyWidth, height, colorOf(HUD_INK));
    for (const cornerX of [bodyX, bodyX + bodyWidth - 1]) {
        for (const cornerY of [0, height - 1]) {
            setPixel(image, cornerX, cornerY, [0, 0, 0, 0]);
        }
    }

    // Four buttons, two per side, at the heights a resin watch puts them:
    // roughly a third and two thirds of the way down the case.
    for (const buttonY of [Math.round(height / 3) - 1, Math.round((height * 2) / 3) - 1]) {
        fillRect(image, 0, buttonY, WATCH_BUTTON_WIDTH_PX, 3, colorOf(HUD_METAL));
        fillRect(image, width - WATCH_BUTTON_WIDTH_PX, buttonY, WATCH_BUTTON_WIDTH_PX, 3, colorOf(HUD_METAL));
    }

    // The LCD window: a metal bezel ring one pixel outside the window, the
    // pale panel itself, then a darker top/left inner edge so the glass reads
    // as recessed into the case instead of painted onto it.
    fillRect(image, WATCH_LCD_X - 1, WATCH_LCD_Y - 1, WATCH_LCD_WIDTH + 2, WATCH_LCD_HEIGHT + 2, colorOf(HUD_METAL));
    fillRect(image, WATCH_LCD_X, WATCH_LCD_Y, WATCH_LCD_WIDTH, WATCH_LCD_HEIGHT, colorOf(HUD_PAPER));
    fillRect(image, WATCH_LCD_X, WATCH_LCD_Y, WATCH_LCD_WIDTH, 1, colorOf(HUD_DIM));
    fillRect(image, WATCH_LCD_X, WATCH_LCD_Y, 1, WATCH_LCD_HEIGHT, colorOf(HUD_DIM));

    // Two case details, both above the window, in the strip the border leaves
    // free: a short mode-marker dash on the left and a pair of tiny dots on
    // the right. They carry no meaning - they exist so the case does not read
    // as a bare black frame - which is why nothing else in the game reads
    // them.
    const detailY = Math.floor((WATCH_LCD_Y - 1) / 2);
    fillRect(image, WATCH_LCD_X + 1, detailY, 4, 1, colorOf(HUD_METAL));
    setPixel(image, WATCH_LCD_X + WATCH_LCD_WIDTH - 4, detailY, colorOf(HUD_DIM));
    setPixel(image, WATCH_LCD_X + WATCH_LCD_WIDTH - 2, detailY, colorOf(HUD_DIM));

    savePng(WATCH_SHEET.url, image);
}

// -----------------------------------------------------------------------
// items.png - the four buried items, each drawn inside its own cell via
// cellRect() (see src/sprites.ts). The second row of the grid is left
// untouched (fully transparent) - reserved for future items.
// -----------------------------------------------------------------------
const itemsSize = sheetSize(ITEMS_SHEET);
const itemsImage = createImage(itemsSize.x, itemsSize.y);

{
    // Coin: an embossed disk - outline, gold body, a darker inner ring for
    // the engraving, and a tiny bright glint.
    const rect = cellRect(ITEMS_SHEET, ITEM_COIN);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    disk(itemsImage, cx, cy, 5.4, colorOf(OBJECT_COIN));
    ring(itemsImage, cx, cy, 5.4, 4.6, colorOf(OBJECT_INK));
    ring(itemsImage, cx, cy, 3.3, 2.1, colorOf(OBJECT_COIN_DARK));
    disk(itemsImage, cx, cy, 0.9, colorOf(OBJECT_ACCENT));
}

{
    // Can: a metal cylinder - outlined top/bottom rims, an outline down each
    // side (free from the mirror), and one bright band standing in for a
    // label/highlight.
    const halfRows = [
        'IIIIII',
        'IMMMMM',
        'IMMMMM',
        'ILLLLL',
        'IMMMMM',
        'IMMMMM',
        'IMMMMM',
        'IMMMMM',
        'IMMMMM',
        'IMMMMM',
        'IMMMMM',
        'IIIIII',
    ];
    const rows = mirrorHalf(halfRows);
    assertRectangularRows(rows, ITEM_CELL, 'items.png (can)');
    const rect = cellRect(ITEMS_SHEET, ITEM_CAN);
    paintArt(itemsImage, rect.x, rect.y, rows, {
        I: colorOf(OBJECT_INK),
        M: colorOf(OBJECT_METAL),
        L: colorOf(OBJECT_METAL_LIGHT),
    });
}

{
    // Shell: a scallop/fan shape, wide at the top and pointed at the bottom,
    // with a ridge line running along the outer curve.
    const halfRows = [
        '.ASSSS',
        'ASSSSS',
        'ASSSSS',
        '.ASSSS',
        '.ASSSS',
        '..ASSS',
        '..ASSS',
        '...ASS',
        '...ASS',
        '....AS',
        '.....S',
        '.....S',
    ];
    const rows = mirrorHalf(halfRows);
    assertRectangularRows(rows, ITEM_CELL, 'items.png (shell)');
    const rect = cellRect(ITEMS_SHEET, ITEM_SHELL);
    paintArt(itemsImage, rect.x, rect.y, rows, {
        S: colorOf(OBJECT_SHELL),
        A: colorOf(OBJECT_SHELL_ACCENT),
    });
}

{
    // Starfish: a mathematically regular 5-point star (see starVertices)
    // rather than freehand pixels, so five arms actually come out even at
    // this tiny size. An outline layer sits under a slightly smaller color
    // layer, and two shading dots sit on the lower arms, in a mirrored pair.
    const rect = cellRect(ITEMS_SHEET, ITEM_STARFISH);
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const points = 5;
    const rotationDeg = -90; // one point straight up
    fillPolygon(itemsImage, starVertices(cx, cy, 5.5, 2.2, points, rotationDeg), colorOf(OBJECT_INK));
    fillPolygon(itemsImage, starVertices(cx, cy, 4.6, 1.7, points, rotationDeg), colorOf(OBJECT_STARFISH));
    const shadeRadius = 4.6 * 0.55;
    const rotationRad = (rotationDeg * Math.PI) / 180;
    for (const k of [2, 3]) {
        // k = 2 and k = 3 are the two lower outer points of the star - a
        // mirrored pair, same as mirrorHalf gives for hand-drawn art.
        const angle = rotationRad + (2 * Math.PI * k) / points;
        disk(
            itemsImage,
            cx + shadeRadius * Math.cos(angle),
            cy + shadeRadius * Math.sin(angle),
            0.9,
            colorOf(OBJECT_STARFISH_DARK),
        );
    }
    disk(itemsImage, cx, cy, 0.8, colorOf(OBJECT_INK));
}

savePng(ITEMS_SHEET.url, itemsImage);

// -----------------------------------------------------------------------
// items-large.png - the same four items, twice the size, for the pickup
// reveal (TASK-017). Built by copying the exact pixels just painted above,
// not by redrawing the shapes - see upscaleRegion's comment for why.
// -----------------------------------------------------------------------
{
    const itemsLargeSize = sheetSize(ITEMS_LARGE_SHEET);
    const itemsLargeImage = createImage(itemsLargeSize.x, itemsLargeSize.y);
    const scale = ITEM_LARGE_CELL / ITEM_CELL;
    for (const index of [ITEM_STARFISH, ITEM_CAN, ITEM_SHELL, ITEM_COIN]) {
        const smallRect = cellRect(ITEMS_SHEET, index);
        const largeRect = cellRect(ITEMS_LARGE_SHEET, index);
        const upscaled = upscaleRegion(itemsImage, smallRect.x, smallRect.y, smallRect.width, smallRect.height, scale);
        compositeInto(itemsLargeImage, upscaled, largeRect.x, largeRect.y);
    }
    savePng(ITEMS_LARGE_SHEET.url, itemsLargeImage);
}

// -----------------------------------------------------------------------
// decorations.png - loose bits scattered on the sand. The fourth cell is
// left untouched (fully transparent) - reserved for future decoration.
// -----------------------------------------------------------------------
{
    const size = sheetSize(DECORATIONS_SHEET);
    const image = createImage(size.x, size.y);

    {
        // Litter: a small crumpled two-tone scrap with a fold crease.
        const rows = ['........', '...AA...', '..AABB..', '.AABBIB.', '.ABBBBA.', '..BBAA..', '...AA...', '........'];
        const rect = cellRect(DECORATIONS_SHEET, DECORATION_LITTER);
        paintArt(image, rect.x, rect.y, rows, {
            A: colorOf(OBJECT_LITTER_A),
            B: colorOf(OBJECT_LITTER_B),
            I: colorOf(OBJECT_INK),
        });
    }

    {
        // Cup ring: a faint circular stain left behind on the sand.
        const rect = cellRect(DECORATIONS_SHEET, DECORATION_CUP_RING);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        ring(image, cx, cy, 3.3, 2.5, colorOf(OBJECT_CUP_RING));
    }

    {
        // Speck: a few scattered dark grains.
        const rows = ['........', '...I....', '........', '..I.....', '........', '....I...', '........', '........'];
        const rect = cellRect(DECORATIONS_SHEET, DECORATION_SPECK);
        paintArt(image, rect.x, rect.y, rows, { I: colorOf(OBJECT_INK) });
    }

    savePng(DECORATIONS_SHEET.url, image);
}

// -----------------------------------------------------------------------
// digits.png - a fixed-width bitmap font: 0-9 and a colon, one row, so
// TASK-013's Counter and Watch can draw numbers with BT.drawSprite alone -
// no text rendering anywhere in the HUD (PLAN.md section 4.11).
// -----------------------------------------------------------------------
{
    // Each glyph is 5 wide x 7 tall, left-aligned inside its 6x8 cell - the
    // spare column and row are kerning space between characters.
    const glyphs = {
        0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
        1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
        2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
        3: ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
        4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
        5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
        6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
        7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
        8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
        9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
    };
    const colonGlyph = ['00000', '00100', '00100', '00000', '00100', '00100', '00000'];

    // src/sprites.ts publishes that inked 5x7 size as DIGIT_GLYPH_WIDTH/HEIGHT
    // so callers that CENTRE a digit string (the watch's LCD window) can size
    // themselves to the ink rather than to the cell. Checked here, against the
    // actual art above, so redrawing a glyph a pixel wider can never silently
    // make that published number a lie.
    for (const [label, glyphRows] of [...Object.entries(glyphs), ['colon', colonGlyph]]) {
        assertRectangularRows(glyphRows, DIGIT_GLYPH_WIDTH, `digits.png glyph "${label}"`);
        if (glyphRows.length !== DIGIT_GLYPH_HEIGHT) {
            throw new Error(
                `digits.png glyph "${label}": expected ${DIGIT_GLYPH_HEIGHT} rows, got ${glyphRows.length}`,
            );
        }
    }

    const size = sheetSize(DIGITS_SHEET);
    const image = createImage(size.x, size.y);
    const accent = colorOf(HUD_ACCENT);

    function paintGlyph(index, glyphRows) {
        const rect = cellRect(DIGITS_SHEET, index);
        for (let ry = 0; ry < glyphRows.length; ry += 1) {
            const row = glyphRows[ry];
            for (let rx = 0; rx < row.length; rx += 1) {
                if (row[rx] === '1') {
                    setPixel(image, rect.x + rx, rect.y + ry, accent);
                }
            }
        }
    }

    for (let digit = 0; digit <= 9; digit += 1) {
        paintGlyph(digit, glyphs[digit]);
    }
    paintGlyph(DIGIT_COLON_INDEX, colonGlyph);

    savePng(DIGITS_SHEET.url, image);
}

// -----------------------------------------------------------------------
// icons.png - small bitmap icons for the title/results screens (TASK-014).
// Painted using ONLY HUD-range colors (HUD_INK/HUD_PAPER/HUD_ACCENT/HUD_METAL) rather than the object
// ramp every sprite above uses - these two screens have no time-of-day of their own, so nothing here
// may ever be touched by TASK-015's eventual world-ramp fade.
// -----------------------------------------------------------------------
{
    const size = sheetSize(ICONS_SHEET);
    const image = createImage(size.x, size.y);

    {
        // ICON_FOUND: a magnifying glass - a pale lens with a dark outline, plus a short diagonal
        // handle running toward the icon's bottom-right corner. Reads as "search results" - a natural
        // fit for "how many buried items this run found".
        const rect = cellRect(ICONS_SHEET, ICON_FOUND);
        const lensCx = rect.x + 4.5;
        const lensCy = rect.y + 4.5;
        disk(image, lensCx, lensCy, 3.4, colorOf(HUD_PAPER));
        ring(image, lensCx, lensCy, 3.4, 2.5, colorOf(HUD_INK));
        for (let i = 0; i < 4; i += 1) {
            setPixel(image, lensCx + 2.6 + i, lensCy + 2.6 + i, colorOf(HUD_INK));
        }
    }

    {
        // ICON_BEST: a regular 5-point star (starVertices/fillPolygon - the same technique the
        // starfish item above uses), outline underneath and a slightly smaller bright fill on top.
        // The universal "your best" mark.
        const rect = cellRect(ICONS_SHEET, ICON_BEST);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        fillPolygon(image, starVertices(cx, cy, 5.6, 2.3, 5, -90), colorOf(HUD_INK));
        fillPolygon(image, starVertices(cx, cy, 4.6, 1.8, 5, -90), colorOf(HUD_ACCENT));
    }

    {
        // ICON_SEED: a die showing five pips, the classic layout every physical die uses for "5".
        // Reads as "randomness / which layout", which is exactly what the seed number beside it means.
        const rect = cellRect(ICONS_SHEET, ICON_SEED);
        fillRect(image, rect.x + 1, rect.y + 1, rect.width - 2, rect.height - 2, colorOf(HUD_INK));
        fillRect(image, rect.x + 2, rect.y + 2, rect.width - 4, rect.height - 4, colorOf(HUD_PAPER));
        const pipPositions = [
            [rect.x + 3.5, rect.y + 3.5],
            [rect.x + 8.5, rect.y + 3.5],
            [rect.x + 6, rect.y + 6],
            [rect.x + 3.5, rect.y + 8.5],
            [rect.x + 8.5, rect.y + 8.5],
        ];
        for (const [px, py] of pipPositions) {
            disk(image, px, py, 0.9, colorOf(HUD_INK));
        }
    }

    {
        // ICON_PLAY: a right-pointing triangle, the universal "play/start" glyph - outline underneath,
        // a slightly smaller bright fill on top, the same outline+fill technique every item above uses.
        const rect = cellRect(ICONS_SHEET, ICON_PLAY);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        fillPolygon(
            image,
            [
                [cx - 3.4, cy - 4.6],
                [cx - 3.4, cy + 4.6],
                [cx + 4.4, cy],
            ],
            colorOf(HUD_INK),
        );
        fillPolygon(
            image,
            [
                [cx - 2.2, cy - 3.2],
                [cx - 2.2, cy + 3.2],
                [cx + 3.0, cy],
            ],
            colorOf(HUD_ACCENT),
        );
    }

    {
        // ICON_RESTART: a circular arrow - a ring left open for roughly a sixth of a turn, closed off
        // with a small triangular arrowhead at the open end, reading as "loop / play again".
        const rect = cellRect(ICONS_SHEET, ICON_RESTART);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const headAngleDeg = 220;
        arcRing(image, cx, cy, 4.6, 3.2, -50, headAngleDeg, colorOf(HUD_INK));
        const headAngleRad = (headAngleDeg * Math.PI) / 180;
        const headRadius = 3.9;
        const hx = cx + headRadius * Math.cos(headAngleRad);
        const hy = cy + headRadius * Math.sin(headAngleRad);
        const tangentAngleRad = headAngleRad + Math.PI / 2; // perpendicular to the ring at that point
        fillPolygon(
            image,
            [
                [hx + 2.2 * Math.cos(tangentAngleRad), hy + 2.2 * Math.sin(tangentAngleRad)],
                [hx - 2.2 * Math.cos(tangentAngleRad), hy - 2.2 * Math.sin(tangentAngleRad)],
                [hx + 2.6 * Math.cos(headAngleRad), hy + 2.6 * Math.sin(headAngleRad)],
            ],
            colorOf(HUD_INK),
        );
    }

    savePng(ICONS_SHEET.url, image);
}

console.log('All sprites generated.');
