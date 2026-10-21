// A grid of cells in five steps of one colour, with row and column labels and
// a `less ■■■■■ more` key; a missing value is a short dash.

import { abbreviate, assertBudget, num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { pickTheme, type Theme } from './theme.ts'

export type HeatmapData = {
  /** Rows of values, top to bottom; a value that is not a finite number is missing. */
  values: readonly (readonly (number | null | undefined)[])[]
  rowLabels?: readonly string[]
  colLabels?: readonly string[]
}

export type HeatmapOptions = {
  theme?: Theme | 'dark' | 'light'
  /** A cell's side in CSS pixels; 14 by default, which with the gap is two terminal columns a cell. */
  cell?: number
  gap?: number
  /** The scale's ends; the data's by default. */
  min?: number
  max?: number
  /** The colour of the top step; the theme's blue by default. */
  color?: string
  /** What the cells are, for the alt text. */
  label?: string
  /** Draw the `less … more` key under the grid. */
  key?: boolean
  format?: (value: number) => string
  background?: boolean
}

export const HEAT_STEPS = 5
/** The twin's shades: a space for a missing value, then one per step, faint to full. */
export const HEAT_SHADES = ' ·░▒▓█'

/** The step (0 to 4) a value falls in on `[lo, hi]`. */
export function heatStep(value: number, lo: number, hi: number): number {
  if (hi <= lo) return HEAT_STEPS - 1
  return Math.min(HEAT_STEPS - 1, Math.max(0, Math.floor(((value - lo) / (hi - lo)) * HEAT_STEPS)))
}

/** `#rgb` or `#rrggbb` as three channels; black when it is neither. */
function channels(hex: string): number[] {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim())
  const full = m ? (m[1]!.length === 3 ? [...m[1]!].map(c => c + c).join('') : m[1]!) : '000000'
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}

function mix(a: string, b: string, t: number): string {
  const [x, y] = [channels(a), channels(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i]! - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** The five fills, from faint to full, mixed from the grid colour to `color`. */
export function heatColors(theme: Theme, color: string): string[] {
  return Array.from({ length: HEAT_STEPS }, (_, k) => mix(theme.grid, color, 0.2 + (0.8 * k) / (HEAT_STEPS - 1)))
}

export function heatmap(data: HeatmapData, options: HeatmapOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const size = options.cell ?? 14
  const gap = options.gap ?? 2
  const pitch = size + gap
  const fills = heatColors(theme, options.color ?? theme.series.blue)
  const rows = data.values
  const columns = Math.max(0, ...rows.map(r => r.length))
  const present = rows.flatMap(r => r.filter((v): v is number => typeof v === 'number' && Number.isFinite(v)))
  let lo = Infinity
  let hi = -Infinity
  for (const v of present) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  lo = options.min ?? (present.length ? lo : 0)
  hi = options.max ?? (present.length ? hi : 1)

  const rowLabels = data.rowLabels ?? []
  const colLabels = data.colLabels ?? []
  // The grid starts on a terminal cell's corner (8 by 16 CSS pixels), so on a Raster each cell keeps to its own
  // columns and rows; the row labels get room for a terminal's letters, which run wider than the Svg's.
  const labelRoom = (l: string) => Math.max(textWidth(l, 10), [...l].length * 8)
  const left = Math.ceil((6 + (rowLabels.length ? Math.max(...rowLabels.map(labelRoom)) + 6 : 0)) / 8) * 8
  const top = Math.ceil((6 + (colLabels.length ? 14 : 0)) / 16) * 16
  const showKey = options.key ?? true
  const gridW = columns * pitch - gap
  const keyW = textWidth('less', 10) + 6 + HEAT_STEPS * pitch + textWidth('more', 10) + 4
  const width = Math.ceil(left + Math.max(gridW, showKey ? keyW : 0) + 6)
  const height = Math.ceil(top + rows.length * pitch - gap + (showKey ? 22 : 6))
  const parts: string[] = []

  // Column labels where they fit: every k-th, so none runs into the next.
  const stride = Math.max(1, Math.ceil((Math.max(0, ...colLabels.map(l => textWidth(l, 10))) + 4) / pitch))
  colLabels.forEach((l, c) => {
    if (c % stride === 0 && c < columns) parts.push(text(left + c * pitch, top - 4, l, { size: 10, fill: theme.muted, cls: 'heat-col' }))
  })
  rows.forEach((row, r) => {
    const y = top + r * pitch
    if (rowLabels[r] !== undefined) parts.push(text(left - 6, y + size - 2, rowLabels[r]!, { size: 10, fill: theme.muted, anchor: 'end', cls: 'heat-row' }))
    for (let c = 0; c < columns; c++) {
      const v = row[c]
      const x = left + c * pitch
      const ok = typeof v === 'number' && Number.isFinite(v)
      parts.push(ok
        ? `<rect class="heat-cell" x="${num(x)}" y="${num(y)}" width="${size}" height="${size}" rx="2" fill="${fills[heatStep(v, lo, hi)]}"/>`
        : `<rect class="heat-empty" x="${num(x + size / 2 - 3)}" y="${num(y + size / 2 - 1)}" width="6" height="2" rx="1" fill="${theme.muted}"/>`)
    }
  })
  if (showKey) {
    const ky = top + rows.length * pitch - gap + 8
    const kx = left + Math.max(gridW, keyW) - keyW
    parts.push(text(kx, ky + 9, 'less', { size: 10, fill: theme.muted, cls: 'heat-key' }))
    const sx = kx + textWidth('less', 10) + 6
    fills.forEach((f, k) => parts.push(`<rect x="${num(sx + k * pitch)}" y="${num(ky)}" width="${size}" height="${size}" rx="2" fill="${f}"/>`))
    parts.push(text(sx + HEAT_STEPS * pitch + 2, ky + 9, 'more', { size: 10, fill: theme.muted }))
  }

  // The hottest cell, named by its labels where there are labels.
  let best: { r: number; c: number; v: number } | undefined
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (typeof v === 'number' && Number.isFinite(v) && (best === undefined || v > best.v)) best = { r, c, v }
  }))
  const name = options.label ?? 'Heatmap'
  const where = best === undefined ? '' : [rowLabels[best.r], colLabels[best.c]].filter(Boolean).join(', ')
  const alt = present.length === 0
    ? `${name}: no values yet`
    : `${name}: ${rows.length} rows by ${columns} columns, low ${fmt(Math.min(...present))}, high ${fmt(best!.v)}${where ? ` at ${where}` : ''}`
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  // The twin: one shade a cell, a line a row, the rows' labels in front.
  const pad = Math.max(0, ...rowLabels.map(l => [...l].length))
  const twin = rows.map((row, r) => {
    const shades = Array.from({ length: columns }, (_, c) => {
      const v = row[c]
      return typeof v === 'number' && Number.isFinite(v) ? HEAT_SHADES[1 + heatStep(v, lo, hi)] : HEAT_SHADES[0]
    }).join('')
    return pad === 0 ? shades : `${(rowLabels[r] ?? '').padEnd(pad)} ${shades}`
  }).join('\n')
  return { svg: assertBudget(svg), alt, twin, isInteractive: false }
}
