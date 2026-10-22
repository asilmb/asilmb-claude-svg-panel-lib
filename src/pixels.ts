// The pixel branch: a picture as RGBA pixels over a box of terminal cells, for
// a terminal that draws pictures (Claude Code's `Image`, a kitty escape). The
// same painter as the Raster's, at more dots a cell; the labels are not set,
// since the library carries no font.

import { clamp, type Picture } from './core.ts'
import { CELL_PX } from './raster.ts'
import { readSvg } from './readSvg.ts'

/** Straight (not premultiplied) RGBA, four bytes a pixel, row by row. */
export type Pixels = { width: number; height: number; data: Uint8Array }

/** The pixels and the box of cells they fill. */
export type PixelPicture = Pixels & { columns: number; rows: number }

export type PixelOptions = {
  /** How many cells across; `CELL_PX` CSS pixels a cell by default. */
  columns?: number
  /** Pixels across a cell, twice that down; less where the limits ask. */
  cellPixels?: number
  /**
   * The most bytes the pixels may take: an Image's 2 MiB by default. The
   * Images of one tree share those 2 MiB, so a pane of several splits them.
   */
  maxBytes?: number
}

/** Pixels across a cell by default: twice a common cell's 8, so the picture stays sharp on a dense screen. */
export const CELL_PIXELS = 16

/** What an `Image` takes: a box of 1 to 255 cells a side, 2048 pixels a side, 2 MiB of bytes (and so does a whole tree of Images). */
export const PIXELS_MAX = { cells: 255, side: 2048, bytes: 2 * 1024 * 1024 }

/**
 * A picture (or a whole `<svg>`) as pixels over whole cells, a cell twice as
 * tall as it is wide, as the Raster's are: the box keeps the picture's shape,
 * and the pixels past the picture's edge are clear.
 */
export function toPixels(picture: Picture | string, options: PixelOptions = {}): PixelPicture {
  const svg = typeof picture === 'string' ? picture : picture.svg
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const width = Number(/\swidth="([\d.]+)"/.exec(root)?.[1] ?? CELL_PX)
  const height = Number(/\sheight="([\d.]+)"/.exec(root)?.[1] ?? 2 * CELL_PX)
  const columns = clamp(Math.round(options.columns ?? Math.ceil(width / CELL_PX)), 1, PIXELS_MAX.cells)
  // A cell's width in CSS pixels: a tall picture widens it to fit the most rows.
  const cellCss = Math.max(width / columns, height / (2 * PIXELS_MAX.cells))
  const rows = clamp(Math.ceil(height / (2 * cellCss) - 1e-6), 1, PIXELS_MAX.cells)
  const fit = Math.min(
    options.cellPixels ?? CELL_PIXELS,
    PIXELS_MAX.side / columns,
    PIXELS_MAX.side / (2 * rows),
    Math.sqrt(Math.min(options.maxBytes ?? PIXELS_MAX.bytes, PIXELS_MAX.bytes) / (4 * 2 * columns * rows)),
  )
  const px = Math.max(1, Math.floor(fit))
  const out: PixelPicture = { width: columns * px, height: rows * 2 * px, data: new Uint8Array(columns * px * rows * 2 * px * 4), columns, rows }
  const painted = readSvg(svg, px / cellCss).dots
  const w = Math.min(out.width, painted.width)
  const h = Math.min(out.height, painted.height)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * painted.width + x) * 4
      const a = painted.data[i + 3]!
      if (a <= 0) continue
      const o = (y * out.width + x) * 4
      // The canvas is premultiplied; the bytes are not.
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(clamp(painted.data[i + c]! / a, 0, 255))
      out.data[o + 3] = Math.round(clamp(a, 0, 1) * 255)
    }
  }
  return out
}
