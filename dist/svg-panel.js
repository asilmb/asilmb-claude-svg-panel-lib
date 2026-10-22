// svg-panel, built from src/ by scripts/build.mjs. Do not edit.

// ---- src/core.ts
// The pieces every picture is built from: the Picture shape, escaping, number
// formatting, the size budget and the <svg> wrapper.

/** What every component returns: the markup, its words, its terminal twin. */

/** The most characters an `Svg` element's `source` may hold. */
export const SVG_BUDGET = 131072

/** The system sans stack: external fonts do not load inside the app's frame. */
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const ESCAPES                         = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Escapes `& < > "` so a string can sit in markup text or a quoted attribute. */
export function esc(text         )         {
  return String(text).replace(/[&<>"]/g, ch => ESCAPES[ch] ?? ch)
}

/** Throws when a picture would be refused by `Svg` for its length. */
export function assertBudget(svg        )         {
  if (svg.length > SVG_BUDGET) {
    throw new RangeError(`svg-panel: ${svg.length} characters is over the ${SVG_BUDGET} an Svg source may hold`)
  }
  return svg
}

/** A coordinate for markup: at most two decimals, no trailing zeros. */
export function num(value        )         {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** `value` as a finite number, `fallback` otherwise. */
export function finite(value                    , fallback = 0)         {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** The lowest and highest of the values, by loop: a spread overflows the stack on long series. */
export function extent(values                   )                             {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return { lo, hi }
}

export function clamp(value        , lo        , hi        )         {
  return Math.min(hi, Math.max(lo, value))
}

/** 236000 → `236k`, 12345 → `12.3k`, 1200000 → `1.2M`, 42 → `42`. */
export function abbreviate(value        )         {
  const n = finite(value)
  const abs = Math.abs(n)
  const units                     = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']]
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = n / size
      const digits = Math.abs(scaled) >= 100 ? 0 : 1
      return `${trimZeros(scaled.toFixed(digits))}${suffix}`
    }
  }
  return abs < 10 && !Number.isInteger(n) ? trimZeros(n.toFixed(1)) : String(Math.round(n))
}

function trimZeros(text        )         {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/** A rough width for a label, so layout can leave it room. */
export function textWidth(text        , size        )         {
  return [...text].length * size * 0.58
}

/** Wraps a body in the `<svg>` document every picture is. */
export function svgDoc({ width, height, body, style, background, title }            )         {
  const w = num(width)
  const h = num(height)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
    `role="img" font-family="${FONT}">` +
    (title === undefined ? '' : `<title>${esc(title)}</title>`) +
    (style === undefined ? '' : `<style>${style}</style>`) +
    (background === undefined ? '' : `<rect width="${w}" height="${h}" rx="8" fill="${background}"/>`) +
    body +
    '</svg>'
  )
}

/** A `<text>` element, its words escaped. */
export function text(
  x        ,
  y        ,
  words        ,
  attrs                                                                                                     ,
)         {
  const { size = 11, fill, anchor = 'start', weight, cls } = attrs
  return (
    `<text x="${num(x)}" y="${num(y)}" font-size="${num(size)}" fill="${fill}"` +
    (anchor === 'start' ? '' : ` text-anchor="${anchor}"`) +
    (weight === undefined ? '' : ` font-weight="${weight}"`) +
    (cls === undefined ? '' : ` class="${cls}"`) +
    ` style="font-variant-numeric:tabular-nums">${esc(words)}</text>`
  )
}

// ---- src/geom.ts
// Scales and arcs. Angles are degrees clockwise from twelve o'clock, so a
// 240° gauge runs from -120 to 120.

/** Maps `[d0, d1]` onto `[r0, r1]`, clamped to the range. */
export function scale(d0        , d1        , r0        , r1        )        {
  const span = d1 - d0
  return value => {
    const t = span === 0 ? 0 : (finite(value, d0) - d0) / span
    return r0 + clamp(t, 0, 1) * (r1 - r0)
  }
}

/** The point at `deg` on the circle of radius `r` around `(cx, cy)`. */
export function polar(cx        , cy        , r        , deg        )        {
  const rad = (deg * Math.PI) / 180
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) }
}

/** A path for the arc from `a0` to `a1` (clockwise when `a1 > a0`). */
export function arcPath(cx        , cy        , r        , a0        , a1        )         {
  const start = polar(cx, cy, r, a0)
  const end = polar(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 >= a0 ? 1 : 0
  return `M${num(start.x)} ${num(start.y)}A${num(r)} ${num(r)} 0 ${large} ${sweep} ${num(end.x)} ${num(end.y)}`
}

/** A polyline path through the points, as `M x y L x y ...`. */
export function linePath(points                  )         {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'}${num(p.x)} ${num(p.y)}`).join('')
}

/** Rounds `max` up to a tidy axis end: 1, 2, 2.5 or 5 times a power of ten. */
export function niceMax(max        )         {
  if (!(max > 0)) return 1
  const power = 10 ** Math.floor(Math.log10(max))
  const step = [1, 2, 2.5, 5, 10].find(m => m * power >= max) ?? 10
  return step * power
}

// ---- src/twin.ts
// Twins: the plain-text forms a terminal prints where the app draws a picture.

export const BAR_FULL = '█'
export const BAR_EMPTY = '░'
export const BAR_TICK = '│'
export const BLOCKS = '▁▂▃▄▅▆▇█'

/**
 * A `█░` bar `width` cells wide filled to `value`, with `│` in the cell where
 * `tick` falls. `bar(236, 300, { tick: 270 })` is `████████████████░░│░`.
 */
export function bar(value        , max        , options             = {})         {
  const { width = 20, min = 0, tick } = options
  const cells = Math.max(1, Math.round(width))
  const at = (v        ) => (max === min ? 0 : clamp((finite(v, min) - min) / (max - min), 0, 1))
  const filled = Math.round(at(value) * cells)
  const chars           = Array.from({ length: cells }, (_, i) => (i < filled ? BAR_FULL : BAR_EMPTY))
  if (tick !== undefined && Number.isFinite(tick)) {
    chars[clamp(Math.round(at(tick) * cells), 0, cells - 1)] = BAR_TICK
  }
  return chars.join('')
}

/** One `▁`..`█` block per value, low to high; thinned to `width` when longer. */
export function blocks(values                   , options                = {})         {
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
export function thin(count        , limit        , keep                   = [])           {
  if (count <= 0) return []
  const picked = new Set        ()
  if (count <= limit) {
    for (let i = 0; i < count; i++) picked.add(i)
  } else {
    const slots = Math.max(2, Math.floor(limit))
    for (let k = 0; k < slots; k++) picked.add(Math.round((k * (count - 1)) / (slots - 1)))
  }
  for (const i of keep) if (i >= 0 && i < count) picked.add(i)
  return [...picked].sort((a, b) => a - b)
}

// ---- src/theme.ts
// Every colour a picture paints, in one place, for a dark and a light surface.

/** Fixed in both modes; each always ships beside a word or an icon. */
const STATUS                         = {
  good: '#0ca30c',
  warning: '#fab219',
  serious: '#ec835a',
  critical: '#d03b3b',
}

export const dark        = {
  name: 'dark',
  surface: '#1a1a19',
  ink: '#f0efec',
  ink2: '#c3c2b7',
  muted: '#898781',
  grid: '#2c2c2a',
  baseline: '#383835',
  status: STATUS,
  series: { blue: '#3987e5', orange: '#d95926', aqua: '#199e70', violet: '#9085e9' },
}

/** The same roles stepped for a light surface: the same ramps, not a flip. */
export const light        = {
  name: 'light',
  surface: '#fcfcfb',
  ink: '#0b0b0b',
  ink2: '#52514e',
  muted: '#898781',
  grid: '#e1e0d9',
  baseline: '#c3c2b7',
  status: STATUS,
  series: { blue: '#2a78d6', orange: '#eb6834', aqua: '#1baf7a', violet: '#6250d6' },
}

export const themes = { dark, light }         

/** The word that goes beside each status colour. */
export const STATUS_WORD                         = {
  good: 'ok',
  warning: 'warning',
  serious: 'serious',
  critical: 'critical',
}

/** The Claude Code theme key a `Text` beside a status mark wears. */
export const STATUS_TEXT_COLOR                                                  = {
  good: 'success',
  warning: 'warning',
  serious: 'warning',
  critical: 'error',
}

/** A theme by name or as given; dark when absent. */
export function pickTheme(theme                                      )        {
  if (theme === undefined) return dark
  return typeof theme === 'string' ? themes[theme] : theme
}

// ---- src/bars.ts
// One column per item over a baseline, each labelled under it and its figure
// over it, with an optional dashed threshold the columns past it turn warning at.

export const BARS_PAD = { left: 8, right: 8, top: 20, bottom: 22 }

/** Where each column stands: its left edge, its width and its top, in a chart of this size and scale. */
export function barLayout(count        , width        , height        , top        )                                                                                    {
  const plot = width - BARS_PAD.left - BARS_PAD.right
  const slot = count === 0 ? plot : plot / count
  const bar = Math.max(1, slot * 0.64)
  return {
    slot,
    bar,
    x: i => BARS_PAD.left + i * slot + (slot - bar) / 2,
    y: scale(0, top, height - BARS_PAD.bottom, BARS_PAD.top),
  }
}

export function bars(items                    , options              = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const width = options.width ?? 240
  const height = options.height ?? 140
  const values = items.map(item => Math.max(0, finite(item.value)))
  const threshold = options.threshold !== undefined && Number.isFinite(options.threshold) ? options.threshold : undefined
  const top = options.max ?? niceMax(Math.max(1, extent(values).hi, threshold ?? 0))
  const { slot, bar, x, y } = barLayout(items.length, width, height, top)
  const base = height - BARS_PAD.bottom
  const parts           = []
  // Words go last, over the columns and the rules.
  const words           = []

  items.forEach((item, i) => {
    const v = values[i] 
    const status = item.status ?? (threshold !== undefined && v >= threshold ? 'warning' : undefined)
    const fill = status === undefined ? theme.series.blue : theme.status[status]
    const yTop = y(v)
    if (base - yTop > 0) {
      parts.push(`<rect class="bar" x="${num(x(i))}" y="${num(yTop)}" width="${num(bar)}" height="${num(base - yTop)}" rx="${num(Math.min(3, bar / 3))}" fill="${fill}"/>`)
    }
    const cx = x(i) + bar / 2
    const figure = fmt(v)
    // Labels only where they fit their slot; the alt and the twin carry every one.
    if (textWidth(figure, 10) <= slot + 2) words.push(text(cx, yTop - 5, figure, { size: 10, fill: theme.ink2, anchor: 'middle', cls: 'bar-figure' }))
    if (textWidth(item.label, 10) <= slot + 2) words.push(text(cx, base + 15, item.label, { size: 10, fill: theme.muted, anchor: 'middle', cls: 'bar-label' }))
  })
  parts.push(`<path class="bars-baseline" d="M${BARS_PAD.left} ${num(base)}H${num(width - BARS_PAD.right)}" stroke="${theme.baseline}" stroke-width="1"/>`)
  if (threshold !== undefined) {
    const ty = y(threshold)
    parts.push(`<path class="bars-threshold" d="M${BARS_PAD.left} ${num(ty)}H${num(width - BARS_PAD.right)}" stroke="${theme.status.warning}" stroke-width="1.5" stroke-dasharray="5 4"/>`)
  }

  const name = options.label ?? 'Bars'
  const listed = items.slice(0, 12).map((item, i) => `${item.label} ${fmt(values[i] )}`)
  const more = items.length > 12 ? `, and ${items.length - 12} more` : ''
  const high = values.indexOf(extent(values).hi)
  const alt = items.length === 0
    ? `${name}: no values yet`
    : `${name}: ${listed.join(', ')}${more}` + (threshold === undefined ? '' : `; threshold ${fmt(threshold)}`)
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join('') + words.join(''),
  })
  const lead = options.label === undefined ? '' : `${options.label} `
  return {
    svg: assertBudget(svg),
    alt,
    twin: items.length === 0 ? `${lead}no values` : `${lead}${blocks(values, { min: 0, max: top })} high ${items[high] .label} ${fmt(values[high] )}`,
    isInteractive: false,
  }
}

// ---- src/donut.ts
// A ring cut into shares, the total in its middle and a legend of shares
// beside it. Past `maxSlices` the smallest shares fold into one `other`.

/** The ring's centre, radius and width in the picture's own pixels. */
export const DONUT_RING = { cx: 72, cy: 72, r: 50, width: 18 }
/** The gap between two shares, in degrees, so each reads apart. */
export const DONUT_GAP = 2

/** The shares to draw: positive values only, the largest `max - 1` apart and the rest as `other` when there are more than `max`. */
export function donutShares(slices                  , max        , theme       )          {
  const colors = [theme.series.blue, theme.series.orange, theme.series.aqua, theme.ink2, theme.muted]
  const kept = slices
    .map((s, i) => ({ ...s, value: Math.max(0, finite(s.value)), i }))
    .filter(s => s.value > 0)
  const limit = Math.max(1, Math.floor(max))
  let shown = kept
  if (kept.length > limit) {
    const byValue = [...kept].sort((a, b) => b.value - a.value)
    const big = new Set(byValue.slice(0, limit - 1).map(s => s.i))
    const rest = kept.filter(s => !big.has(s.i)).reduce((sum, s) => sum + s.value, 0)
    shown = [...kept.filter(s => big.has(s.i)), { label: 'other', value: rest, i: -1, color: theme.muted }]
  }
  return shown.map((s, k) => ({ label: s.label, value: s.value, color: s.color ?? colors[k % colors.length] ?? theme.ink2 }))
}

export function donut(slices                  , options               = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const shares = donutShares(slices, options.maxSlices ?? 5, theme)
  const total = shares.reduce((sum, s) => sum + s.value, 0)
  const pct = (v        ) => (total === 0 ? 0 : Math.round((v / total) * 100))
  const { cx, cy, r, width: ring } = DONUT_RING
  const showLegend = options.legend ?? true
  const rows = shares.map(s => `${s.label} ${pct(s.value)}%`)
  const legendX = cx + r + ring / 2 + 16
  const width = showLegend && shares.length > 0
    ? Math.max(232, Math.ceil(legendX + 16 + Math.max(...rows.map(row => textWidth(row, 11))) + 8))
    : 2 * cx
  const height = Math.max(2 * cy, 20 + shares.length * 20)
  const parts           = []

  if (total === 0) {
    parts.push(`<circle class="donut-track" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${theme.grid}" stroke-width="${ring}"/>`)
  } else if (shares.length === 1) {
    parts.push(`<circle class="donut-slice" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${shares[0] .color}" stroke-width="${ring}"/>`)
  } else {
    let a = 0
    for (const s of shares) {
      const sweep = (s.value / total) * 360
      // Each share gives up the gap at its end, never more than half of itself.
      const gap = Math.min(DONUT_GAP, sweep / 2)
      parts.push(`<path class="donut-slice" d="${arcPath(cx, cy, r, a, a + sweep - gap)}" fill="none" stroke="${s.color}" stroke-width="${ring}"/>`)
      a += sweep
    }
  }
  parts.push(text(cx, cy + 6, options.center ?? fmt(total), { size: 18, fill: theme.ink, anchor: 'middle', weight: 600, cls: 'donut-center' }))
  if (showLegend) {
    const top = cy - ((shares.length - 1) * 20) / 2
    shares.forEach((s, i) => {
      const ry = top + i * 20
      parts.push(
        `<rect class="donut-swatch" x="${num(legendX)}" y="${num(ry - 5)}" width="10" height="10" rx="2" fill="${s.color}"/>`,
        text(legendX + 16, ry + 4, rows[i] , { size: 11, fill: theme.ink2, cls: 'donut-row' }),
      )
    })
  }

  const name = options.label ?? 'Shares'
  const listed = shares.map(s => `${s.label} ${pct(s.value)}% (${fmt(s.value)})`).join(', ')
  const alt = shares.length === 0 ? `${name}: nothing yet` : `${name}: total ${fmt(total)}; ${listed}`
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  const lead = options.label === undefined ? '' : `${options.label} `
  return {
    svg: assertBudget(svg),
    alt,
    twin: shares.length === 0 ? `${lead}nothing yet` : `${lead}${fmt(total)}: ${rows.join(' · ')}`,
    isInteractive: false,
  }
}

// ---- src/dots.ts
// The dot canvas the terminal branch draws on: two dots across and four down
// per terminal cell. Every shape paints by its signed distance, so its edges
// come out soft, as they do in an Svg.

/** A colour as red, green and blue, 0 to 255. */

export function dots(width        , height        )       {
  return { width, height, data: new Float32Array(width * height * 4), ink: new Int32Array(width * height).fill(-1) }
}

/** `#rgb` or `#rrggbb` as an `Rgb`; anything else is no colour. */
export function hexRgb(color        )                  {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color.trim())
  if (!m) return undefined
  const hex = m[1] .length === 3 ? [...m[1] ].map(c => c + c).join('') : m[1] 
  const n = parseInt(hex, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The coverage from which a shape's colour is a dot's ink. */
const INKED = 1 / 3

/** Coverage from a signed distance in dots: 1 inside, 0 outside, a ramp one dot wide across the edge. */
function cover(sd        )         {
  return clamp(0.5 - sd, 0, 1)
}

/** Paints `color` over every dot of the box at the coverage `sd` gives, times `alpha`. */
function paint(d      , box     , color     , alpha        , sd                                  )       {
  if (alpha <= 0) return
  const { data, ink, width } = d
  const packed = (Math.round(color[0]) << 16) | (Math.round(color[1]) << 8) | Math.round(color[2])
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const a = cover(sd(x + 0.5, y + 0.5)) * alpha
      if (a <= 0) continue
      const i = (y * width + x) * 4
      data[i] = color[0] * a + data[i]  * (1 - a)
      data[i + 1] = color[1] * a + data[i + 1]  * (1 - a)
      data[i + 2] = color[2] * a + data[i + 2]  * (1 - a)
      data[i + 3] = a + data[i + 3]  * (1 - a)
      if (a >= INKED) ink[i / 4] = packed
    }
  }
}

/** The dots a shape spanning `[x0, x1] × [y0, y1]` can touch, inside the canvas. */
function box(d      , x0        , y0        , x1        , y1        )      {
  return {
    x0: clamp(Math.floor(x0 - 1), 0, d.width),
    y0: clamp(Math.floor(y0 - 1), 0, d.height),
    x1: clamp(Math.ceil(x1 + 1), 0, d.width),
    y1: clamp(Math.ceil(y1 + 1), 0, d.height),
  }
}

export function fillCircle(d      , cx        , cy        , r        , color     , alpha = 1)       {
  paint(d, box(d, cx - r, cy - r, cx + r, cy + r), color, alpha, (x, y) => Math.hypot(x - cx, y - cy) - r)
}

export function strokeCircle(d      , cx        , cy        , r        , half        , color     , alpha = 1)       {
  const o = r + half
  paint(d, box(d, cx - o, cy - o, cx + o, cy + o), color, alpha, (x, y) => Math.abs(Math.hypot(x - cx, y - cy) - r) - half)
}

/** The signed distance to a box from `(x, y)` to `(x + w, y + h)` with corners of radius `r`. */
function roundRectSd(x        , y        , w        , h        , r        )                                     {
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

export function fillRoundRect(d      , x        , y        , w        , h        , r        , color     , alpha = 1)       {
  if (!(w > 0 && h > 0)) return
  paint(d, box(d, x, y, x + w, y + h), color, alpha, roundRectSd(x, y, w, h, r))
}

export function strokeRoundRect(
  d      , x        , y        , w        , h        , r        , half        , color     , alpha = 1,
)       {
  if (!(w > 0 && h > 0)) return
  const sd = roundRectSd(x, y, w, h, r)
  paint(d, box(d, x - half, y - half, x + w + half, y + h + half), color, alpha, (px, py) => Math.abs(sd(px, py)) - half)
}

/** Fills the rings by the nonzero rule, as an Svg fills a path. */
export function fillPolygon(d      , rings                               , color     , alpha = 1)       {
  const edges                   = []
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) edges.push([ring[i] , ring[(i + 1) % ring.length] ])
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

function cross(a       , b       , px        , py        )         {
  return (b.x - a.x) * (py - a.y) - (px - a.x) * (b.y - a.y)
}

/** How far `(px, py)` is from the segment, and where along it (0 at `a`, 1 at `b`) it is nearest. */
function segmentDistance(a       , b       , px        , py        )                                                       {
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
  d      , points                  , closed         , half        , cap     , color     , alpha = 1,
)       {
  if (points.length === 0 || !(half > 0)) return
  const pts = closed ? [...points, points[0] ] : points
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
    const p = pts[s] 
    const q = one ? p : pts[s + 1] 
    const sb = box(d, Math.min(p.x, q.x) - reach, Math.min(p.y, q.y) - reach, Math.max(p.x, q.x) + reach, Math.max(p.y, q.y) + reach)
    const atStart = !closed && s === 0
    const atEnd = !closed && s === last
    for (let y = Math.max(sb.y0, b.y0); y < Math.min(sb.y1, b.y1); y++) {
      for (let x = Math.max(sb.x0, b.x0); x < Math.min(sb.x1, b.x1); x++) {
        const v = capped(p, q, x + 0.5, y + 0.5, half, cap, atStart || one, atEnd || one)
        const i = (y - b.y0) * w + (x - b.x0)
        if (v < sd[i] ) sd[i] = v
      }
    }
  }
  paint(d, b, color, alpha, (x, y) => sd[(Math.floor(y) - b.y0) * w + (Math.floor(x) - b.x0)] )
}

/** The signed distance to one segment of a stroke: a capsule, squared off at an open end with a butt or square cap. */
function capped(a       , b       , px        , py        , half        , cap     , atStart         , atEnd         )         {
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
export function dash(points                  , closed         , pattern                   )            {
  const pts = closed && points.length > 0 ? [...points, points[0] ] : [...points]
  const steps = pattern.length % 2 === 1 ? [...pattern, ...pattern] : [...pattern]
  if (steps.length === 0 || !steps.every(n => n > 0)) return [pts]
  const out            = []
  let k = 0
  let left = steps[0] 
  let on = true
  let current          = [pts[0] ]
  for (let i = 0; i + 1 < pts.length; i++) {
    let a = pts[i] 
    const b = pts[i + 1] 
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
      left = steps[k] 
    }
    left -= len
    if (on) current.push(b)
  }
  if (on && current.length > 1) out.push(current)
  return out
}

// ---- src/readSvg.ts
// Reads the markup the components write and paints the same shapes on a dot
// canvas: rects, circles, ellipses, lines and paths (with arcs and curves),
// stroked or filled, in groups and nested `<svg>`s; a gradient fill paints in
// its mean colour. `<text>` is not painted but kept as a label, to be set in
// letters over the cells. What CSS hides (a hover's tooltip) and what `<defs>`
// holds stay unpainted; what this subset does not know is skipped.

/** A `<text>`, in dots: where its anchor and baseline sit, and how it is set. */

/** How a frame maps its own units to dots: `X = sx * x + tx`. */

/** The presentation attributes a child takes from its parent. */
const INHERITED = [
  'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-dasharray', 'paint-order',
  'color', 'font-size', 'text-anchor', 'fill-opacity', 'stroke-opacity', 'visibility',
]

const TOKEN = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|<!--[\s\S]*?-->|([^<]+)/g
const ATTR = /([\w:-]+)="([^"]*)"/g
const ENTITY = /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi
const NAMED                         = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function unescape(text        )         {
  return text.replace(ENTITY, (whole, name        ) => {
    const lower = name.toLowerCase()
    if (lower in NAMED) return NAMED[lower] 
    const code = lower.startsWith('#x') ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10)
    return Number.isFinite(code) && code <= 0x10ffff ? String.fromCodePoint(code) : whole
  })
}

function attrsOf(source        )                         {
  const out                         = {}
  for (const m of source.matchAll(ATTR)) out[m[1] ] = unescape(m[2] )
  return out
}

function number(value                    , fallback = 0)         {
  const n = Number.parseFloat(value ?? '')
  return Number.isFinite(n) ? n : fallback
}

/** The classes a `<style>` hides outright: `.a,.b{visibility:hidden}`. Rules behind a combinator or `:hover` are not read. */
export function hiddenClasses(css        )              {
  const out = new Set        ()
  for (const rule of css.split('}')) {
    const [selectors, body] = rule.split('{')
    if (body === undefined || !/visibility\s*:\s*hidden|display\s*:\s*none/.test(body)) continue
    for (const s of selectors .split(',')) {
      const m = /^\s*\.([\w-]+)\s*$/.exec(s)
      if (m) out.add(m[1] )
    }
  }
  return out
}

function compose(p           , c           )            {
  return { sx: p.sx * c.sx, sy: p.sy * c.sy, tx: p.sx * c.tx + p.tx, ty: p.sy * c.ty + p.ty }
}

/** `translate(x y)` and `scale(k)` from a `transform`; other functions are left out. */
function transformOf(value                    )            {
  let t            = { sx: 1, sy: 1, tx: 0, ty: 0 }
  for (const m of (value ?? '').matchAll(/(translate|scale)\(([^)]*)\)/g)) {
    const [a = 0, b] = m[2] .split(/[\s,]+/).filter(Boolean).map(Number)
    t = compose(t, m[1] === 'translate' ? { sx: 1, sy: 1, tx: a, ty: b ?? 0 } : { sx: a, sy: b ?? a, tx: 0, ty: 0 })
  }
  return t
}

function colorOf(value                    , current                    , paints                           )                  {
  if (value === undefined) return undefined
  const v = value.trim()
  const url = /^url\(\s*#([^)\s]+)\s*\)/.exec(v)
  if (url) return paints?.get(url[1] )
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
export function gradientColors(svg        )                   {
  const found = new Map                                                                ()
  for (const m of svg.matchAll(/<(linear|radial)Gradient\b([^>]*?)(\/?)>(?:([\s\S]*?)<\/\1Gradient>)?/g)) {
    const attrs = attrsOf(m[2] ?? '')
    if (attrs.id === undefined) continue
    const stops                               = []
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
  const out = new Map             ()
  for (const [id, g] of found) {
    const stops = g.stops.length > 0 ? g.stops : (g.href !== undefined ? found.get(g.href)?.stops ?? [] : [])
    if (stops.length === 0) continue
    // The mean of the colour along 0..1: flat before the first stop and after the last, linear between.
    const sum = [0, 0, 0]
    const add = (c     , w        ) => { for (let k = 0; k < 3; k++) sum[k] = sum[k]  + c[k]  * w }
    add(stops[0] .color, stops[0] .at)
    for (let j = 0; j + 1 < stops.length; j++) {
      const a = stops[j] 
      const b = stops[j + 1] 
      const w = b.at - a.at
      add(a.color, w / 2)
      add(b.color, w / 2)
    }
    const tail = stops[stops.length - 1] 
    add(tail.color, 1 - tail.at)
    out.set(id, [sum[0] , sum[1] , sum[2] ])
  }
  return out
}

/** A cubic Bézier from `p0` as points after it, about `step` apart along its control polygon. */
function cubicPoints(p0       , c1       , c2       , p1       , step        )          {
  const length = Math.hypot(c1.x - p0.x, c1.y - p0.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(p1.x - c2.x, p1.y - c2.y)
  const n = Math.min(256, Math.max(1, Math.ceil(length / Math.max(step, 1e-3))))
  const out          = []
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
function quadPoints(p0       , c       , p1       , step        )          {
  const c1 = { x: p0.x + (2 / 3) * (c.x - p0.x), y: p0.y + (2 / 3) * (c.y - p0.y) }
  const c2 = { x: p1.x + (2 / 3) * (c.x - p1.x), y: p1.y + (2 / 3) * (c.y - p1.y) }
  return cubicPoints(p0, c1, c2, p1, step)
}

/** A path's `d` as subpaths of points, arcs and curves flattened every `step` units. M L H V C S Q T A Z, absolute or relative. */
export function pathPoints(d        , step        )                                         {
  // Every command letter is a token, so one this subset does not draw stops the path instead of passing for a line.
  const tokens = d.match(/[A-Za-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) ?? []
  const out                                         = []
  let current          = []
  let x = 0
  let y = 0
  let start = { x: 0, y: 0 }
  let command = ''
  // The last curve's second control point, for the reflection S and T start from.
  let cubic                   
  let quad                   
  let i = 0
  const read = () => Number(tokens[i++])
  const finish = (closed         ) => {
    if (current.length > 0) out.push({ points: current, closed })
    current = []
  }
  const isCommand = (token                    ) => token !== undefined && /[A-Za-z]/.test(token)
  while (i < tokens.length) {
    if (isCommand(tokens[i])) {
      command = tokens[i++] 
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
    const mirror = (c                   ) => (c === undefined ? here : { x: 2 * x - c.x, y: 2 * y - c.y })
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
const ARGS                         = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7 }

/** An endpoint arc as points after its start, the SVG way (its implementation notes, F.6.5). */
export function arcPoints(
  x1        , y1        , rx0        , ry0        , phiDeg        , large         , sweep         , x2        , y2        , step        ,
)          {
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
  const angle = (ux        , uy        , vx        , vy        ) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  const theta = angle(1, 0, (xp - cxp) / rx, (yp - cyp) / ry)
  let delta = angle((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  if (sweep && delta < 0) delta += 2 * Math.PI
  const n = Math.max(1, Math.ceil((Math.abs(delta) * Math.max(rx, ry)) / Math.max(step, 1e-3)))
  const out          = []
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
export function readSvg(svg        , scale        )          {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const rootAttrs = attrsOf(root)
  const width = number(rootAttrs.width, 1)
  const height = number(rootAttrs.height, 1)
  const columns = Math.max(1, Math.ceil((width * scale) / 2 - 1e-6))
  const rows = Math.max(1, Math.ceil((height * scale) / 4 - 1e-6))
  const canvas = dots(columns * 2, rows * 4)
  const labels          = []
  const hidden = new Set        ()
  const stack          = []
  let text                                                                            
  let styleText                    
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
    const style                         = {}
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
      const kx = vb.length === 4 && vb[2]  > 0 ? w / vb[2]  : 1
      const ky = vb.length === 4 && vb[3]  > 0 ? h / vb[3]  : 1
      at = compose(at, { sx: kx, sy: ky, tx: number(attrs.x) - kx * (vb[0] ?? 0), ty: number(attrs.y) - ky * (vb[1] ?? 0) })
    }
    if (attrs.transform !== undefined) at = compose(at, transformOf(attrs.transform))
    const frame        = { tag, at, style, hidden: isHidden }

    if (tag === 'style') styleText = ''
    else if (tag === 'text') text = { frame, attrs, words: '' }
    else if (!isHidden) shape(frame, attrs)

    if (!selfClosing) stack.push(frame)
    else if (tag === 'text') text = undefined
  }
  return { dots: canvas, labels, columns, rows }

  function label(frame       , attrs                        , words        )       {
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

  function shape(frame       , attrs                        )       {
    const { at, style } = frame
    const k = (at.sx + at.sy) / 2
    const X = (v        ) => at.sx * v + at.tx
    const Y = (v        ) => at.sy * v + at.ty
    const fill = colorOf(style.fill ?? (frame.tag === 'line' || frame.tag === 'polyline' ? 'none' : '#000000'), style.color, paints)
    const stroke = colorOf(style.stroke, style.color, paints)
    const fillAlpha = number(style['fill-opacity'], 1) * number(attrs.opacity, 1)
    const strokeAlpha = number(style['stroke-opacity'], 1) * number(attrs.opacity, 1)
    const half = Math.max(MIN_STROKE, number(style['stroke-width'], 1) * k) / 2
    const cap      = style['stroke-linecap'] === 'round' || style['stroke-linecap'] === 'square' ? style['stroke-linecap'] : 'butt'
    const pattern = (style['stroke-dasharray'] ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
    const dashes = pattern.length > 0 && pattern.every(n => n > 0) ? pattern.map(n => Math.max(1, n * k)) : undefined
    const strokeFirst = (style['paint-order'] ?? '').trim().startsWith('stroke')

    const line = (points         , closed         ) => {
      if (!stroke) return
      const crisp = snapLine(points, half)
      for (const piece of dashes ? dash(crisp, closed, dashes) : [crisp]) {
        strokePolyline(canvas, piece, closed && !dashes, half, cap, stroke, strokeAlpha)
      }
    }
    const paintBoth = (doFill            , doStroke            ) => {
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
          () => fillRoundRect(canvas, x, y, w, h, r, fill , fillAlpha),
          () => (dashes ? line(rectRing(x, y, w, h), true) : strokeRoundRect(canvas, x, y, w, h, r, half, stroke , strokeAlpha)),
        )
        return
      }
      case 'circle': {
        const cx = X(number(attrs.cx))
        const cy = Y(number(attrs.cy))
        const r = number(attrs.r) * k
        if (!(r > 0)) return
        paintBoth(
          () => fillCircle(canvas, cx, cy, r, fill , fillAlpha),
          () => strokeCircle(canvas, cx, cy, r, half, stroke , strokeAlpha),
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
        const ring          = []
        for (let j = 0; j < n; j++) {
          const t = (2 * Math.PI * j) / n
          ring.push({ x: X(cx + rx * Math.cos(t)), y: Y(cy + ry * Math.sin(t)) })
        }
        paintBoth(() => fillPolygon(canvas, [ring], fill , fillAlpha), () => line(ring, true))
        return
      }
      case 'line': {
        line([{ x: X(number(attrs.x1)), y: Y(number(attrs.y1)) }, { x: X(number(attrs.x2)), y: Y(number(attrs.y2)) }], false)
        return
      }
      case 'polyline':
      case 'polygon': {
        const n = (attrs.points ?? '').split(/[\s,]+/).filter(Boolean).map(Number)
        const points          = []
        for (let j = 0; j + 1 < n.length; j += 2) points.push({ x: X(n[j] ), y: Y(n[j + 1] ) })
        const closed = frame.tag === 'polygon'
        paintBoth(() => fillPolygon(canvas, [points], fill , fillAlpha), () => line(points, closed))
        return
      }
      case 'path': {
        // Arcs flattened every half dot.
        const subpaths = pathPoints(attrs.d ?? '', 0.5 / Math.max(k, 1e-6)).map(s => ({
          closed: s.closed,
          points: s.points.map(p => ({ x: X(p.x), y: Y(p.y) })),
        }))
        paintBoth(
          () => fillPolygon(canvas, subpaths.map(s => s.points), fill , fillAlpha),
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
export function snapLine(points                  , half        )          {
  const level = (a       , b       ) => Math.abs(a.y - b.y) < 1e-6
  const upright = (a       , b       ) => Math.abs(a.x - b.x) < 1e-6
  for (let i = 0; i + 1 < points.length; i++) {
    if (!level(points[i] , points[i + 1] ) && !upright(points[i] , points[i + 1] )) return [...points]
  }
  const snap = (v        ) => Math.round(v - half) + half
  return points.map((p, i) => {
    const runs = [points[i - 1], points[i + 1]].filter((q)             => q !== undefined)
    return {
      x: runs.some(q => upright(p, q) && !level(p, q)) ? snap(p.x) : p.x,
      y: runs.some(q => level(p, q) && !upright(p, q)) ? snap(p.y) : p.y,
    }
  })
}

function rectRing(x        , y        , w        , h        )          {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }]
}

// ---- src/raster.ts
// The terminal branch: a picture as the cells of a `Raster`, the terminal's
// own element, since the terminal draws no `Svg`. Chafa's way, in a few
// hundred lines: the picture's shapes are painted on dots, two across and four
// down per cell; each cell takes the symbol and the two colours that best
// repeat its eight dots (a half or quarter block, a full block, or braille for
// a thin line); and every label is set in letters over the cells it falls on,
// so figures stay sharp.

/** A Raster's colour for the terminal's own: bit 24 alone. */
export const DEFAULT_COLOR = 0x01000000

/** CSS pixels a cell spans across by default: 8 by 16, about a terminal's own cell beside 11px text. */
export const CELL_PX = 8

/** The most a Raster may be, in cells. */
export const RASTER_MAX = { columns: 512, rows: 256 }

/** One cell: a code point, and a foreground and a background as `0xRRGGBB` or `DEFAULT_COLOR`. */

/** A Raster's size and cells: what the element takes beside its `key`. */

/** The same with the `key` the mod chose, ready to spread: `<Raster {...toRaster(picture, { key })} />`. */

// A cell's eight dots are numbered row by row: bit `row * 2 + column`.

/** Every split of a cell into quarters (two dots by two), by the mask of its inked dots. */
export const BLOCK_GLYPHS                                   = {
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
export function brailleOf(mask        )         {
  let bits = 0
  for (let i = 0; i < 8; i++) if (mask & (1 << i)) bits |= BRAILLE_BIT[i] 
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

// Scratch for the fit, reused cell to cell: the dots' channels, two side means.
const V = new Float64Array(24)
const IN = new Float64Array(3)
const OUT = new Float64Array(3)

/** The mean of the dots in (`inked`) or out of `mask`, into `to`. */
function sideMean(mask        , inked        , to              )       {
  let r = 0
  let g = 0
  let b = 0
  let n = 0
  for (let i = 0; i < 8; i++) {
    if (((mask >> i) & 1) === inked) {
      r += V[i * 3] 
      g += V[i * 3 + 1] 
      b += V[i * 3 + 2] 
      n++
    }
  }
  to[0] = n === 0 ? 0 : r / n
  to[1] = n === 0 ? 0 : g / n
  to[2] = n === 0 ? 0 : b / n
}

/** The squared error of drawing the cell's dots in `ink` where `mask` is set and `bare` elsewhere. */
function splitError(mask        , ink                   , bare                   )         {
  let error = 0
  for (let i = 0; i < 8; i++) {
    const c = (mask >> i) & 1 ? ink : bare
    error += (V[i * 3]  - c[0] ) ** 2 + (V[i * 3 + 1]  - c[1] ) ** 2 + (V[i * 3 + 2]  - c[2] ) ** 2
  }
  return error
}

function distance2(a                   , b                   )         {
  return (a[0]  - b[0] ) ** 2 + (a[1]  - b[1] ) ** 2 + (a[2]  - b[2] ) ** 2
}

const rgb = (a                   )      => [a[0] , a[1] , a[2] ]
const unpack = (c        )      => [(c >> 16) & 255, (c >> 8) & 255, c & 255]

/**
 * The symbol and colours that best repeat a cell's eight dots (row by row),
 * by the least squared error. Of a block's two colours, the one nearer the
 * backdrop goes behind, so the surface stays one colour from cell to cell.
 * `inks` (the canvas's, `0xRRGGBB` or -1 a dot) give a braille line its own
 * colour where its dots are blends.
 */
export function fitCell(dots                , backdrop     , inks                    = [])      {
  dots.forEach((c, i) => {
    V[i * 3] = c[0]
    V[i * 3 + 1] = c[1]
    V[i * 3 + 2] = c[2]
  })
  let block                 
  for (const mask of BLOCK_MASKS) {
    if (mask > (~mask & 0xff)) continue // a split and its inverse are one fit
    sideMean(mask, 1, IN)
    sideMean(mask, 0, OUT)
    const error = splitError(mask, IN, OUT)
    if (block !== undefined && error >= block.error - 1e-6) continue
    if (mask === 0) block = { ch: ' ', fg: rgb(OUT), bg: rgb(OUT), error }
    else if (distance2(IN, backdrop) < distance2(OUT, backdrop)) block = { ch: BLOCK_GLYPHS[~mask & 0xff] , fg: rgb(OUT), bg: rgb(IN), error }
    else block = { ch: BLOCK_GLYPHS[mask] , fg: rgb(IN), bg: rgb(OUT), error }
  }
  // Braille must beat the block by its edge: a block this close leaves it nothing to win.
  const needed = block .error * BRAILLE_EDGE.ratio - BRAILLE_EDGE.least
  if (needed <= 0) return block 
  const own = dots.map((_, i) => ((inks[i] ?? -1) >= 0 ? unpack(inks[i] ) : undefined))
  let braille                                                                  
  const shown = new Float64Array(3)
  for (let mask = 1; mask < 0xff; mask++) {
    // Behind the dots, what the shapes there are, not their blend with the line's soft edge:
    // the blend would tint the cell into a patch.
    let n = 0
    OUT.fill(0)
    for (let i = 0; i < 8; i++) {
      if ((mask >> i) & 1) continue
      const c = own[i] ?? V.subarray(i * 3, i * 3 + 3)
      for (let k = 0; k < 3; k++) OUT[k] = OUT[k]  + c[k] 
      n++
    }
    for (let k = 0; k < 3; k++) OUT[k] = OUT[k]  / n
    // The ink is the colour that stands out most among the dots: a shape's own where the canvas knows it.
    let ink                    = OUT
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
    for (let c = 0; c < 3; c++) shown[c] = OUT[c]  + BRAILLE_INK * (ink[c]  - OUT[c] )
    const error = splitError(mask, shown, OUT)
    if (braille === undefined || error < braille.error) braille = { mask, ink: rgb(ink), bare: rgb(OUT), error }
  }
  if (braille !== undefined && braille.error < needed) {
    return { ch: brailleOf(braille.mask), fg: braille.ink, bg: braille.bare, error: braille.error }
  }
  return block 
}

/** A colour as `0xRRGGBB`. */
export function packRgb(c     )         {
  const q = (v        ) => Math.round(clamp(v, 0, 255))
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
function cellColor(c     , own                )         {
  for (const o of own) if (distance2(c, o) <= OWN_COLOR * OWN_COLOR) return packRgb(o)
  const q = (v        ) => (Math.round((clamp(v, 0, 255) / 255) * 31) * 255) / 31
  return packRgb([q(c[0]), q(c[1]), q(c[2])])
}

/** Ranges of code points a terminal draws two columns wide (East Asian wide, emoji). */
const WIDE                              = [
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
const ZERO                              = [
  [0x0300, 0x036f], [0x0483, 0x0489], [0x0591, 0x05bd], [0x0610, 0x061a], [0x064b, 0x065f], [0x1ab0, 0x1aff],
  [0x1dc0, 0x1dff], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x2064], [0x20d0, 0x20ff], [0xfe00, 0xfe0f],
  [0xfe20, 0xfe2f], [0xfeff, 0xfeff],
]

const within = (cp        , ranges                             ) => ranges.some(([lo, hi]) => cp >= lo && cp <= hi)

/**
 * A label's characters as cells take them: one printable, one-column BMP
 * character each. A control character becomes a space, a wide or astral one
 * `?`, and a mark that takes no column is dropped.
 */
export function cellChars(words        )           {
  const out           = []
  for (const ch of words) {
    const cp = ch.codePointAt(0) 
    if (within(cp, ZERO)) continue
    if (cp < 0x20 || (cp >= 0x7f && cp < 0xa0)) out.push(0x20)
    else if (cp > 0xffff || within(cp, WIDE)) out.push(0x3f)
    else out.push(cp)
  }
  return out
}

/** Sets a label in letters: on the row its middle falls in, from the column its anchor gives, kept inside. */
function setLabel(grid      , label       )       {
  const chars = cellChars(label.words).slice(0, grid.columns)
  if (chars.length === 0) return
  const row = Math.floor((label.y - label.size * 0.35) / 4)
  if (row < 0 || row >= grid.rows) return
  const at = label.x / 2
  const start = label.anchor === 'middle' ? Math.round(at - chars.length / 2) : label.anchor === 'end' ? Math.round(at) - chars.length : Math.round(at)
  const first = clamp(start, 0, grid.columns - chars.length)
  const fg = packRgb(label.color)
  chars.forEach((ch, i) => {
    const cell = grid.cells[row * grid.columns + first + i] 
    // The letter goes on the cell's background: what is under it, the surface, gives way.
    grid.cells[row * grid.columns + first + i] = { ch, fg, bg: cell.bg }
  })
}

function backdropOf(options               )      {
  return (options.backdrop === undefined ? undefined : hexRgb(options.backdrop)) ?? hexRgb(pickTheme(options.theme).surface) 
}

/** A picture (or a whole `<svg>`) as a grid of cells, before it is packed. */
export function rasterGrid(picture                  , options                = {})       {
  const svg = typeof picture === 'string' ? picture : picture.svg
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0] ?? ''
  const width = Number(/\swidth="([\d.]+)"/.exec(root)?.[1] ?? CELL_PX)
  const height = Number(/\sheight="([\d.]+)"/.exec(root)?.[1] ?? 16)
  const columns = clamp(Math.round(options.columns ?? Math.ceil(width / CELL_PX)), 1, RASTER_MAX.columns)
  const scale = Math.min((2 * columns) / width, (4 * RASTER_MAX.rows) / height)
  const painted = readSvg(svg, scale)
  const backdrop = backdropOf(options)
  const { data, width: across } = painted.dots
  const grid       = { columns: painted.columns, rows: painted.rows, cells: [] }
  const own = [backdrop, ...[...new Set(painted.dots.ink)].filter(c => c >= 0).map(unpack)]
  for (let row = 0; row < grid.rows; row++) {
    for (let col = 0; col < grid.columns; col++) {
      const cellDots        = []
      const inks           = []
      let most = 0
      for (let dy = 0; dy < 4; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((row * 4 + dy) * across + col * 2 + dx) * 4
          const a = data[i + 3] 
          most = Math.max(most, a)
          inks.push(painted.dots.ink[i / 4] )
          cellDots.push([0, 1, 2].map(c => data[i + c]  + backdrop[c]  * (1 - a))                  )
        }
      }
      if (most < 0.02) {
        // Nothing painted here: the terminal's own background shows.
        grid.cells.push({ ch: 0x20, fg: DEFAULT_COLOR, bg: DEFAULT_COLOR })
        continue
      }
      const fit = fitCell(cellDots, backdrop, inks)
      grid.cells.push({ ch: fit.ch.codePointAt(0) , fg: cellColor(fit.fg, own), bg: cellColor(fit.bg, own) })
    }
  }
  for (const label of painted.labels) setLabel(grid, label)
  return grid
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Bytes as padded base64: a Raster's `cells`, an Image's `rgba`. */
export function toBase64(bytes            )         {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]  << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += BASE64[(n >> 18) & 63]  + BASE64[(n >> 12) & 63] 
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63]  : '='
    out += i + 2 < bytes.length ? BASE64[n & 63]  : '='
  }
  return out
}

/** Padded or bare base64 back as bytes. */
export function fromBase64(text        )             {
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
export function encodeCells(grid      )         {
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
export function decodeCells(cells        , columns        , rows        )       {
  const bytes = fromBase64(cells)
  if (bytes.length !== columns * rows * 12) {
    throw new RangeError(`svg-panel: ${bytes.length} bytes is not ${columns} × ${rows} cells`)
  }
  const word = (o        ) => (bytes[o]  | (bytes[o + 1]  << 8) | (bytes[o + 2]  << 16) | (bytes[o + 3]  << 24)) >>> 0
  const out         = []
  for (let i = 0; i < columns * rows; i++) out.push({ ch: word(i * 12), fg: word(i * 12 + 4), bg: word(i * 12 + 8) })
  return { columns, rows, cells: out }
}

/** The grid's characters alone, a line a row. */
export function gridText(grid      )         {
  const lines           = []
  for (let row = 0; row < grid.rows; row++) {
    lines.push(String.fromCodePoint(...grid.cells.slice(row * grid.columns, (row + 1) * grid.columns).map(c => c.ch)))
  }
  return lines.join('\n')
}

/** The grid in 24-bit ANSI colour, to print in a terminal outside Claude Code (a preview, a log). */
export function ansi(grid      )         {
  const color = (c        , ground         ) =>
    c === DEFAULT_COLOR ? `\x1b[${ground + 1}m` : `\x1b[${ground};2;${(c >> 16) & 255};${(c >> 8) & 255};${c & 255}m`
  const lines           = []
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

export function toRaster(picture                  , options                                   = {})                              {
  const grid = rasterGrid(picture, options)
  const cells              = { columns: grid.columns, rows: grid.rows, cells: encodeCells(grid) }
  return options.key === undefined ? cells : { key: options.key, ...cells }
}

// ---- src/pixels.ts
// The pixel branch: a picture as RGBA pixels over a box of terminal cells, for
// a terminal that draws pictures (Claude Code's `Image`, a kitty escape). The
// same painter as the Raster's, at more dots a cell; the labels are not set,
// since the library carries no font.

/** Straight (not premultiplied) RGBA, four bytes a pixel, row by row. */

/** The pixels and the box of cells they fill. */

/** Pixels across a cell by default: twice a common cell's 8, so the picture stays sharp on a dense screen. */
export const CELL_PIXELS = 16

/** What an `Image` takes: a box of 1 to 255 cells a side, 2048 pixels a side, 2 MiB of bytes (and so does a whole tree of Images). */
export const PIXELS_MAX = { cells: 255, side: 2048, bytes: 2 * 1024 * 1024 }

/**
 * A picture (or a whole `<svg>`) as pixels over whole cells, a cell twice as
 * tall as it is wide, as the Raster's are: the box keeps the picture's shape,
 * and the pixels past the picture's edge are clear.
 */
export function toPixels(picture                  , options               = {})               {
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
  const out               = { width: columns * px, height: rows * 2 * px, data: new Uint8Array(columns * px * rows * 2 * px * 4), columns, rows }
  const painted = readSvg(svg, px / cellCss).dots
  const w = Math.min(out.width, painted.width)
  const h = Math.min(out.height, painted.height)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * painted.width + x) * 4
      const a = painted.data[i + 3] 
      if (a <= 0) continue
      const o = (y * out.width + x) * 4
      // The canvas is premultiplied; the bytes are not.
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(clamp(painted.data[i + c]  / a, 0, 255))
      out.data[o + 3] = Math.round(clamp(a, 0, 1) * 255)
    }
  }
  return out
}

// ---- src/kitty.ts
// The kitty graphics protocol, for a program that writes to the terminal
// itself: pixels sent as raw RGBA in the escape, so no PNG encoder is needed.
// kitty, Ghostty and WezTerm read it.

/** The most base64 one command may carry. */
export const KITTY_CHUNK = 4096

const command = (keys        , payload = '') => `\x1b_G${keys}${payload ? `;${payload}` : ''}\x1b\\`

/**
 * Pixels shown at the cursor over their box of cells, the cursor after them.
 * With an `id`, sending that id again deletes the earlier picture and its
 * placements, and shows the new one at the cursor.
 * `q=2`: the terminal answers nothing, so nothing lands in the program's input.
 */
export function kittyImage(pixels              , options                  = {})         {
  const id = options.id === undefined ? '' : `,i=${options.id}`
  const keys = `a=T,f=32,s=${pixels.width},v=${pixels.height},c=${pixels.columns},r=${pixels.rows}${id},q=2`
  const payload = toBase64(pixels.data)
  if (payload.length <= KITTY_CHUNK) return command(keys, payload)
  // Every chunk but the last says more follow (m=1); only the first carries the keys.
  let out = ''
  for (let at = 0; at < payload.length; at += KITTY_CHUNK) {
    const more = at + KITTY_CHUNK < payload.length ? 1 : 0
    out += command(at === 0 ? `${keys},m=1` : `m=${more},q=2`, payload.slice(at, at + KITTY_CHUNK))
  }
  return out
}

/** Deletes the image `id` and frees its data. */
export function kittyDelete(id        )         {
  return command(`a=d,d=I,i=${id},q=2`)
}

// ---- src/drivers.ts
// Drivers: one way each of showing a picture in a terminal, and a ranked list
// that picks the best one the terminal can draw. `claudeCode` holds an `Image`
// of pixels and a `Raster` of cells, for a mod; `printDrivers` holds a kitty
// escape and ANSI cells, for a program that writes to the terminal itself. A
// driver for another terminal or another host is one more entry, `add`ed.

/** The environment the drivers judge the terminal by: what `$.env.get` gives a mod. */

/** The variables the drivers here read; a mod asks `$.env.get` for each. */
export const TERMINAL_ENV = ['TERM', 'TERM_PROGRAM', 'KITTY_WINDOW_ID', 'TMUX', 'SVG_PANEL_DRIVER']         

/** What every driver's options carry: the environment, and a driver to use whatever it says. */

/** A ranked list of drivers. Keep one that supports every terminal in it, lowest, so a picture always shows. */
export function drivers                                    (...list                        )                        {
  const ranked = [...list].sort((a, b) => b.rank - a.rank)
  const byId = (id        ) => ranked.find(d => d.id === id)
  const pick = (env             , prefer         ) => {
    const named = byId(prefer ?? '') ?? byId(env.SVG_PANEL_DRIVER ?? '')
    const driver = named ?? ranked.find(d => d.supports(env))
    if (!driver) throw new Error(`svg-panel: no driver in [${ranked.map(d => d.id).join(', ')}] draws in this terminal`)
    return driver
  }
  return {
    list: ranked,
    add(driver) {
      if (byId(driver.id)) throw new Error(`svg-panel: a driver named ${driver.id} is already in the list`)
      return drivers(...ranked, driver)
    },
    byId,
    pick,
    draw: (picture, options) => pick(options.env, options.prefer).draw(picture, options),
  }
}

/** An `Image`'s props: RGBA pixels over a box of cells. */

/** What a Claude Code terminal shows: the element to draw and its props, ready to spread. */

/**
 * Pixels through Claude Code's `Image`, which draws them in kitty and Ghostty
 * (and in iTerm2 3.5 and later under fullscreen rendering, which the
 * environment does not tell: `prefer: 'image'` there). Never inside tmux,
 * where an Image draws only its alt.
 */
export const imageDriver                                    = {
  id: 'image',
  rank: 10,
  supports: env =>
    env.TMUX === undefined &&
    (env.TERM === 'xterm-kitty' || env.TERM === 'xterm-ghostty' || env.KITTY_WINDOW_ID !== undefined || env.TERM_PROGRAM === 'ghostty'),
  draw(picture, options) {
    const pixels = toPixels(picture, options)
    const alt = options.alt ?? (typeof picture === 'string' ? '' : picture.alt)
    return {
      element: 'Image',
      props: {
        key: options.key,
        source: { rgba: toBase64(pixels.data), width: pixels.width, height: pixels.height },
        columns: pixels.columns,
        rows: pixels.rows,
        alt: alt || ' ',
      },
    }
  },
}

/** Cells through Claude Code's `Raster`: blocks, braille and letters, in every terminal. */
export const rasterDriver                                    = {
  id: 'raster',
  rank: 0,
  supports: () => true,
  draw: (picture, options) => ({ element: 'Raster', props: toRaster(picture, options) }),
}

/** The drivers for a Claude Code mod's terminal surface. */
export const claudeCode = drivers(imageDriver, rasterDriver)

/**
 * A picture for a Claude Code terminal: an Image where the terminal draws
 * pixels, a Raster elsewhere.
 * `const v = terminalView(p, { env, columns: e.props.bodyColumns, key: 'cpu' })`, then
 * `v.element === 'Image' ? <Image {...v.props} /> : <Raster {...v.props} />`.
 */
export function terminalView(picture                  , options             )               {
  return claudeCode.draw(picture, options)
}

/** kitty pixels on standard output: kitty and Ghostty, outside tmux (which drops the escape unless wrapped). */
export const kittyPrintDriver                               = {
  id: 'kitty',
  rank: 10,
  supports: imageDriver.supports,
  draw: (picture, options) => kittyImage(toPixels(picture, options)),
}

/** Coloured block and braille cells on standard output, in any terminal with 24-bit colour. */
export const ansiPrintDriver                               = {
  id: 'ansi',
  rank: 0,
  supports: () => true,
  draw: (picture, options) => ansi(rasterGrid(picture, options)),
}

/** The drivers for a program that prints to the terminal itself. */
export const printDrivers = drivers(kittyPrintDriver, ansiPrintDriver)

/** A picture as text to write to standard output: kitty pixels where the terminal draws them, coloured cells elsewhere. */
export function printView(picture                  , options              )         {
  return printDrivers.draw(picture, options)
}

// ---- src/gauge.ts
// A 240° arc over a scale, a threshold tick, the value as the hero figure and
// a status dot with its word.

export const GAUGE_SWEEP = 240
export const GAUGE_SIZE = { width: 232, height: 176 }
/** The arc's centre and radius in the picture's own pixels. */
export const GAUGE_ARC = { cx: 116, cy: 96, r: 72 }

/** The status a gauge or meter shows when none is given. */
export function statusOf(value        , max        , threshold         )         {
  if (value >= max) return 'critical'
  if (threshold !== undefined && value >= threshold) return 'warning'
  return 'good'
}

/** The angle (degrees clockwise from twelve) a value sits at on the gauge. */
export function gaugeAngle(value        , min        , max        )         {
  return scale(min, max, -GAUGE_SWEEP / 2, GAUGE_SWEEP / 2)(value)
}

export function gauge(data           , options               = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const min = finite(data.min)
  const max = finite(data.max, min + 1)
  const value = finite(data.value, min)
  const status = data.status ?? statusOf(value, max, data.threshold)
  const word = data.statusWord ?? STATUS_WORD[status]
  const color = theme.status[status]
  const { cx, cy, r } = GAUGE_ARC
  const half = GAUGE_SWEEP / 2
  const angle = gaugeAngle(value, min, max)
  const parts           = []

  parts.push(
    `<path class="gauge-track" d="${arcPath(cx, cy, r, -half, half)}" fill="none" stroke="${theme.grid}" stroke-width="10" stroke-linecap="round"/>`,
  )
  if (value > min) {
    parts.push(
      `<path class="gauge-value" d="${arcPath(cx, cy, r, -half, angle)}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/>`,
    )
  }

  if (data.threshold !== undefined && Number.isFinite(data.threshold)) {
    const a = gaugeAngle(data.threshold, min, max)
    const inner = polar(cx, cy, r - 9, a)
    const outer = polar(cx, cy, r + 9, a)
    const d = `M${num(inner.x)} ${num(inner.y)}L${num(outer.x)} ${num(outer.y)}`
    const at = polar(cx, cy, r + 18, a)
    const anchor = at.x > cx + 6 ? 'start' : at.x < cx - 6 ? 'end' : 'middle'
    parts.push(
      `<path d="${d}" stroke="${theme.surface}" stroke-width="6" stroke-linecap="round"/>`,
      `<path class="gauge-tick" d="${d}" stroke="${theme.ink2}" stroke-width="2" stroke-linecap="round"/>`,
      text(at.x, at.y + 4, data.thresholdLabel ?? fmt(data.threshold), { size: 10, fill: theme.muted, anchor }),
    )
  }

  const start = polar(cx, cy, r, -half)
  const end = polar(cx, cy, r, half)
  parts.push(
    text(start.x, start.y + 20, fmt(min), { size: 10, fill: theme.muted, anchor: 'middle', cls: 'gauge-min' }),
    text(end.x, end.y + 20, fmt(max), { size: 10, fill: theme.muted, anchor: 'middle', cls: 'gauge-max' }),
    text(cx, cy + 6, fmt(value), { size: 30, fill: theme.ink, anchor: 'middle', weight: 600, cls: 'gauge-hero' }),
    text(cx, cy + 24, `of ${fmt(max)}`, { size: 11, fill: theme.muted, anchor: 'middle' }),
  )

  const rowWidth = 12 + textWidth(word, 12)
  const dotX = cx - rowWidth / 2 + 4
  parts.push(
    `<circle class="gauge-dot" cx="${num(dotX)}" cy="160" r="4" fill="${color}"/>`,
    text(dotX + 8, 164, word, { size: 12, fill: theme.ink2, cls: 'gauge-word' }),
  )

  const name = data.label ?? 'Gauge'
  const thresholdWords = data.threshold === undefined ? '' : `; threshold ${data.thresholdLabel ?? fmt(data.threshold)}`
  const alt = `${name}: ${fmt(value)} of ${fmt(max)}, ${word}${thresholdWords}`
  const svg = svgDoc({
    ...GAUGE_SIZE,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  const lead = data.label === undefined ? '' : `${data.label} `
  return {
    svg: assertBudget(svg),
    alt,
    twin: `${lead}${fmt(value)} / ${fmt(max)} ${bar(value, max, { min, tick: data.threshold })} ${word}`,
    isInteractive: false,
  }
}

// ---- src/heatmap.ts
// A grid of cells in five steps of one colour, with row and column labels and
// a `less ■■■■■ more` key; a missing value is a short dash.

export const HEAT_STEPS = 5
/** The twin's shades: a space for a missing value, then one per step, faint to full. */
export const HEAT_SHADES = ' ·░▒▓█'

/** The step (0 to 4) a value falls in on `[lo, hi]`. */
export function heatStep(value        , lo        , hi        )         {
  if (hi <= lo) return HEAT_STEPS - 1
  return Math.min(HEAT_STEPS - 1, Math.max(0, Math.floor(((value - lo) / (hi - lo)) * HEAT_STEPS)))
}

/** `#rgb` or `#rrggbb` as three channels; black when it is neither. */
function channels(hex        )           {
  const m = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(hex.trim())
  const full = m ? (m[1] .length === 3 ? [...m[1] ].map(c => c + c).join('') : m[1] ) : '000000'
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16))
}

function mix(a        , b        , t        )         {
  const [x, y] = [channels(a), channels(b)]
  return `#${x.map((v, i) => Math.round(v + (y[i]  - v) * t).toString(16).padStart(2, '0')).join('')}`
}

/** The five fills, from faint to full, mixed from the grid colour to `color`. */
export function heatColors(theme       , color        )           {
  return Array.from({ length: HEAT_STEPS }, (_, k) => mix(theme.grid, color, 0.2 + (0.8 * k) / (HEAT_STEPS - 1)))
}

export function heatmap(data             , options                 = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const size = options.cell ?? 14
  const gap = options.gap ?? 2
  const pitch = size + gap
  const fills = heatColors(theme, options.color ?? theme.series.blue)
  const rows = data.values
  const columns = Math.max(0, ...rows.map(r => r.length))
  const present = rows.flatMap(r => r.filter((v)              => typeof v === 'number' && Number.isFinite(v)))
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
  const labelRoom = (l        ) => Math.max(textWidth(l, 10), [...l].length * 8)
  const left = Math.ceil((6 + (rowLabels.length ? Math.max(...rowLabels.map(labelRoom)) + 6 : 0)) / 8) * 8
  const top = Math.ceil((6 + (colLabels.length ? 14 : 0)) / 16) * 16
  const showKey = options.key ?? true
  const gridW = columns * pitch - gap
  const keyW = textWidth('less', 10) + 6 + HEAT_STEPS * pitch + textWidth('more', 10) + 4
  const width = Math.ceil(left + Math.max(gridW, showKey ? keyW : 0) + 6)
  const height = Math.ceil(top + rows.length * pitch - gap + (showKey ? 22 : 6))
  const parts           = []

  // Column labels where they fit: every k-th, so none runs into the next.
  const stride = Math.max(1, Math.ceil((Math.max(0, ...colLabels.map(l => textWidth(l, 10))) + 4) / pitch))
  colLabels.forEach((l, c) => {
    if (c % stride === 0 && c < columns) parts.push(text(left + c * pitch, top - 4, l, { size: 10, fill: theme.muted, cls: 'heat-col' }))
  })
  rows.forEach((row, r) => {
    const y = top + r * pitch
    if (rowLabels[r] !== undefined) parts.push(text(left - 6, y + size - 2, rowLabels[r] , { size: 10, fill: theme.muted, anchor: 'end', cls: 'heat-row' }))
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
  let best                                                 
  rows.forEach((row, r) => row.forEach((v, c) => {
    if (typeof v === 'number' && Number.isFinite(v) && (best === undefined || v > best.v)) best = { r, c, v }
  }))
  const name = options.label ?? 'Heatmap'
  const where = best === undefined ? '' : [rowLabels[best.r], colLabels[best.c]].filter(Boolean).join(', ')
  const alt = present.length === 0
    ? `${name}: no values yet`
    : `${name}: ${rows.length} rows by ${columns} columns, low ${fmt(Math.min(...present))}, high ${fmt(best .v)}${where ? ` at ${where}` : ''}`
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

// ---- src/icon.ts
// The named icon set: each drawn as SVG at any radius, and paired with a
// one-column glyph and a colour for a `Text` on a `Button` beside the picture.

/** A Claude Code theme key for the glyph's `Text`. */

export const ICONS                             = {
  online: { glyph: '●', label: 'online', textColor: 'success', color: t => t.status.good },
  idle: { glyph: '◐', label: 'idle', textColor: 'merged', color: t => t.series.violet },
  offline: { glyph: '○', label: 'offline', textColor: 'subtle', color: t => t.muted },
  rising: { glyph: '▲', label: 'rising', textColor: 'suggestion', color: t => t.series.blue },
  falling: { glyph: '▼', label: 'falling', textColor: 'claude', color: t => t.series.orange },
  alert: { glyph: '⚑', label: 'alert', textColor: 'warning', color: t => t.status.warning },
  failed: { glyph: '✕', label: 'failed', textColor: 'error', color: t => t.status.critical },
}

export const ICON_NAMES = Object.keys(ICONS)              

/** The icon's shape as an SVG fragment of radius `r` centred on `(cx, cy)`. */
export function iconMark(name          , cx        , cy        , r        , theme       )         {
  const color = ICONS[name].color(theme)
  const sw = num(Math.max(1.5, r / 4.5))
  const stroke = `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`
  const p = (dx        , dy        ) => `${num(cx + dx * r)} ${num(cy + dy * r)}`
  const circle = (k        , paint        ) => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r * k)}" ${paint}/>`
  switch (name) {
    case 'online':
      return `<g class="icon-online">${circle(0.7, `fill="${color}"`)}</g>`
    case 'idle':
      return (
        `<g class="icon-idle"><path d="M${p(0, -0.7)}A${num(0.7 * r)} ${num(0.7 * r)} 0 0 0 ${p(0, 0.7)}Z" fill="${color}"/>` +
        `${circle(0.7, stroke)}</g>`
      )
    case 'offline':
      return `<g class="icon-offline">${circle(0.7, stroke)}</g>`
    case 'rising':
      return `<path class="icon-rising" d="M${p(0, -0.75)}L${p(0.8, 0.6)}L${p(-0.8, 0.6)}Z" fill="${color}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`
    case 'falling':
      return `<path class="icon-falling" d="M${p(0, 0.75)}L${p(0.8, -0.6)}L${p(-0.8, -0.6)}Z" fill="${color}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/>`
    case 'alert':
      return (
        `<g class="icon-alert"><path d="M${p(-0.5, 0.85)}L${p(-0.5, -0.85)}" ${stroke}/>` +
        `<path d="M${p(-0.5, -0.85)}L${p(0.75, -0.45)}L${p(-0.5, -0.05)}Z" fill="${color}" stroke="${color}" stroke-width="${sw}" stroke-linejoin="round"/></g>`
      )
    case 'failed':
      return `<path class="icon-failed" d="M${p(-0.6, -0.6)}L${p(0.6, 0.6)}M${p(0.6, -0.6)}L${p(-0.6, 0.6)}" ${stroke}/>`
  }
}

/** One icon as a picture; its twin is the glyph. */
export function icon(name          , options              = {})              {
  const theme = pickTheme(options.theme)
  const spec = ICONS[name]
  const r = Math.max(2, options.r ?? 8)
  const size = 2 * r + 4
  const label = options.label ?? spec.label
  const svg = svgDoc({
    width: size,
    height: size,
    background: options.background ? theme.surface : undefined,
    body: `<g><title>${esc(label)}</title>${iconMark(name, size / 2, size / 2, r, theme)}</g>`,
  })
  return {
    svg,
    alt: label,
    twin: spec.glyph,
    isInteractive: false,
    glyph: spec.glyph,
    color: spec.color(theme),
    textColor: spec.textColor,
  }
}

// ---- src/marks.ts
// Marker shapes for points and legend swatches, each with a surface ring.

/** The one-column glyph that stands for each shape in a twin. */
export const SHAPE_GLYPH                        = {
  circle: '●',
  diamond: '◆',
  square: '■',
  triangle: '▲',
}

/**
 * A filled `shape` of radius `r` at `(cx, cy)`; `ring` paints a 2px ring of
 * that colour around it, so it reads apart from a line it sits on.
 */
export function marker(shape       , cx        , cy        , r        , fill        , ring         , extra = '')         {
  const paint = `fill="${fill}"` + (ring === undefined ? '' : ` stroke="${ring}" stroke-width="4" paint-order="stroke"`) + extra
  switch (shape) {
    case 'circle':
      return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${paint}/>`
    case 'square': {
      const s = r * 0.9
      return `<rect x="${num(cx - s)}" y="${num(cy - s)}" width="${num(2 * s)}" height="${num(2 * s)}" rx="1" ${paint}/>`
    }
    case 'diamond': {
      const d = r * 1.25
      return `<path d="M${num(cx)} ${num(cy - d)}L${num(cx + d)} ${num(cy)}L${num(cx)} ${num(cy + d)}L${num(cx - d)} ${num(cy)}Z" ${paint}/>`
    }
    case 'triangle': {
      const t = r * 1.2
      return `<path d="M${num(cx)} ${num(cy - t)}L${num(cx + t)} ${num(cy + t * 0.8)}L${num(cx - t)} ${num(cy + t * 0.8)}Z" stroke-linejoin="round" ${paint}/>`
    }
  }
}

// ---- src/legend.ts
// Swatches with labels: inside another picture, as a picture of its own, or
// as a twin line.

const ROW = 18
const SWATCH = 14
const LABEL_SIZE = 11

function swatch(item            , x        , cy        , theme       )         {
  const mark = item.mark ?? 'line'
  const color = item.color ?? theme.ink2
  if (mark === 'line') {
    return `<path d="M${num(x)} ${num(cy)}H${num(x + SWATCH)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
  }
  if (typeof mark === 'object') return iconMark(mark.icon, x + SWATCH / 2, cy, 5.5, theme)
  return marker(mark, x + SWATCH / 2, cy, 4, color)
}

function glyph(item            )         {
  const mark = item.mark ?? 'line'
  if (mark === 'line') return '─'
  return typeof mark === 'object' ? ICONS[mark.icon].glyph : SHAPE_GLYPH[mark]
}

/**
 * The legend as a fragment laid out from `(x, y)` (the top left), wrapping at
 * `maxWidth`; with the height it took.
 */
export function legendMarkup(
  items                       ,
  x        ,
  y        ,
  maxWidth        ,
  theme       ,
)                                     {
  let cx = x
  let row = 0
  const parts           = []
  for (const item of items) {
    const w = SWATCH + 5 + textWidth(item.label, LABEL_SIZE)
    if (cx > x && cx + w > x + maxWidth) {
      cx = x
      row += 1
    }
    const cy = y + row * ROW + ROW / 2
    parts.push(swatch(item, cx, cy, theme), text(cx + SWATCH + 5, cy + 4, item.label, { size: LABEL_SIZE, fill: theme.ink2 }))
    cx += w + 14
  }
  return { markup: `<g class="legend">${parts.join('')}</g>`, height: items.length === 0 ? 0 : (row + 1) * ROW }
}

/** The legend's twin: `─ requests  ◆ deploy  ■ incident`. */
export function legendTwin(items                       )         {
  return items.map(item => `${glyph(item)} ${item.label}`).join('  ')
}

/** A legend as a picture of its own. */
export function legend(items                       , options                = {})          {
  const theme = pickTheme(options.theme)
  const width = options.width ?? 240
  const pad = 6
  const { markup, height } = legendMarkup(items, pad, pad, width - 2 * pad, theme)
  return {
    svg: svgDoc({
      width,
      height: height + 2 * pad,
      background: options.background === false ? undefined : theme.surface,
      body: markup,
    }),
    alt: `Legend: ${items.map(i => i.label).join(', ')}`,
    twin: legendTwin(items),
    isInteractive: false,
  }
}

// ---- src/meter.ts
// A horizontal track with a fill coloured by zone and an optional tick.

export const METER_PAD = 6
export const METER_TRACK = 8

/** The zone a value falls in: the first whose `upTo` it does not pass, else the last. */
export function zoneOf(value        , zones                 )                   {
  return zones.find(z => value <= z.upTo) ?? zones[zones.length - 1]
}

export function meter(data           , options               = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const width = options.width ?? 240
  const showText = options.showText ?? true
  const min = finite(data.min)
  const max = finite(data.max, min + 1)
  const value = finite(data.value, min)
  const status = data.zones && data.zones.length > 0 ? zoneOf(value, data.zones)?.status : data.status
  const word = status === undefined ? undefined : (data.statusWord ?? STATUS_WORD[status])
  const fill = status === undefined ? theme.series.blue : theme.status[status]

  const x0 = METER_PAD
  const trackW = width - 2 * METER_PAD
  const at = scale(min, max, 0, trackW)
  const top = showText ? 22 : METER_PAD + 3
  const height = top + METER_TRACK + METER_PAD + 3
  const parts           = []

  if (showText) {
    if (data.label !== undefined) parts.push(text(x0, 14, data.label, { size: 11, fill: theme.ink2 }))
    const figures = `${fmt(value)} / ${fmt(max)}${word === undefined ? '' : ` · ${word}`}`
    parts.push(text(x0 + trackW, 14, figures, { size: 11, fill: theme.ink, anchor: 'end', cls: 'meter-figures' }))
  }
  parts.push(
    `<rect class="meter-track" x="${num(x0)}" y="${num(top)}" width="${num(trackW)}" height="${METER_TRACK}" rx="4" fill="${theme.grid}"/>`,
  )
  const fillW = at(value)
  if (fillW > 0) {
    parts.push(
      `<rect class="meter-fill" x="${num(x0)}" y="${num(top)}" width="${num(fillW)}" height="${METER_TRACK}" rx="4" fill="${fill}"/>`,
    )
  }
  if (data.tick !== undefined && Number.isFinite(data.tick)) {
    const tx = x0 + at(data.tick)
    const d = `M${num(tx)} ${num(top - 3)}V${num(top + METER_TRACK + 3)}`
    parts.push(
      `<path d="${d}" stroke="${theme.surface}" stroke-width="6" stroke-linecap="round"/>`,
      `<path class="meter-tick" d="${d}" stroke="${theme.ink2}" stroke-width="2" stroke-linecap="round"/>`,
    )
  }

  const name = data.label ?? 'Meter'
  const alt = `${name}: ${fmt(value)} of ${fmt(max)}${word === undefined ? '' : `, ${word}`}` +
    (data.tick === undefined ? '' : `; mark at ${fmt(data.tick)}`)
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  const lead = data.label === undefined ? '' : `${data.label} `
  return {
    svg: assertBudget(svg),
    alt,
    twin: `${lead}${bar(value, max, { min, tick: data.tick })} ${fmt(value)} / ${fmt(max)}${word === undefined ? '' : ` ${word}`}`,
    isInteractive: false,
  }
}

// ---- src/sparkline.ts
// The last N values as a line, the latest point marked, an optional dashed
// reference line.

export const SPARK_PAD = { left: 4, right: 6, top: 5, bottom: 5 }

/** Where each of the values sits in a sparkline of this size and domain. */
export function sparkPoints(values                   , width        , height        , lo        , hi        )          {
  const x = scale(0, Math.max(1, values.length - 1), SPARK_PAD.left, width - SPARK_PAD.right)
  const y = hi === lo
    ? () => height / 2
    : scale(lo, hi, height - SPARK_PAD.bottom, SPARK_PAD.top)
  return values.map((v, i) => ({ x: values.length === 1 ? width - SPARK_PAD.right : x(i), y: y(v) }))
}

export function sparkline(values                   , options                   = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const width = options.width ?? 120
  const height = options.height ?? 32
  const color = options.color ?? theme.series.blue
  const recent = (options.last === undefined ? values : values.slice(-Math.max(1, options.last))).map(v => finite(v))
  // At most one point per pixel across: more cannot be seen and only costs markup.
  const shown = thin(recent.length, Math.max(2, width)).map(i => recent[i] ?? 0)
  const domain = options.reference === undefined ? shown : [...shown, options.reference]
  const range = extent(domain)
  const lo = options.min ?? (domain.length ? range.lo : 0)
  const hi = options.max ?? (domain.length ? range.hi : 1)
  const points = sparkPoints(shown, width, height, lo, hi)
  const parts           = []

  if (options.reference !== undefined && Number.isFinite(options.reference)) {
    const ry = hi === lo ? height / 2 : scale(lo, hi, height - SPARK_PAD.bottom, SPARK_PAD.top)(options.reference)
    parts.push(
      `<path class="spark-ref" d="M${SPARK_PAD.left} ${num(ry)}H${num(width - SPARK_PAD.right)}" stroke="${theme.muted}" stroke-width="1" stroke-dasharray="3 3"/>`,
    )
  }
  if (points.length > 1) {
    parts.push(
      `<path class="spark-line" d="${linePath(points)}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
    )
  }
  const latest = points[points.length - 1]
  if (latest) {
    parts.push(
      `<circle class="spark-latest" cx="${num(latest.x)}" cy="${num(latest.y)}" r="3" fill="${color}" stroke="${theme.surface}" stroke-width="4" paint-order="stroke"/>`,
    )
  }

  const name = options.label ?? 'Trend'
  const last = recent[recent.length - 1]
  const all = extent(recent)
  const alt = recent.length === 0
    ? `${name}: no values yet`
    : `${name}: ${recent.length} values from ${fmt(recent[0] ?? 0)} to ${fmt(last ?? 0)}, low ${fmt(all.lo)}, high ${fmt(all.hi)}` +
      (options.reference === undefined ? '' : `; reference ${fmt(options.reference)}`)
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  return {
    svg: assertBudget(svg),
    alt,
    twin: blocks(recent, { width: 24, min: options.min, max: options.max }),
    isInteractive: false,
  }
}

// ---- src/statTile.ts
// A label, a value, and a body slot that takes another picture's markup.

const PAD = 12
const BODY_TOP = 64

/** The `width` and `height` an `<svg>` document's root tag declares. */
export function svgSize(svg        )                                                {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0]
  const w = root && /\swidth="([\d.]+)"/.exec(root)?.[1]
  const h = root && /\sheight="([\d.]+)"/.exec(root)?.[1]
  return w && h ? { width: Number(w), height: Number(h) } : undefined
}

/** A whole `<svg>` placed at `(x, y)`, scaled down to `maxWidth` if wider. */
export function place(svg        , x        , y        , maxWidth        )                                     {
  const size = svgSize(svg) ?? { width: maxWidth, height: 24 }
  const k = size.width > maxWidth ? maxWidth / size.width : 1
  const w = size.width * k
  const h = size.height * k
  const markup = svg.replace(/^<svg\b[^>]*>/, root =>
    root
      .replace(/\swidth="[\d.]+"/, ` width="${num(w)}"`)
      .replace(/\sheight="[\d.]+"/, ` height="${num(h)}"`)
      .replace(/^<svg/, `<svg x="${num(x)}" y="${num(y)}"`),
  )
  return { markup, height: h }
}

export function statTile(data              , options                  = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const width = options.width ?? 200
  const value = typeof data.value === 'number' ? fmt(data.value) : data.value
  const word = data.status === undefined ? undefined : (data.statusWord ?? STATUS_WORD[data.status])
  const parts           = [text(PAD, 22, data.label, { size: 11, fill: theme.ink2, cls: 'tile-label' })]

  parts.push(text(PAD, 50, value, { size: 24, fill: theme.ink, weight: 600, cls: 'tile-value' }))
  if (data.unit !== undefined) {
    // Bold figures run wider than the estimate for regular text.
    parts.push(text(PAD + textWidth(value, 24) * 1.12 + 6, 50, data.unit, { size: 12, fill: theme.muted }))
  }
  if (data.status !== undefined && word !== undefined) {
    const wx = width - PAD - textWidth(word, 11)
    parts.push(
      `<circle class="tile-dot" cx="${num(wx - 8)}" cy="18" r="4" fill="${theme.status[data.status]}"/>`,
      text(wx, 22, word, { size: 11, fill: theme.ink2 }),
    )
  }

  let bodyHeight = 0
  const body = data.body
  const markup = body === undefined ? undefined : typeof body === 'string' ? body : body.svg
  if (markup !== undefined) {
    if (markup.startsWith('<svg')) {
      const placed = place(markup, PAD, BODY_TOP, width - 2 * PAD)
      parts.push(`<g class="tile-body">${placed.markup}</g>`)
      bodyHeight = placed.height
    } else {
      bodyHeight = options.bodyHeight ?? 24
      parts.push(`<g class="tile-body" transform="translate(${PAD} ${BODY_TOP})">${markup}</g>`)
    }
  }
  const height = body === undefined ? BODY_TOP : BODY_TOP + bodyHeight + PAD

  const bodyPicture = typeof body === 'object' ? body : undefined
  const head = `${data.label}: ${value}${data.unit === undefined ? '' : ` ${data.unit}`}${word === undefined ? '' : `, ${word}`}`
  const alt = bodyPicture === undefined ? head : `${head}. ${bodyPicture.alt}`
  const lead = `${data.label} ${value}${data.unit === undefined ? '' : ` ${data.unit}`}${word === undefined ? '' : ` ${word}`}`
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  return {
    svg: assertBudget(svg),
    alt,
    twin: bodyPicture === undefined || bodyPicture.twin === '' ? lead : `${lead}  ${bodyPicture.twin}`,
    isInteractive: bodyPicture?.isInteractive ?? false,
  }
}

/** A row of icons (one per host, per job...), for a tile's body; its twin is the glyphs. */
export function dotRow(names                     , options                = {})          {
  const theme = pickTheme(options.theme)
  const r = options.r ?? 6
  const gap = options.gap ?? 4
  const cell = 2 * r + gap
  const width = Math.max(cell, names.length * cell + gap)
  const height = 2 * r + 2 * gap
  const marks = names.map(
    (name, i) => `<g><title>${esc(ICONS[name].label)}</title>${iconMark(name, gap + r + i * cell, gap + r, r, theme)}</g>`,
  )
  const counts = new Map                  ()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return {
    svg: assertBudget(
      svgDoc({
        width,
        height,
        background: options.background === false ? undefined : theme.surface,
        body: marks.join(''),
      }),
    ),
    alt: names.length === 0 ? 'none' : [...counts].map(([name, c]) => `${c} ${ICONS[name].label}`).join(', '),
    twin: names.map(name => ICONS[name].glyph).join(''),
    isInteractive: false,
  }
}

// ---- src/statusGrid.ts
// A grid of tiles, one per thing watched (a host, a service, a job): a status
// dot, its name, and its figure or the status's word under it.

/** The one-column glyph each status stands for in a twin: a shape as well as a colour. */
export const STATUS_GLYPH                         = { good: '●', warning: '▲', serious: '◆', critical: '✕' }

const GRID_PAD = 6

/** A label cut to `room` pixels at this size, with `…` where it was cut. */
export function fitLabel(label        , room        , size        )         {
  const chars = [...label]
  if (textWidth(label, size) <= room) return label
  const keep = Math.max(1, Math.floor(room / (size * 0.58)) - 1)
  return `${chars.slice(0, keep).join('')}…`
}

export function statusGrid(items                       , options                    = {})          {
  const theme = pickTheme(options.theme)
  const tile = options.tile ?? { width: 84, height: 44 }
  const gap = options.gap ?? 6
  const fit = Math.max(1, Math.floor(((options.width ?? 6 * (tile.width + gap) + 2 * GRID_PAD - gap) - 2 * GRID_PAD + gap) / (tile.width + gap)))
  const columns = Math.max(1, Math.min(items.length || 1, options.columns ?? Math.min(6, fit)))
  const rows = Math.ceil(items.length / columns)
  const width = 2 * GRID_PAD + columns * (tile.width + gap) - gap
  const height = 2 * GRID_PAD + Math.max(1, rows) * (tile.height + gap) - gap
  const room = tile.width - 28
  const parts = items.map((item, i) => {
    const x = GRID_PAD + (i % columns) * (tile.width + gap)
    const y = GRID_PAD + Math.floor(i / columns) * (tile.height + gap)
    const line = item.value ?? STATUS_WORD[item.status]
    return (
      `<g class="status-tile" data-status="${item.status}">` +
      `<rect x="${num(x)}" y="${num(y)}" width="${tile.width}" height="${tile.height}" rx="6" fill="${theme.grid}"/>` +
      `<circle class="status-dot" cx="${num(x + 12)}" cy="${num(y + 14)}" r="4" fill="${theme.status[item.status]}"/>` +
      text(x + 22, y + 18, fitLabel(item.label, room, 11), { size: 11, fill: theme.ink, cls: 'status-label' }) +
      text(x + 22, y + 33, fitLabel(line, room, 10), { size: 10, fill: theme.muted, cls: 'status-value' }) +
      '</g>'
    )
  })

  const counts = (['good', 'warning', 'serious', 'critical']         )
    .map(s => [s, items.filter(item => item.status === s)]         )
    .filter(([, list]) => list.length > 0)
  const name = options.label ?? 'Status'
  const worst = [...counts].reverse().find(([s]) => s !== 'good')
  const alt = items.length === 0
    ? `${name}: nothing to watch yet`
    : `${name}: ${items.length} ${items.length === 1 ? 'item' : 'items'}, ` + counts.map(([s, list]) => `${list.length} ${STATUS_WORD[s]}`).join(', ') +
      (worst === undefined ? '' : `; ${STATUS_WORD[worst[0]]}: ${worst[1].map(item => item.label).join(', ')}`)
  const svg = svgDoc({
    width,
    height,
    title: alt,
    background: options.background === false ? undefined : theme.surface,
    body: parts.join(''),
  })
  return {
    svg: assertBudget(svg),
    alt,
    twin: items.map(item => `${STATUS_GLYPH[item.status]} ${item.label}`).join('  '),
    isInteractive: false,
  }
}

// ---- src/timeline.ts
// Values per step with event markers, a dashed threshold rule, a flag on the
// latest point, a legend and a CSS hover per step. Interactive.

const SHAPES          = ['diamond', 'square', 'triangle', 'circle']

const STYLE =
  '.tl-cross,.tl-dot,.tl-tip{visibility:hidden;pointer-events:none}' +
  '.tl-pt:hover .tl-cross,.tl-pt:hover .tl-dot,.tl-pt:hover .tl-tip{visibility:visible}' +
  '.tl-pt:hover .tl-hit{fill:currentColor;fill-opacity:.06}'

function resolveKinds(events                          , given                          , theme       )                            {
  const colors = [theme.series.orange, theme.series.aqua, theme.ink2, theme.muted]
  const kinds = new Map                      ()
  for (const { kind } of events) {
    if (kinds.has(kind)) continue
    const n = kinds.size
    const spec = given?.[kind]
    kinds.set(kind, {
      label: spec?.label ?? kind,
      shape: spec?.shape ?? SHAPES[n % SHAPES.length] ?? 'circle',
      color: spec?.color ?? colors[n % colors.length] ?? theme.ink2,
    })
  }
  return kinds
}

/** The twin's second line: each event kind with its glyph, count and steps. */
function eventsLine(events                          , kinds                           , stepName                       )         {
  if (events.length === 0) return 'no events'
  return [...kinds.entries()]
    .map(([kind, spec]) => {
      const steps = events.filter(e => e.kind === kind).map(e => e.step)
      const shown = steps.length > 4 ? [...steps.slice(0, 2), '…', ...steps.slice(-2)] : steps
      const at = shown.map(s => (typeof s === 'number' ? stepName(s) : s)).join(', ')
      return `${SHAPE_GLYPH[spec.shape]} ${spec.label} ×${steps.length} (${at})`
    })
    .join(' · ')
}

export function timeline(data              , options                  = {})          {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const stepName = options.stepName ?? ((s        ) => `step ${s + 1}`)
  const seriesLabel = options.seriesLabel ?? 'value'
  const values = data.values.map(v => finite(v))
  const n = values.length
  const events = (data.events ?? []).filter(e => Number.isInteger(e.step) && e.step >= 0 && e.step < n)
  const kinds = resolveKinds(events, options.kinds, theme)

  const threshold = data.threshold !== undefined && Number.isFinite(data.threshold) ? data.threshold : undefined
  const high = extent(values).hi
  const top = options.max ?? niceMax(Math.max(1, high, threshold ?? 0) * 1.04)
  const last = values[n - 1]

  let maxPoints = Math.max(2, options.maxPoints ?? 240)
  for (;;) {
    const svg = draw(maxPoints)
    if (svg.length <= SVG_BUDGET || maxPoints <= 2) {
      const counts = [...kinds.entries()].map(([kind, k]) => `${events.filter(e => e.kind === kind).length} ${k.label}`)
      const alt =
        n === 0
          ? `${seriesLabel}: no values yet`
          : `${seriesLabel} over ${n} steps: latest ${fmt(last ?? 0)}, high ${fmt(high)}` +
            (threshold === undefined ? '' : `; threshold ${data.thresholdLabel ?? fmt(threshold)}`) +
            (counts.length === 0 ? '' : `; events: ${counts.join(', ')}`)
      return {
        svg: assertBudget(svg),
        alt,
        twin: `${blocks(values, { width: 24 })}${last === undefined ? '' : ` ${fmt(last)}`}\n${eventsLine(events, kinds, stepName)}`,
        isInteractive: true,
      }
    }
    maxPoints = Math.max(2, Math.floor(maxPoints / 2))
  }

  function draw(limit        )         {
    const width = options.width ?? 480
    const legendItems               = [
      { label: seriesLabel, color: theme.series.blue, mark: 'line' },
      ...[...kinds.values()].map(k => ({ label: k.label, color: k.color, mark: k.shape })),
    ]
    const left = 8 + Math.max(textWidth(fmt(top), 10), textWidth(fmt(0), 10)) + 6
    const right = width - 52
    const legendBox = legendItems.length >= 2 ? legendMarkup(legendItems, left, 6, right - left + 40, theme) : undefined
    const plotTop = (legendBox ? 6 + legendBox.height : 0) + 14
    const height = options.height ?? plotTop + 136
    const bottom = height - 24
    const x = n <= 1 ? () => right : scale(0, n - 1, left, right)
    const y = scale(0, top, bottom, plotTop)
    const parts           = []
    if (legendBox) parts.push(legendBox.markup)

    // One y-axis: three recessive gridlines, the zero line as the baseline.
    for (const v of [top, top / 2]) {
      parts.push(`<path d="M${num(left)} ${num(y(v))}H${num(right)}" stroke="${theme.grid}" stroke-width="1"/>`)
    }
    parts.push(`<path class="tl-baseline" d="M${num(left)} ${num(bottom)}H${num(right)}" stroke="${theme.baseline}" stroke-width="1"/>`)
    for (const v of [0, top / 2, top]) {
      parts.push(text(left - 6, y(v) + 3.5, fmt(v), { size: 10, fill: theme.muted, anchor: 'end' }))
    }
    if (n > 0) {
      parts.push(text(left, bottom + 16, stepName(0), { size: 10, fill: theme.muted }))
      if (n > 1) parts.push(text(right, bottom + 16, stepName(n - 1), { size: 10, fill: theme.muted, anchor: 'end' }))
    }

    if (threshold !== undefined) {
      const ty = y(threshold)
      parts.push(
        `<path class="tl-threshold" d="M${num(left)} ${num(ty)}H${num(right)}" stroke="${theme.status.warning}" stroke-width="1.5" stroke-dasharray="5 4"/>`,
        text(right, ty - 5, data.thresholdLabel ?? `threshold ${fmt(threshold)}`, { size: 10, fill: theme.ink2, anchor: 'end' }),
      )
    }

    // The line keeps at most two points per pixel; the hover targets fewer.
    const lineSteps = thin(n, Math.max(2, (right - left) * 2))
    if (lineSteps.length > 1) {
      const d = linePath(lineSteps.map(i => ({ x: x(i), y: y(values[i] ?? 0) })))
      parts.push(
        `<path class="tl-line" d="${d}" fill="none" stroke="${theme.series.blue}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
      )
    }

    const byStep = new Map                         ()
    for (const e of events) byStep.set(e.step, [...(byStep.get(e.step) ?? []), e])
    const eventSteps = [...byStep.keys()].sort((a, b) => a - b).slice(-limit)
    const steps = thin(n, limit, [...eventSteps, n - 1])

    steps.forEach((step, k) => {
      const px = x(step)
      const py = y(values[step] ?? 0)
      const prev = steps[k - 1]
      const next = steps[k + 1]
      const x0 = prev === undefined ? left - 4 : (x(prev) + px) / 2
      const x1 = next === undefined ? right + 4 : (x(next) + px) / 2
      const here = byStep.get(step) ?? []
      const lines = [`${stepName(step)} · ${fmt(values[step] ?? 0)}`, ...here.map(e => {
        const spec = kinds.get(e.kind)
        return spec ? `${SHAPE_GLYPH[spec.shape]} ${spec.label}` : e.kind
      })]
      const tipW = Math.max(...lines.map(l => textWidth(l, 11))) + 14
      const tipH = 8 + lines.length * 15
      const tipX = px > (left + right) / 2 ? px - tipW - 8 : px + 8
      const tipY = plotTop
      const marks = here.map(e => {
        const spec = kinds.get(e.kind)
        if (!spec) return ''
        return `<g class="tl-event"><title>${esc(`${spec.label} at ${stepName(step)}`)}</title>${marker(spec.shape, px, py, 4.5, spec.color, theme.surface)}</g>`
      })
      parts.push(
        `<g class="tl-pt" data-step="${step}" color="${theme.ink}"><title>${esc(lines.join(', '))}</title>` +
          `<rect class="tl-hit" x="${num(x0)}" y="${num(plotTop)}" width="${num(Math.max(1, x1 - x0))}" height="${num(bottom - plotTop)}" fill="transparent"/>` +
          `<path class="tl-cross" d="M${num(px)} ${num(plotTop)}V${num(bottom)}" stroke="${theme.muted}" stroke-width="1"/>` +
          `<circle class="tl-dot" cx="${num(px)}" cy="${num(py)}" r="4" fill="${theme.series.blue}" stroke="${theme.surface}" stroke-width="4" paint-order="stroke"/>` +
          marks.join('') +
          `<g class="tl-tip"><rect x="${num(tipX)}" y="${num(tipY)}" width="${num(tipW)}" height="${num(tipH)}" rx="4" fill="${theme.surface}" stroke="${theme.baseline}"/>` +
          lines.map((l, i) => text(tipX + 7, tipY + 16 + i * 15, l, { size: 11, fill: i === 0 ? theme.ink : theme.ink2 })).join('') +
          '</g></g>',
      )
    })

    // The flag: the one direct label, on the latest value.
    if (last !== undefined) {
      const fx = x(n - 1)
      const fy = y(last)
      const label = fmt(last)
      const w = textWidth(label, 11) + 12
      parts.push(
        `<g class="tl-flag" pointer-events="none"><circle cx="${num(fx)}" cy="${num(fy)}" r="3.5" fill="${theme.series.blue}" stroke="${theme.surface}" stroke-width="4" paint-order="stroke"/>` +
          `<rect x="${num(fx + 8)}" y="${num(fy - 9)}" width="${num(w)}" height="18" rx="9" fill="${theme.surface}" stroke="${theme.series.blue}" stroke-width="1.5"/>` +
          text(fx + 14, fy + 4, label, { size: 11, fill: theme.ink, weight: 600, cls: 'tl-flag-label' }) +
          '</g>',
      )
    }

    return svgDoc({
      width,
      height,
      style: STYLE,
      background: options.background === false ? undefined : theme.surface,
      body: parts.join(''),
    })
  }
}
