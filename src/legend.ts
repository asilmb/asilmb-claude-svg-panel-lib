// Swatches with labels: inside another picture, as a picture of its own, or
// as a twin line.

import { num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { ICONS, iconMark, type IconName } from './icon.ts'
import { marker, SHAPE_GLYPH, type Shape } from './marks.ts'
import { pickTheme, type Theme } from './theme.ts'

export type LegendItem = {
  label: string
  /** The swatch's colour; an icon brings its own. */
  color?: string
  /** `line` for a series; a shape for an event kind; or an icon by name. */
  mark?: 'line' | Shape | { icon: IconName }
}

const ROW = 18
const SWATCH = 14
const LABEL_SIZE = 11

function swatch(item: LegendItem, x: number, cy: number, theme: Theme): string {
  const mark = item.mark ?? 'line'
  const color = item.color ?? theme.ink2
  if (mark === 'line') {
    return `<path d="M${num(x)} ${num(cy)}H${num(x + SWATCH)}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`
  }
  if (typeof mark === 'object') return iconMark(mark.icon, x + SWATCH / 2, cy, 5.5, theme)
  return marker(mark, x + SWATCH / 2, cy, 4, color)
}

function glyph(item: LegendItem): string {
  const mark = item.mark ?? 'line'
  if (mark === 'line') return '─'
  return typeof mark === 'object' ? ICONS[mark.icon].glyph : SHAPE_GLYPH[mark]
}

/**
 * The legend as a fragment laid out from `(x, y)` (the top left), wrapping at
 * `maxWidth`; with the height it took.
 */
export function legendMarkup(
  items: readonly LegendItem[],
  x: number,
  y: number,
  maxWidth: number,
  theme: Theme,
): { markup: string; height: number } {
  let cx = x
  let row = 0
  const parts: string[] = []
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
export function legendTwin(items: readonly LegendItem[]): string {
  return items.map(item => `${glyph(item)} ${item.label}`).join('  ')
}

export type LegendOptions = {
  theme?: Theme | 'dark' | 'light'
  width?: number
  background?: boolean
}

/** A legend as a picture of its own. */
export function legend(items: readonly LegendItem[], options: LegendOptions = {}): Picture {
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
