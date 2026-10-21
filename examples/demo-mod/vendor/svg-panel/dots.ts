// Copied from svg-panel's src/dots.ts by scripts/build.mjs: edit src/, then rebuild.

// The dot canvas the terminal branch draws on: two dots across and four down
// per terminal cell. Every shape paints by its signed distance, so its edges
// come out soft, as they do in an Svg.

import { clamp } from './core.ts'
import type { Point } from './geom.ts'

/** A colour as red, green and blue, 0 to 255. */
export type Rgb = readonly [number, number, number]

export type Dots = {
  width: number
  height: number
  /** Premultiplied red, green, blue and coverage, four a dot, row-major. */
  data: Float32Array
  /**
   * The colour of the topmost shape that covers each dot at least a third, as
   * `0xRRGGBB`, or -1: a thin line's own colour, where its dots are a blend.
   */
  ink: Int32Array
}

export type Cap = 'butt' | 'round' | 'square'

export function dots(width: number, height: number): Dots {
  return { width, height, data: new Float32Array(width * height * 4), ink: new Int32Array(width * height).fill(-1) }
}

/** `#rgb` or `#rrggbb` as an `Rgb`; anything else is no colour. */
export function hexRgb(color: string): Rgb | undefined {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim())
  if (!m) return undefined
  const hex = m[1]!.length === 3 ? [...m[1]!].map(c => c + c).join('') : m[1]!
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The coverage from which a shape's colour is a dot's ink. */
const INKED = 1 / 3

/** Coverage from a signed distance in dots: 1 inside, 0 outside, a ramp one dot wide across the edge. */
function cover(sd: number): number {
  return clamp(0.5 - sd, 0, 1)
}

/** Paints `color` over every dot of the box at the coverage `sd` gives, times `alpha`. */
function paint(d: Dots, box: Box, color: Rgb, alpha: number, sd: (x: number, y: number) => number): void {
  if (alpha <= 0) return
  const { data, ink, width } = d
  const packed = (Math.round(color[0]) << 16) | (Math.round(color[1]) << 8) | Math.round(color[2])
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const a = cover(sd(x + 0.5, y + 0.5)) * alpha
      if (a <= 0) continue
      const i = (y * width + x) * 4
      data[i] = color[0] * a + data[i]! * (1 - a)
      data[i + 1] = color[1] * a + data[i + 1]! * (1 - a)
      data[i + 2] = color[2] * a + data[i + 2]! * (1 - a)
      data[i + 3] = a + data[i + 3]! * (1 - a)
      if (a >= INKED) ink[i / 4] = packed
    }
  }
}

type Box = { x0: number; y0: number; x1: number; y1: number }

/** The dots a shape spanning `[x0, x1] × [y0, y1]` can touch, inside the canvas. */
function box(d: Dots, x0: number, y0: number, x1: number, y1: number): Box {
  return {
    x0: clamp(Math.floor(x0 - 1), 0, d.width),
    y0: clamp(Math.floor(y0 - 1), 0, d.height),
    x1: clamp(Math.ceil(x1 + 1), 0, d.width),
    y1: clamp(Math.ceil(y1 + 1), 0, d.height),
  }
}

export function fillCircle(d: Dots, cx: number, cy: number, r: number, color: Rgb, alpha = 1): void {
  paint(d, box(d, cx - r, cy - r, cx + r, cy + r), color, alpha, (x, y) => Math.hypot(x - cx, y - cy) - r)
}

export function strokeCircle(d: Dots, cx: number, cy: number, r: number, half: number, color: Rgb, alpha = 1): void {
  const o = r + half
  paint(d, box(d, cx - o, cy - o, cx + o, cy + o), color, alpha, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - half)
}

/** The signed distance to a box from `(x, y)` to `(x + w, y + h)` with corners of radius `r`. */
function roundRectSd(x: number, y: number, w: number, h: number, r: number): (px: number, py: number) => number {
  const hw = w / 2
  const hh = h / 2
  const cx = x + hw
  const cy = y + hh
  const k = clamp(r, 0, Math.min(hw, hh))
  return (px, py) => {
    const qx = Math.abs(px - cx) - hw + k
    const qy = Math.abs(py - cy) - hh + k
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - k
  }
}

export function fillRoundRect(d: Dots, x: number, y: number, w: number, h: number, r: number, color: Rgb, alpha = 1): void {
  if (!(w > 0 && h > 0)) return
  paint(d, box(d, x, y, x + w, y + h), color, alpha, roundRectSd(x, y, w, h, r))
}

export function strokeRoundRect(
  d: Dots, x: number, y: number, w: number, h: number, r: number, half: number, color: Rgb, alpha = 1,
): void {
  if (!(w > 0 && h > 0)) return
  const sd = roundRectSd(x, y, w, h, r)
  paint(d, box(d, x - half, y - half, x + w + half, y + h + half), color, alpha, (px, py) => Math.abs(sd(px, py)) - half)
}

/** Fills the rings by the nonzero rule, as an Svg fills a path. */
export function fillPolygon(d: Dots, rings: readonly (readonly Point[])[], color: Rgb, alpha = 1): void {
  const edges: [Point, Point][] = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) edges.push([ring[i]!, ring[(i + 1) % ring.length]!])
  }
  if (edges.length < 3) return
  const all = rings.flat()
  const xs = all.map(p => p.x)
  const ys = all.map(p => p.y)
  paint(d, box(d, Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)), color, alpha, (px, py) => {
    let winding = 0
    let near = Infinity
    for (const [a, b] of edges) {
      if (a.y <= py) {
        if (b.y > py && cross(a, b, px, py) > 0) winding++
      } else if (b.y <= py && cross(a, b, px, py) < 0) {
        winding--
      }
      near = Math.min(near, segmentDistance(a, b, px, py).d)
    }
    return winding === 0 ? near : -near
  })
}

function cross(a: Point, b: Point, px: number, py: number): number {
  return (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)
}

/** How far `(px, py)` is from the segment, and where along it (0 at `a`, 1 at `b`) it is nearest. */
function segmentDistance(a: Point, b: Point, px: number, py: number): { d: number; t: number; along: number; len: number } {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const along = len === 0 ? 0 : ((px - a.x) * dx + (py - a.y) * dy) / len
  const t = len === 0 ? 0 : along / len
  const c = clamp(t, 0, 1)
  return { d: Math.hypot(px - (a.x + c * dx), py - (a.y + c * dy)), t, along, len }
}

/**
 * Strokes a polyline `half` dots either side of it, with round joins and the
 * given caps at its two open ends. The whole line is one coverage, so where
 * its segments overlap it does not paint twice.
 */
export function strokePolyline(
  d: Dots, points: readonly Point[], closed: boolean, half: number, cap: Cap, color: Rgb, alpha = 1,
): void {
  if (points.length === 0 || !(half > 0)) return
  const pts = closed ? [...points, points[0]!] : points
  const xs = pts.map(p => p.x)
  const ys = pts.map(p => p.y)
  const reach = half * 1.5
  const b = box(d, Math.min(...xs) - reach, Math.min(...ys) - reach, Math.max(...xs) + reach, Math.max(...ys) + reach)
  const w = b.x1 - b.x0
  const h = b.y1 - b.y0
  if (w <= 0 || h <= 0) return
  // The nearest signed distance per dot, segment by segment over each one's own box.
  const sd = new Float32Array(w * h).fill(Infinity)
  const last = pts.length - 2
  const one = pts.length === 1
  for (let s = 0; s <= Math.max(0, last); s++) {
    const p = pts[s]!
    const q = one ? p : pts[s + 1]!
    const sb = box(d, Math.min(p.x, q.x) - reach, Math.min(p.y, q.y) - reach, Math.max(p.x, q.x) + reach, Math.max(p.y, q.y) + reach)
    const atStart = !closed && s === 0
    const atEnd = !closed && s === last
    for (let y = Math.max(sb.y0, b.y0); y < Math.min(sb.y1, b.y1); y++) {
      for (let x = Math.max(sb.x0, b.x0); x < Math.min(sb.x1, b.x1); x++) {
        const v = capped(p, q, x + 0.5, y + 0.5, half, cap, atStart || one, atEnd || one)
        const i = (y - b.y0) * w + (x - b.x0)
        if (v < sd[i]!) sd[i] = v
      }
    }
  }
  paint(d, b, color, alpha, (x, y) => sd[(Math.floor(y) - b.y0) * w + (Math.floor(x) - b.x0)]!)
}

/** The signed distance to one segment of a stroke: a capsule, squared off at an open end with a butt or square cap. */
function capped(a: Point, b: Point, px: number, py: number, half: number, cap: Cap, atStart: boolean, atEnd: boolean): number {
  const s = segmentDistance(a, b, px, py)
  if (cap === 'round' || s.len === 0) return s.d - half
  const before = atStart && s.t < 0
  const after = atEnd && s.t > 1
  if (!before && !after) return s.d - half
  // Past an open end: a box that stops at the end (butt) or half a width past it (square).
  const nx = -(b.y - a.y) / s.len
  const ny = (b.x - a.x) / s.len
  const across = Math.abs((px - a.x) * nx + (py - a.y) * ny)
  const past = before ? -s.along : s.along - s.len
  return Math.max(across - half, past - (cap === 'square' ? half : 0))
}

/** Cuts a polyline into the dashes of `pattern` (dash, gap, dash, gap... in dots). */
export function dash(points: readonly Point[], closed: boolean, pattern: readonly number[]): Point[][] {
  const pts = closed && points.length > 0 ? [...points, points[0]!] : [...points]
  const steps = pattern.length % 2 === 1 ? [...pattern, ...pattern] : [...pattern]
  if (steps.length === 0 || !steps.every(n => n > 0)) return [pts]
  const out: Point[][] = []
  let k = 0
  let left = steps[0]!
  let on = true
  let current: Point[] = [pts[0]!]
  for (let i = 0; i + 1 < pts.length; i++) {
    let a = pts[i]!
    const b = pts[i + 1]!
    let len = Math.hypot(b.x - a.x, b.y - a.y)
    while (len > left) {
      const t = left / len
      const cut = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
      if (on) out.push([...current, cut])
      current = [cut]
      len -= left
      a = cut
      on = !on
      k = (k + 1) % steps.length
      left = steps[k]!
    }
    left -= len
    if (on) current.push(b)
  }
  if (on && current.length > 1) out.push(current)
  return out
}
