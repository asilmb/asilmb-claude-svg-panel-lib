// Copied from svg-panel's src/bars.ts by scripts/build.mjs: edit src/, then rebuild.

// One column per item over a baseline, each labelled under it and its figure
// over it, with an optional dashed threshold the columns past it turn warning at.

import { abbreviate, assertBudget, extent, finite, num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { niceMax, scale } from './geom.ts'
import { blocks } from './twin.ts'
import { pickTheme, type Status, type Theme } from './theme.ts'

export type BarItem = {
  label: string
  value: number
  /** Colours the column; past the threshold it is `warning` by default, else the theme's blue. */
  status?: Status
}

export type BarsOptions = {
  theme?: Theme | 'dark' | 'light'
  width?: number
  height?: number
  /** A dashed rule at this value; a column at or past it takes the warning colour. */
  threshold?: number
  /** The scale's top; a tidy figure over the data and the threshold by default. */
  max?: number
  /** What the columns are, for the alt text and the twin. */
  label?: string
  format?: (value: number) => string
  background?: boolean
}

export const BARS_PAD = { left: 8, right: 8, top: 20, bottom: 22 }

/** Where each column stands: its left edge, its width and its top, in a chart of this size and scale. */
export function barLayout(count: number, width: number, height: number, top: number): { slot: number; bar: number; x: (i: number) => number; y: (v: number) => number } {
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

export function bars(items: readonly BarItem[], options: BarsOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const width = options.width ?? 240
  const height = options.height ?? 140
  const values = items.map(item => Math.max(0, finite(item.value)))
  const threshold = options.threshold !== undefined && Number.isFinite(options.threshold) ? options.threshold : undefined
  const top = options.max ?? niceMax(Math.max(1, extent(values).hi, threshold ?? 0))
  const { slot, bar, x, y } = barLayout(items.length, width, height, top)
  const base = height - BARS_PAD.bottom
  const parts: string[] = []
  // Words go last, over the columns and the rules.
  const words: string[] = []

  items.forEach((item, i) => {
    const v = values[i]!
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
  const listed = items.slice(0, 12).map((item, i) => `${item.label} ${fmt(values[i]!)}`)
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
    twin: items.length === 0 ? `${lead}no values` : `${lead}${blocks(values, { min: 0, max: top })} high ${items[high]!.label} ${fmt(values[high]!)}`,
    isInteractive: false,
  }
}
