// Copied from svg-panel's src/raster.ts by scripts/build.mjs: edit src/, then rebuild.

// The terminal branch: a picture as the cells of a `Raster`, the terminal's
// own element, since the terminal draws no `Svg`. Chafa's way, in a few
// hundred lines: the picture's shapes are painted on dots, two across and four
// down per cell; each cell takes the symbol and the two colours that best
// repeat its eight dots (a half or quarter block, a full block, or braille for
// a thin line); and every label is set in letters over the cells it falls on,
// so figures stay sharp.

import { clamp, type Picture } from './core.ts'
import { hexRgb, type Rgb } from './dots.ts'
import { readSvg, type Label } from './readSvg.ts'
import { pickTheme, type Theme } from './theme.ts'

/** A Raster's colour for the terminal's own: bit 24 alone. */
export const DEFAULT_COLOR = 0x01000000

/** CSS pixels a cell spans across by default: 8 by 16, about a terminal's own cell beside 11px text. */
export const CELL_PX = 8

/** The most a Raster may be, in cells. */
export const RASTER_MAX = { columns: 512, rows: 256 }

/** One cell: a code point, and a foreground and a background as `0xRRGGBB` or `DEFAULT_COLOR`. */
export type Cell = { ch: number; fg: number; bg: number }

export type Grid = { columns: number; rows: number; cells: Cell[] }

/** A Raster's size and cells: what the element takes beside its `key`. */
export type RasterCells = { columns: number; rows: number; cells: string }

/** The same with the `key` the mod chose, ready to spread: `<Raster {...toRaster(picture, { key })} />`. */
export type RasterPicture = RasterCells & { key: string }

export type RasterOptions = {
  /** How many cells across; `CELL_PX` CSS pixels a cell by default. */
  columns?: number
  /** What a dot the picture leaves bare is mixed with at an edge: the theme's surface. */
  theme?: Theme | 'dark' | 'light'
  /** That colour as a hex, over the theme's. */
  backdrop?: string
}

// A cell's eight dots are numbered row by row: bit `row * 2 + column`.

/** Every split of a cell into quarters (two dots by two), by the mask of its inked dots. */
export const BLOCK_GLYPHS: Readonly<Record<number, string>> = {
  0x00: ' ',
  0x0f: '▀',
  0xf0: '▄',
  0x55: '▌',
  0xaa: '▐',
  0x05: '▘',
  0x0a: '▝',
  0x50: '▖',
  0xa0: '▗',
  0xa5: '▚',
  0x5a: '▞',
  0xf5: '▙',
  0x5f: '▛',
  0xaf: '▜',
  0xfa: '▟',
  0xff: '█',
}
const BLOCK_MASKS = Object.keys(BLOCK_GLYPHS).map(Number)

/** Where each of the cell's dots is in a braille character: dots 1-2-3 and 7 down the left, 4-5-6 and 8 down the right. */
const BRAILLE_BIT = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80]

/** The braille character inking the dots of `mask`. */
export function brailleOf(mask: number): string {
  let bits = 0
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) bits |= BRAILLE_BIT[i]!
  return String.fromCharCode(0x2800 + bits)
}

/**
 * How much of its square a braille dot inks. A braille cell shows its
 * foreground only there, so it wins only where a block would smear a line.
 */
export const BRAILLE_INK = 0.5

/**
 * How much better than the best block a braille fit must be: a fifth less
 * error, and more than a sliver, so a flat or nearly flat cell stays a block.
 */
const BRAILLE_EDGE = { ratio: 0.8, least: 64 }

type Fit = { ch: string; fg: Rgb; bg: Rgb; error: number }

// Scratch for the fit, reused cell to cell: the dots' channels, two side means.
const V = new Float64Array(24)
const IN = new Float64Array(3)
const OUT = new Float64Array(3)

/** The mean of the dots in (`inked`) or out of `mask`, into `to`. */
function sideMean(mask: number, inked: number, to: Float64Array): void {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < 8; i++) {
    if (((mask >> i) & 1) === inked) {
      r += V[i * 3]!
      g += V[i * 3 + 1]!
      b += V[i * 3 + 2]!
      n++
    }
  }
  to[0] = n === 0 ? 0 : r / n
  to[1] = n === 0 ? 0 : g / n
  to[2] = n === 0 ? 0 : b / n
}

/** The squared error of drawing the cell's dots in `ink` where `mask` is set and `bare` elsewhere. */
function splitError(mask: number, ink: ArrayLike<number>, bare: ArrayLike<number>): number {
  let error = 0
  for (let i = 0; i < 8; i++) {
    const c = (mask >> i) & 1 ? ink : bare
    error += (V[i * 3]! - c[0]!) ** 2 + (V[i * 3 + 1]! - c[1]!) ** 2 + (V[i * 3 + 2]! - c[2]!) ** 2
  }
  return error
}

function distance2(a: ArrayLike<number>, b: ArrayLike<number>): number {
  return (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2
}

const rgb = (a: ArrayLike<number>): Rgb => [a[0]!, a[1]!, a[2]!]
const unpack = (c: number): Rgb => [(c >> 16) & 255, (c >> 8) & 255, c & 255]

/**
 * The symbol and colours that best repeat a cell's eight dots (row by row),
 * by the least squared error. Of a block's two colours, the one nearer the
 * backdrop goes behind, so the surface stays one colour from cell to cell.
 * `inks` (the canvas's, `0xRRGGBB` or -1 a dot) give a braille line its own
 * colour where its dots are blends.
 */
export function fitCell(dots: readonly Rgb[], backdrop: Rgb, inks: readonly number[] = []): Fit {
  dots.forEach((c, i) => {
    V[i * 3] = c[0]
    V[i * 3 + 1] = c[1]
    V[i * 3 + 2] = c[2]
  })
  let block: Fit | undefined
  for (const mask of BLOCK_MASKS) {
    if (mask > (~mask & 0xff)) continue // a split and its inverse are one fit
    sideMean(mask, 1, IN)
    sideMean(mask, 0, OUT)
    const error = splitError(mask, IN, OUT)
    if (block !== undefined && error >= block.error - 1e-6) continue
    if (mask === 0) block = { ch: ' ', fg: rgb(OUT), bg: rgb(OUT), error }
    else if (distance2(IN, backdrop) < distance2(OUT, backdrop)) block = { ch: BLOCK_GLYPHS[~mask & 0xff]!, fg: rgb(OUT), bg: rgb(IN), error }
    else block = { ch: BLOCK_GLYPHS[mask]!, fg: rgb(IN), bg: rgb(OUT), error }
  }
  // Braille must beat the block by its edge: a block this close leaves it nothing to win.
  const needed = block!.error * BRAILLE_EDGE.ratio - BRAILLE_EDGE.least
  if (needed <= 0) return block!
  const own = dots.map((_, i) => ((inks[i] ?? -1) >= 0 ? unpack(inks[i]!) : undefined))
  let braille: { mask: number; ink: Rgb; bare: Rgb; error: number } | undefined
  const shown = new Float64Array(3)
  for (let mask = 1; mask < 0xff; mask++) {
    // Behind the dots, what the shapes there are, not their blend with the line's soft edge:
    // the blend would tint the cell into a patch.
    let n = 0
    OUT.fill(0)
    for (let i = 0; i < 8; i++) {
      if ((mask >> i) & 1) continue
      const c = own[i] ?? V.subarray(i * 3, i * 3 + 3)
      for (let k = 0; k < 3; k++) OUT[k] = OUT[k]! + c[k]!
      n++
    }
    for (let k = 0; k < 3; k++) OUT[k] = OUT[k]! / n
    // The ink is the colour that stands out most among the dots: a shape's own where the canvas knows it.
    let ink: ArrayLike<number> = OUT
    let far = -1
    for (let i = 0; i < 8; i++) {
      if (!((mask >> i) & 1)) continue
      const c = own[i] ?? V.subarray(i * 3, i * 3 + 3)
      const d = distance2(c, OUT)
      if (d > far) {
        far = d
        ink = c
      }
    }
    // Dots are ink on the surface, never the surface pricked out of ink.
    if (distance2(OUT, backdrop) > distance2(ink, backdrop)) continue
    for (let c = 0; c < 3; c++) shown[c] = OUT[c]! + BRAILLE_INK * (ink[c]! - OUT[c]!)
    const error = splitError(mask, shown, OUT)
    if (braille === undefined || error < braille.error) braille = { mask, ink: rgb(ink), bare: rgb(OUT), error }
  }
  if (braille !== undefined && braille.error < needed) {
    return { ch: brailleOf(braille.mask), fg: braille.ink, bg: braille.bare, error: braille.error }
  }
  return block!
}

/** A colour as `0xRRGGBB`. */
export function packRgb(c: Rgb): number {
  const q = (v: number) => Math.round(clamp(v, 0, 255))
  return (q(c[0]) << 16) | (q(c[1]) << 8) | q(c[2])
}

/**
 * How near a blend must be to one of the picture's own colours to be drawn in
 * it: within this, a surface or a line keeps its exact colour cell to cell.
 */
const OWN_COLOR = 6

/**
 * A colour for a cell: the picture's own colour it is near, else the blend on
 * 32 steps a channel, so the terminal's palette (1024 pairs at once) holds it.
 */
function cellColor(c: Rgb, own: readonly Rgb[]): number {
  for (const o of own) if (distance2(c, o) <= OWN_COLOR * OWN_COLOR) return packRgb(o)
  const q = (v: number) => (Math.round((clamp(v, 0, 255) / 255) * 31) * 255) / 31
  return packRgb([q(c[0]), q(c[1]), q(c[2])])
}

/** Ranges of code points a terminal draws two columns wide (East Asian wide, emoji). */
const WIDE: readonly [number, number][] = [
  [0x1100, 0x115f], [0x231a, 0x231b], [0x2329, 0x232a], [0x23e9, 0x23ec], [0x23f0, 0x23f0], [0x23f3, 0x23f3],
  [0x25fd, 0x25fe], [0x2614, 0x2615], [0x2648, 0x2653], [0x267f, 0x267f], [0x2693, 0x2693], [0x26a1, 0x26a1],
  [0x26aa, 0x26ab], [0x26bd, 0x26be], [0x26c4, 0x26c5], [0x26ce, 0x26ce], [0x26d4, 0x26d4], [0x26ea, 0x26ea],
  [0x26f2, 0x26f3], [0x26f5, 0x26f5], [0x26fa, 0x26fa], [0x26fd, 0x26fd], [0x2705, 0x2705], [0x270a, 0x270b],
  [0x2728, 0x2728], [0x274c, 0x274c], [0x274e, 0x274e], [0x2753, 0x2755], [0x2757, 0x2757], [0x2795, 0x2797],
  [0x27b0, 0x27b0], [0x27bf, 0x27bf], [0x2b1b, 0x2b1c], [0x2b50, 0x2b50], [0x2b55, 0x2b55], [0x2e80, 0x303e],
  [0x3041, 0x33ff], [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf], [0xa960, 0xa97f], [0xac00, 0xd7a3],
  [0xd800, 0xdfff], [0xf900, 0xfaff], [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60], [0xffe0, 0xffe6],
]

/** Ranges that take no column of their own: combining marks, joiners, variation selectors. */
const ZERO: readonly [number, number][] = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f], [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x20d0, 0x20ff], [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f], [0xfeff, 0xfeff],
]

const within = (cp: number, ranges: readonly [number, number][]) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi)

/**
 * A label's characters as cells take them: one printable, one-column BMP
 * character each. A control character becomes a space, a wide or astral one
 * `?`, and a mark that takes no column is dropped.
 */
export function cellChars(words: string): number[] {
  const out: number[] = []
  for (const ch of words) {
    const cp = ch.codePointAt(0)!
    if (within(cp, ZERO)) continue
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) out.push(0x20)
    else if (cp > 0xffff || within(cp, WIDE)) out.push(0x3f)
    else out.push(cp)
  }
  return out
}

/** Sets a label in letters: on the row its middle falls in, from the column its anchor gives, kept inside. */
function setLabel(grid: Grid, label: Label): void {
  const chars = cellChars(label.words).slice(0, grid.columns)
  if (chars.length === 0) return
  const row = Math.floor((label.y - label.size * 0.35) / 4)
  if (row < 0 || row >= grid.rows) return
  const at = label.x / 2
  const start = label.anchor === 'middle' ? Math.round(at - chars.length / 2) : label.anchor === 'end' ? Math.round(at) - chars.length : Math.round(at)
  const first = clamp(start, 0, grid.columns - chars.length)
  const fg = packRgb(label.color)
  chars.forEach((ch, i) => {
    const cell = grid.cells[row * grid.columns + first + i]!
    // The letter goes on the cell's background: what is under it, the surface, gives way.
    grid.cells[row * grid.columns + first + i] = { ch, fg, bg: cell.bg }
  })
}

function backdropOf(options: RasterOptions): Rgb {
  return (options.backdrop === undefined ? undefined : hexRgb(options.backdrop)) ?? hexRgb(pickTheme(options.theme).surface)!
}

/** A picture (or a whole `<svg>`) as a grid of cells, before it is packed. */
export function rasterGrid(picture: Picture | string, options: RasterOptions = {}): Grid {
  const svg = typeof picture === 'string' ? picture : picture.svg
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const width = Number(/\swidth="([\d.]+)"/.exec(root)?.[1] ?? CELL_PX)
  const height = Number(/\sheight="([\d.]+)"/.exec(root)?.[1] ?? 16)
  const columns = clamp(Math.round(options.columns ?? Math.ceil(width / CELL_PX)), 1, RASTER_MAX.columns)
  const scale = Math.min((2 * columns) / width, (4 * RASTER_MAX.rows) / height)
  const painted = readSvg(svg, scale)
  const backdrop = backdropOf(options)
  const { data, width: across } = painted.dots
  const grid: Grid = { columns: painted.columns, rows: painted.rows, cells: [] }
  const own = [backdrop, ...[...new Set(painted.dots.ink)].filter(c => c >= 0).map(unpack)]
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const cellDots: Rgb[] = []
      const inks: number[] = []
      let most = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((row * 4 + dy) * across + col * 2 + dx) * 4
          const a = data[i + 3]!
          most = Math.max(most, a)
          inks.push(painted.dots.ink[i / 4]!)
          cellDots.push([0, 1, 2].map(c => data[i + c]! + backdrop[c]! * (1 - a)) as unknown as Rgb)
        }
      }
      if (most < 0.02) {
        // Nothing painted here: the terminal's own background shows.
        grid.cells.push({ ch: 0x20, fg: DEFAULT_COLOR, bg: DEFAULT_COLOR })
        continue
      }
      const fit = fitCell(cellDots, backdrop, inks)
      grid.cells.push({ ch: fit.ch.codePointAt(0)!, fg: cellColor(fit.fg, own), bg: cellColor(fit.bg, own) })
    }
  }
  for (const label of painted.labels) setLabel(grid, label)
  return grid
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

function toBase64(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]!
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63]! : '='
    out += i + 2 < bytes.length ? BASE64[n & 63]! : '='
  }
  return out
}

function fromBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let n = 0
  let bits = 0
  let k = 0
  for (const ch of clean) {
    const v = BASE64.indexOf(ch)
    if (v < 0) throw new RangeError(`svg-panel: ${JSON.stringify(ch)} is not base64`)
    n = (n << 6) | v
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[k++] = (n >> bits) & 255
    }
  }
  return bytes
}

/** The cells as a Raster takes them: base64 of little-endian u32 triplets `[codePoint, fg, bg]`, row by row. */
export function encodeCells(grid: Grid): string {
  const bytes = new Uint8Array(grid.cells.length * 12)
  grid.cells.forEach((cell, i) => {
    ;[cell.ch, cell.fg, cell.bg].forEach((word, j) => {
      const o = i * 12 + j * 4
      bytes[o] = word & 255
      bytes[o + 1] = (word >>> 8) & 255
      bytes[o + 2] = (word >>> 16) & 255
      bytes[o + 3] = (word >>> 24) & 255
    })
  })
  return toBase64(bytes)
}

/** A Raster's `cells` back as a grid, for a test or a blit that changes a few cells. */
export function decodeCells(cells: string, columns: number, rows: number): Grid {
  const bytes = fromBase64(cells)
  if (bytes.length !== columns * rows * 12) {
    throw new RangeError(`svg-panel: ${bytes.length} bytes is not ${columns} × ${rows} cells`)
  }
  const word = (o: number) => (bytes[o]! | (bytes[o + 1]! << 8) | (bytes[o + 2]! << 16) | (bytes[o + 3]! << 24)) >>> 0
  const out: Cell[] = []
  for (let i = 0; i < columns * rows; i++) out.push({ ch: word(i * 12), fg: word(i * 12 + 4), bg: word(i * 12 + 8) })
  return { columns, rows, cells: out }
}

/** The grid's characters alone, a line a row. */
export function gridText(grid: Grid): string {
  const lines: string[] = []
  for (let row = 0; row < grid.rows; row++) {
    lines.push(String.fromCodePoint(...grid.cells.slice(row * grid.columns, (row + 1) * grid.columns).map(c => c.ch)))
  }
  return lines.join('\n')
}

/** The grid in 24-bit ANSI colour, to print in a terminal outside Claude Code (a preview, a log). */
export function ansi(grid: Grid): string {
  const color = (c: number, ground: 38 | 48) =>
    c === DEFAULT_COLOR ? `\x1b[${ground + 1}m` : `\x1b[${ground};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`
  const lines: string[] = []
  for (let row = 0; row < grid.rows; row++) {
    let line = ''
    for (const c of grid.cells.slice(row * grid.columns, (row + 1) * grid.columns)) {
      line += color(c.fg, 38) + color(c.bg, 48) + String.fromCodePoint(c.ch)
    }
    lines.push(`${line}\x1b[0m`)
  }
  return lines.join('\n')
}

/**
 * A picture as a `Raster`'s size and cells, for the terminal. With a `key`,
 * the key comes back with them, so the result spreads into the element:
 * `<Raster {...toRaster(picture, { key: 'cpu' })} />`.
 */
export function toRaster(picture: Picture | string, options: RasterOptions & { key: string }): RasterPicture
export function toRaster(picture: Picture | string, options?: RasterOptions): RasterCells
export function toRaster(picture: Picture | string, options: RasterOptions & { key?: string } = {}): RasterCells | RasterPicture {
  const grid = rasterGrid(picture, options)
  const cells: RasterCells = { columns: grid.columns, rows: grid.rows, cells: encodeCells(grid) }
  return options.key === undefined ? cells : { key: options.key, ...cells }
}
