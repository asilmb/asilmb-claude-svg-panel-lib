// Twins: the plain-text forms a terminal prints where the app draws a picture.

import { clamp, extent, finite } from './core.ts'

export const BAR_FULL = '█'
export const BAR_EMPTY = '░'
export const BAR_TICK = '│'
export const BLOCKS = '▁▂▃▄▅▆▇█'

export type BarOptions = { width?: number; min?: number; tick?: number }

/**
 * A `█░` bar `width` cells wide filled to `value`, with `│` in the cell where
 * `tick` falls. `bar(236, 300, { tick: 270 })` is `████████████████░░│░`.
 */
export function bar(value: number, max: number, options: BarOptions = {}): string {
  const { width = 20, min = 0, tick } = options
  const cells = Math.max(1, Math.round(width))
  const at = (v: number) => (max === min ? 0 : clamp((finite(v, min) - min) / (max - min), 0, 1))
  const filled = Math.round(at(value) * cells)
  const chars: string[] = Array.from({ length: cells }, (_, i) => (i < filled ? BAR_FULL : BAR_EMPTY))
  if (tick !== undefined && Number.isFinite(tick)) {
    chars[clamp(Math.round(at(tick) * cells), 0, cells - 1)] = BAR_TICK
  }
  return chars.join('')
}

export type BlocksOptions = { min?: number; max?: number; width?: number }

/** One `▁`..`█` block per value, low to high; thinned to `width` when longer. */
export function blocks(values: readonly number[], options: BlocksOptions = {}): string {
  const kept = options.width === undefined ? values : thin(values.length, options.width).map(i => values[i] ?? 0)
  const clean = kept.map(v => finite(v))
  if (clean.length === 0) return ''
  const range = extent(clean)
  const lo = options.min ?? range.lo
  const hi = options.max ?? range.hi
  const top = BLOCKS.length - 1
  return clean
    .map(v => BLOCKS[hi === lo ? Math.floor(top / 2) : Math.round(clamp((v - lo) / (hi - lo), 0, 1) * top)])
    .join('')
}

/**
 * At most `limit` indices of `0..count-1`, evenly spread, always the first and
 * the last, plus every index in `keep`; sorted.
 */
export function thin(count: number, limit: number, keep: Iterable<number> = []): number[] {
  if (count <= 0) return []
  const picked = new Set<number>()
  if (count <= limit) {
    for (let i = 0; i < count; i++) picked.add(i)
  } else {
    const slots = Math.max(2, Math.floor(limit))
    for (let k = 0; k < slots; k++) picked.add(Math.round((k * (count - 1)) / (slots - 1)))
  }
  for (const i of keep) if (i >= 0 && i < count) picked.add(i)
  return [...picked].sort((a, b) => a - b)
}
