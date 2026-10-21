// Copied from svg-panel's src/readSvg.ts by scripts/build.mjs: edit src/, then rebuild.

// Reads the markup the components write and paints the same shapes on a dot
// canvas: rects, circles, ellipses, lines and paths (with arcs and curves),
// stroked or filled, in groups and nested `<svg>`s; a gradient fill paints in
// its mean colour. `<text>` is not painted but kept as a label, to be set in
// letters over the cells. What CSS hides (a hover's tooltip) and what `<defs>`
// holds stay unpainted; what this subset does not know is skipped.

import type { Point } from './geom.ts'
import {
  dash,
  dots,
  fillCircle,
  fillPolygon,
  fillRoundRect,
  hexRgb,
  strokeCircle,
  strokePolyline,
  strokeRoundRect,
  type Cap,
  type Dots,
  type Rgb,
} from './dots.ts'

/** A `<text>`, in dots: where its anchor and baseline sit, and how it is set. */
export type Label = { x: number; y: number; size: number; words: string; color: Rgb; anchor: 'start' | 'middle' | 'end' }

export type Painted = { dots: Dots; labels: Label[]; columns: number; rows: number }

/** How a frame maps its own units to dots: `X = sx * x + tx`. */
type Transform = { sx: number; sy: number; tx: number; ty: number }

type Frame = { tag: string; at: Transform; style: Record<string, string>; hidden: boolean }

/** The presentation attributes a child takes from its parent. */
const INHERITED = [
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-dasharray', 'paint-order',
  'color', 'font-size', 'text-anchor', 'fill-opacity', 'stroke-opacity', 'visibility',
]

const TOKEN = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)/g
const ATTR = /([\w:-]+)="([^"]*)"/g
const ENTITY = /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi
const NAMED: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function unescape(text: string): string {
  return text.replace(ENTITY, (whole, name: string) => {
    const lower = name.toLowerCase()
    if (lower in NAMED) return NAMED[lower]!
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10)
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

function attrsOf(source: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const m of source.matchAll(ATTR)) out[m[1]!] = unescape(m[2]!)
  return out
}

function number(value: string | undefined, fallback = 0): number {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : fallback
}

/** The classes a `<style>` hides outright: `.a,.b{visibility:hidden}`. Rules behind a combinator or `:hover` are not read. */
export function hiddenClasses(css: string): Set<string> {
  const out = new Set<string>()
  for (const rule of css.split('}')) {
    const [selectors, body] = rule.split('{')
    if (body === undefined || !/visibility\s*:\s*hidden|display\s*:\s*none/.test(body)) continue
    for (const s of selectors!.split(',')) {
      const m = /^\s*\.([\w-]+)\s*$/.exec(s)
      if (m) out.add(m[1]!)
    }
  }
  return out
}

function compose(p: Transform, c: Transform): Transform {
  return { sx: p.sx * c.sx, sy: p.sy * c.sy, tx: p.sx * c.tx + p.tx, ty: p.sy * c.ty + p.ty }
}

/** `translate(x y)` and `scale(k)` from a `transform`; other functions are left out. */
function transformOf(value: string | undefined): Transform {
  let t: Transform = { sx: 1, sy: 1, tx: 0, ty: 0 }
  for (const m of (value ?? '').matchAll(/(translate|scale)\(([^)]*)\)/g)) {
    const [a = 0, b] = m[2]!.split(/[\s,]+/).filter(Boolean).map(Number)
    t = compose(t, m[1] === 'translate' ? { sx: 1, sy: 1, tx: a, ty: b ?? 0 } : { sx: a, sy: b ?? a, tx: 0, ty: 0 })
  }
  return t
}

function colorOf(value: string | undefined, current: string | undefined, paints?: ReadonlyMap<string, Rgb>): Rgb | undefined {
  if (value === undefined) return undefined
  const v = value.trim()
  const url = /^url\(\s*#([^)\s]+)\s*\)/.exec(v)
  if (url) return paints?.get(url[1]!)
  if (v === 'currentColor') return current === undefined ? undefined : hexRgb(current)
  if (v === 'black') return [0, 0, 0]
  if (v === 'white') return [255, 255, 255]
  return hexRgb(v)
}

/**
 * The colour a gradient averages to over its length, by id: a terminal cell
 * holds two colours, so a fill that runs from green to red is drawn in the
 * colour between them. Stops come from `<stop>`s, or from the gradient its
 * `href` names; `stop-color` may be an attribute or in `style`.
 */
export function gradientColors(svg: string): Map<string, Rgb> {
  const found = new Map<string, { stops: { at: number; color: Rgb }[]; href?: string }>()
  for (const m of svg.matchAll(/<(linear|radial)Gradient\b([^>]*?)(\/?)>(?:([\s\S]*?)<\/\1Gradient>)?/g)) {
    const attrs = attrsOf(m[2] ?? '')
    if (attrs.id === undefined) continue
    const stops: { at: number; color: Rgb }[] = []
    let last = 0
    for (const st of (m[3] ? '' : (m[4] ?? '')).matchAll(/<stop\b([^>]*)>/g)) {
      const a = attrsOf(st[1] ?? '')
      const inline = /stop-color\s*:\s*([^;"]+)/.exec(a.style ?? '')?.[1]
      const color = colorOf(a['stop-color'] ?? inline ?? '#000000', undefined)
      if (!color) continue
      const raw = (a.offset ?? '0').trim()
      const at = Math.min(1, Math.max(last, raw.endsWith('%') ? number(raw) / 100 : number(raw)))
      last = at
      stops.push({ at, color })
    }
    found.set(attrs.id, { stops, href: (attrs.href ?? attrs['xlink:href'])?.replace(/^#/, '') })
  }
  const out = new Map<string, Rgb>()
  for (const [id, g] of found) {
    const stops = g.stops.length > 0 ? g.stops : (g.href !== undefined ? found.get(g.href)?.stops ?? [] : [])
    if (stops.length === 0) continue
    // The mean of the colour along 0..1: flat before the first stop and after the last, linear between.
    const sum = [0, 0, 0]
    const add = (c: Rgb, w: number) => { for (let k = 0; k < 3; k++) sum[k] = sum[k]! + c[k]! * w }
    add(stops[0]!.color, stops[0]!.at)
    for (let j = 0; j + 1 < stops.length; j++) {
      const a = stops[j]!
      const b = stops[j + 1]!
      const w = b.at - a.at
      add(a.color, w / 2)
      add(b.color, w / 2)
    }
    const tail = stops[stops.length - 1]!
    add(tail.color, 1 - tail.at)
    out.set(id, [sum[0]!, sum[1]!, sum[2]!])
  }
  return out
}

/** A cubic Bézier from `p0` as points after it, about `step` apart along its control polygon. */
function cubicPoints(p0: Point, c1: Point, c2: Point, p1: Point, step: number): Point[] {
  const length = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p1.x - c2.x, p1.y - c2.y)
  const n = Math.min(256, Math.max(1, Math.ceil(length / Math.max(step, 1e-3))))
  const out: Point[] = []
  for (let j = 1; j <= n; j++) {
    const t = j / n
    const u = 1 - t
    out.push({
      x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p1.x,
      y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p1.y,
    })
  }
  return out
}

/** A quadratic Bézier, as the cubic it equals. */
function quadPoints(p0: Point, c: Point, p1: Point, step: number): Point[] {
  const c1 = { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) }
  const c2 = { x: p1.x + (2 / 3) * (c.x - p1.x), y: p1.y + (2 / 3) * (c.y - p1.y) }
  return cubicPoints(p0, c1, c2, p1, step)
}

/** A path's `d` as subpaths of points, arcs and curves flattened every `step` units. M L H V C S Q T A Z, absolute or relative. */
export function pathPoints(d: string, step: number): { points: Point[]; closed: boolean }[] {
  // Every command letter is a token, so one this subset does not draw stops the path instead of passing for a line.
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const out: { points: Point[]; closed: boolean }[] = []
  let current: Point[] = []
  let x = 0
  let y = 0
  let start = { x: 0, y: 0 }
  let command = ''
  // The last curve's second control point, for the reflection S and T start from.
  let cubic: Point | undefined
  let quad: Point | undefined
  let i = 0
  const read = () => Number(tokens[i++])
  const finish = (closed: boolean) => {
    if (current.length > 0) out.push({ points: current, closed })
    current = []
  }
  const isCommand = (token: string | undefined) => token !== undefined && /[A-Za-z]/.test(token)
  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i++]!
      if (command === 'Z' || command === 'z') {
        finish(true)
        x = start.x
        y = start.y
        cubic = undefined
        quad = undefined
        continue
      }
    }
    const needs = ARGS[command.toUpperCase()]
    if (needs === undefined) {
      // A command this subset does not draw, or numbers before any: stop here.
      finish(false)
      return out
    }
    for (let j = i; j < i + needs; j++) {
      if (j >= tokens.length || isCommand(tokens[j])) {
        finish(false)
        return out
      }
    }
    const rel = command === command.toLowerCase()
    const kind = command.toUpperCase()
    // A line after a close starts from where the close went back to.
    if (kind !== 'M' && current.length === 0) current = [{ x, y }]
    const pt = () => {
      const px = read() + (rel ? x : 0)
      return { x: px, y: read() + (rel ? y : 0) }
    }
    const here = { x, y }
    const mirror = (c: Point | undefined) => (c === undefined ? here : { x: 2 * x - c.x, y: 2 * y - c.y })
    if (kind !== 'C' && kind !== 'S') cubic = undefined
    if (kind !== 'Q' && kind !== 'T') quad = undefined
    switch (kind) {
      case 'M': {
        finish(false)
        x = read() + (rel ? x : 0)
        y = read() + (rel ? y : 0)
        start = { x, y }
        current = [{ x, y }]
        // Pairs after the first are lines.
        command = rel ? 'l' : 'L'
        break
      }
      case 'L':
        x = read() + (rel ? x : 0)
        y = read() + (rel ? y : 0)
        current.push({ x, y })
        break
      case 'H':
        x = read() + (rel ? x : 0)
        current.push({ x, y })
        break
      case 'V':
        y = read() + (rel ? y : 0)
        current.push({ x, y })
        break
      case 'C':
      case 'S': {
        const c1 = kind === 'C' ? pt() : mirror(cubic)
        const c2 = pt()
        const end = pt()
        current.push(...cubicPoints(here, c1, c2, end, step))
        cubic = c2
        x = end.x
        y = end.y
        break
      }
      case 'Q':
      case 'T': {
        const c = kind === 'Q' ? pt() : mirror(quad)
        const end = pt()
        current.push(...quadPoints(here, c, end, step))
        quad = c
        x = end.x
        y = end.y
        break
      }
      case 'A': {
        const rx = read()
        const ry = read()
        const phi = read()
        const large = read() !== 0
        const sweep = read() !== 0
        const ex = read() + (rel ? x : 0)
        const ey = read() + (rel ? y : 0)
        current.push(...arcPoints(x, y, rx, ry, phi, large, sweep, ex, ey, step))
        x = ex
        y = ey
        break
      }
    }
  }
  finish(false)
  return out
}

/** How many numbers each drawn command takes. */
const ARGS: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }

/** An endpoint arc as points after its start, the SVG way (its implementation notes, F.6.5). */
export function arcPoints(
  x1: number, y1: number, rx0: number, ry0: number, phiDeg: number, large: boolean, sweep: boolean, x2: number, y2: number, step: number,
): Point[] {
  let rx = Math.abs(rx0)
  let ry = Math.abs(ry0)
  if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) return [{ x: x2, y: y2 }]
  const phi = (phiDeg * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const xp = cos * dx + sin * dy
  const yp = -sin * dx + cos * dy
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
  if (lambda > 1) {
    rx *= Math.sqrt(lambda)
    ry *= Math.sqrt(lambda)
  }
  const num = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp
  const den = rx * rx * yp * yp + ry * ry * xp * xp
  const k = (large === sweep ? -1 : 1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (k * rx * yp) / ry
  const cyp = (-k * ry * xp) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const theta = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
  let delta = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const n = Math.max(1, Math.ceil((Math.abs(delta) * Math.max(rx, ry)) / Math.max(step, 1e-3)))
  const out: Point[] = []
  for (let j = 1; j <= n; j++) {
    const t = theta + (delta * j) / n
    out.push({
      x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
      y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
    })
  }
  out[out.length - 1] = { x: x2, y: y2 }
  return out
}

/** Elements whose children are definitions, not drawing: what they hold is never painted where it stands. */
const NOT_DRAWN = new Set(['defs', 'clippath', 'mask', 'pattern', 'marker', 'symbol', 'lineargradient', 'radialgradient', 'filter'])

/** The thinnest a stroke is drawn, in dots: one dot across, so a hairline still shows. */
export const MIN_STROKE = 1

/**
 * Paints an `<svg>` at `scale` dots per CSS pixel on a canvas whole cells in
 * size (2 × 4 dots each), and returns its labels.
 */
export function readSvg(svg: string, scale: number): Painted {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const rootAttrs = attrsOf(root)
  const width = number(rootAttrs.width, 1)
  const height = number(rootAttrs.height, 1)
  const columns = Math.max(1, Math.ceil((width * scale) / 2 - 1e-6))
  const rows = Math.max(1, Math.ceil((height * scale) / 4 - 1e-6))
  const canvas = dots(columns * 2, rows * 4)
  const labels: Label[] = []
  const hidden = new Set<string>()
  const stack: Frame[] = []
  let text: { frame: Frame; attrs: Record<string, string>; words: string } | undefined
  let styleText: string | undefined
  // Read first, so a fill may name a gradient defined further down.
  const paints = gradientColors(svg)

  for (const m of svg.matchAll(TOKEN)) {
    const [, closing, tagName, attrSource = '', selfClosing, between] = m
    if (between !== undefined) {
      if (text) text.words += unescape(between)
      if (styleText !== undefined) styleText += between
      continue
    }
    if (tagName === undefined) continue
    const tag = tagName.toLowerCase()
    if (closing) {
      if (tag === 'text' && text) {
        label(text.frame, text.attrs, text.words)
        text = undefined
      }
      if (tag === 'style' && styleText !== undefined) {
        for (const c of hiddenClasses(styleText)) hidden.add(c)
        styleText = undefined
      }
      stack.pop()
      continue
    }

    const attrs = attrsOf(attrSource)
    const parent = stack[stack.length - 1]
    const style: Record<string, string> = {}
    for (const key of INHERITED) {
      const v = attrs[key] ?? parent?.style[key]
      if (v !== undefined) style[key] = v
    }
    const classes = (attrs.class ?? '').split(/\s+/).filter(Boolean)
    const isHidden = (parent?.hidden ?? false) || style.visibility === 'hidden' || attrs.display === 'none' ||
      classes.some(c => hidden.has(c)) || NOT_DRAWN.has(tag)
    let at = parent?.at ?? { sx: scale, sy: scale, tx: 0, ty: 0 }
    if (tag === 'svg' && parent) {
      const vb = (attrs.viewBox ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
      const w = number(attrs.width, vb[2] ?? 0)
      const h = number(attrs.height, vb[3] ?? 0)
      const kx = vb.length === 4 && vb[2]! > 0 ? w / vb[2]! : 1
      const ky = vb.length === 4 && vb[3]! > 0 ? h / vb[3]! : 1
      at = compose(at, { sx: kx, sy: ky, tx: number(attrs.x) - kx * (vb[0] ?? 0), ty: number(attrs.y) - ky * (vb[1] ?? 0) })
    }
    if (attrs.transform !== undefined) at = compose(at, transformOf(attrs.transform))
    const frame: Frame = { tag, at, style, hidden: isHidden }

    if (tag === 'style') styleText = ''
    else if (tag === 'text') text = { frame, attrs, words: '' }
    else if (!isHidden) shape(frame, attrs)

    if (!selfClosing) stack.push(frame)
    else if (tag === 'text') text = undefined
  }
  return { dots: canvas, labels, columns, rows }

  function label(frame: Frame, attrs: Record<string, string>, words: string): void {
    if (frame.hidden) return
    const color = colorOf(frame.style.fill ?? '#000000', frame.style.color, paints)
    if (!color || words.trim() === '') return
    const anchor = frame.style['text-anchor']
    const k = (frame.at.sx + frame.at.sy) / 2
    labels.push({
      x: frame.at.sx * number(attrs.x) + frame.at.tx,
      y: frame.at.sy * number(attrs.y) + frame.at.ty,
      size: number(frame.style['font-size'], 16) * k,
      words: words.replace(/\s+/g, ' ').trim(),
      color,
      anchor: anchor === 'middle' || anchor === 'end' ? anchor : 'start',
    })
  }

  function shape(frame: Frame, attrs: Record<string, string>): void {
    const { at, style } = frame
    const k = (at.sx + at.sy) / 2
    const X = (v: number) => at.sx * v + at.tx
    const Y = (v: number) => at.sy * v + at.ty
    const fill = colorOf(style.fill ?? (frame.tag === 'line' || frame.tag === 'polyline' ? 'none' : '#000000'), style.color, paints)
    const stroke = colorOf(style.stroke, style.color, paints)
    const fillAlpha = number(style['fill-opacity'], 1) * number(attrs.opacity, 1)
    const strokeAlpha = number(style['stroke-opacity'], 1) * number(attrs.opacity, 1)
    const half = Math.max(MIN_STROKE, number(style['stroke-width'], 1) * k) / 2
    const cap: Cap = style['stroke-linecap'] === 'round' || style['stroke-linecap'] === 'square' ? style['stroke-linecap'] : 'butt'
    const pattern = (style['stroke-dasharray'] ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
    const dashes = pattern.length > 0 && pattern.every(n => n > 0) ? pattern.map(n => Math.max(1, n * k)) : undefined
    const strokeFirst = (style['paint-order'] ?? '').trim().startsWith('stroke')

    const line = (points: Point[], closed: boolean) => {
      if (!stroke) return
      const crisp = snapLine(points, half)
      for (const piece of dashes ? dash(crisp, closed, dashes) : [crisp]) {
        strokePolyline(canvas, piece, closed && !dashes, half, cap, stroke, strokeAlpha)
      }
    }
    const paintBoth = (doFill: () => void, doStroke: () => void) => {
      if (strokeFirst) {
        if (stroke) doStroke()
        if (fill) doFill()
      } else {
        if (fill) doFill()
        if (stroke) doStroke()
      }
    }

    switch (frame.tag) {
      case 'rect': {
        // Edges on whole dots, so a bar's track and fill are solid rows, not two half-tones.
        const x = Math.round(X(number(attrs.x)))
        const y = Math.round(Y(number(attrs.y)))
        // A sliver keeps one dot: a fill just above zero still shows.
        const w = Math.max(number(attrs.width) > 0 ? 1 : 0, Math.round(X(number(attrs.x) + number(attrs.width))) - x)
        const h = Math.max(number(attrs.height) > 0 ? 1 : 0, Math.round(Y(number(attrs.y) + number(attrs.height))) - y)
        const r = number(attrs.rx ?? attrs.ry) * k
        paintBoth(
          () => fillRoundRect(canvas, x, y, w, h, r, fill!, fillAlpha),
          () => (dashes ? line(rectRing(x, y, w, h), true) : strokeRoundRect(canvas, x, y, w, h, r, half, stroke!, strokeAlpha)),
        )
        return
      }
      case 'circle': {
        const cx = X(number(attrs.cx))
        const cy = Y(number(attrs.cy))
        const r = number(attrs.r) * k
        if (!(r > 0)) return
        paintBoth(
          () => fillCircle(canvas, cx, cy, r, fill!, fillAlpha),
          () => strokeCircle(canvas, cx, cy, r, half, stroke!, strokeAlpha),
        )
        return
      }
      case 'ellipse': {
        const cx = number(attrs.cx)
        const cy = number(attrs.cy)
        const rx = number(attrs.rx ?? attrs.ry)
        const ry = number(attrs.ry ?? attrs.rx)
        if (!(rx > 0 && ry > 0)) return
        // As a ring of points half a dot apart, filled and stroked like a polygon.
        const n = Math.min(512, Math.max(12, Math.ceil((2 * Math.PI * Math.max(rx * at.sx, ry * at.sy)) / 0.5)))
        const ring: Point[] = []
        for (let j = 0; j < n; j++) {
          const t = (2 * Math.PI * j) / n
          ring.push({ x: X(cx + rx * Math.cos(t)), y: Y(cy + ry * Math.sin(t)) })
        }
        paintBoth(() => fillPolygon(canvas, [ring], fill!, fillAlpha), () => line(ring, true))
        return
      }
      case 'line': {
        line([{ x: X(number(attrs.x1)), y: Y(number(attrs.y1)) }, { x: X(number(attrs.x2)), y: Y(number(attrs.y2)) }], false)
        return
      }
      case 'polyline':
      case 'polygon': {
        const n = (attrs.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
        const points: Point[] = []
        for (let j = 0; j + 1 < n.length; j += 2) points.push({ x: X(n[j]!), y: Y(n[j + 1]!) })
        const closed = frame.tag === 'polygon'
        paintBoth(() => fillPolygon(canvas, [points], fill!, fillAlpha), () => line(points, closed))
        return
      }
      case 'path': {
        // Arcs flattened every half dot.
        const subpaths = pathPoints(attrs.d ?? '', 0.5 / Math.max(k, 1e-6)).map(s => ({
          closed: s.closed,
          points: s.points.map(p => ({ x: X(p.x), y: Y(p.y) })),
        }))
        paintBoth(
          () => fillPolygon(canvas, subpaths.map(s => s.points), fill!, fillAlpha),
          () => subpaths.forEach(s => line(s.points, s.closed)),
        )
        return
      }
    }
  }
}

/**
 * A line of only level and upright runs (a rule, a grid line, a tick) moved
 * across itself until its edges fall on whole dots, so it draws as one solid
 * row or column. Any slanted run leaves the line as it is.
 */
export function snapLine(points: readonly Point[], half: number): Point[] {
  const level = (a: Point, b: Point) => Math.abs(a.y - b.y) < 1e-6
  const upright = (a: Point, b: Point) => Math.abs(a.x - b.x) < 1e-6
  for (let i = 0; i + 1 < points.length; i++) {
    if (!level(points[i]!, points[i + 1]!) && !upright(points[i]!, points[i + 1]!)) return [...points]
  }
  const snap = (v: number) => Math.round(v - half) + half
  return points.map((p, i) => {
    const runs = [points[i - 1], points[i + 1]].filter((q): q is Point => q !== undefined)
    return {
      x: runs.some(q => upright(p, q) && !level(p, q)) ? snap(p.x) : p.x,
      y: runs.some(q => level(p, q) && !upright(p, q)) ? snap(p.y) : p.y,
    }
  })
}

function rectRing(x: number, y: number, w: number, h: number): Point[] {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}
