/**
 * ESC/POS raster printing — the paper is sent as a picture, not as text.
 *
 * Why a picture: thermal printers only know their built-in code pages, and
 * none of them has the Uzbek Cyrillic letters of the menu (Қ, Ғ, Ҳ, Ў). The
 * browser draws every page with the same renderer as the on-screen preview,
 * the server turns it into black and white dots here, so preview == paper
 * on any printer that understands `GS v 0` (practically all of them).
 */

/** 80 mm paper: 72 mm printable at 203 dpi = 576 dots per line. */
export const PAPER_DOTS = 576;

const ESC = 0x1b;
const GS = 0x1d;

/** Rows per `GS v 0` command — small bands are safe for cheap printer buffers. */
const BAND_ROWS = 256;

/** Dots darker than this (0–255) are printed. */
const INK_THRESHOLD = 160;

/** A page as printer dots: `bytesPerRow` bytes per row, 1 bit = 1 black dot. */
export interface RasterPage {
  bytesPerRow: number;
  rows: number;
  data: Buffer;
}

/**
 * Packs a greyscale image (one byte per pixel, `channels` bytes per pixel)
 * into printer dots. Blank paper at the bottom is dropped — the cut follows
 * the last line of print.
 */
export function toRaster(
  pixels: Buffer,
  width: number,
  height: number,
  channels = 1,
): RasterPage {
  const bytesPerRow = Math.ceil(width / 8);
  const data = Buffer.alloc(bytesPerRow * height);
  let lastInkRow = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * channels] < INK_THRESHOLD) {
        data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
        lastInkRow = y;
      }
    }
  }
  const rows = Math.min(height, lastInkRow + 1 + 8);
  return {
    bytesPerRow,
    rows,
    data: data.subarray(0, bytesPerRow * rows),
  };
}

/** One print job: reset, every page as raster bands, feed and cut after each. */
export function rasterJob(pages: RasterPage[]): Buffer {
  const parts: Buffer[] = [Buffer.from([ESC, 0x40])];
  for (const page of pages) {
    for (let top = 0; top < page.rows; top += BAND_ROWS) {
      const rows = Math.min(BAND_ROWS, page.rows - top);
      parts.push(
        Buffer.from([
          GS,
          0x76,
          0x30,
          0x00,
          page.bytesPerRow & 0xff,
          page.bytesPerRow >> 8,
          rows & 0xff,
          rows >> 8,
        ]),
        page.data.subarray(
          top * page.bytesPerRow,
          (top + rows) * page.bytesPerRow,
        ),
      );
    }
    // Feed 4 lines so the last print clears the cutter, then a partial cut.
    parts.push(Buffer.from([ESC, 0x64, 0x04, GS, 0x56, 0x42, 0x00]));
  }
  return Buffer.concat(parts);
}
