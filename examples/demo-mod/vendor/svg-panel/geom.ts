// Copied from svg-panel's src/geom.ts by scripts/build.mjs: edit src/, then rebuild.

// Scales and arcs. Angles are degrees clockwise from twelve o'clock, so a
// 240° gauge runs from -120 to 120.

import { clamp, finite, num } from './core.ts'

export type Point = { x: number; y: number }

export type Scale = (value: number) => number

/** Maps `[d0, d1]` onto `[r0, r1]`, clamped to the range. */
export function scale(d0: number, d1: number, r0: number, r1: number): Scale {
  const span = d1 - d0
  return value => {
    const t = span === 0 ? 0 : (finite(value, d0) - d0) / span
    return r0 + clamp(t, 0, 1) * (r1 - r0)
  }
}

/** The point at `deg` on the circle of radius `r` around `(cx, cy)`. */
export function polar(cx: number, cy: number, r: number, deg: number): Point {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

/** A path for the arc from `a0` to `a1` (clockwise when `a1 > a0`). */
export function arcPath(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const start = polar(cx, cy, r, a0)
  const end = polar(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 >= a0 ? 1 : 0
  return `M${num(start.x)} ${num(start.y)}A${num(r)} ${num(r)} 0 ${large} ${sweep} ${num(end.x)} ${num(end.y)}`
}

/** A polyline path through the points, as `M x y L x y ...`. */
export function linePath(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join('')
}

/** Rounds `max` up to a tidy axis end: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(max: number): number {
  if (!(max > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].find(m => m * power >= max) ?? 10
  return step * power
}
