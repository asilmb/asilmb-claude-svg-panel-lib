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
