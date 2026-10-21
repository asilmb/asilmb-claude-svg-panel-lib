// Copied from svg-panel's src/icon.ts by scripts/build.mjs: edit src/, then rebuild.

// The named icon set: each drawn as SVG at any radius, and paired with a
// one-column glyph and a colour for a `Text` on a `Button` beside the picture.

import { esc, num, svgDoc, type Picture } from './core.ts'
import { pickTheme, type Theme } from './theme.ts'

export type IconName = 'online' | 'idle' | 'offline' | 'rising' | 'falling' | 'alert' | 'failed'

/** A Claude Code theme key for the glyph's `Text`. */
export type IconTextColor = 'success' | 'merged' | 'subtle' | 'suggestion' | 'claude' | 'warning' | 'error'

type IconSpec = {
  glyph: string
  label: string
  textColor: IconTextColor
  color: (theme: Theme) => string
}

export const ICONS: Record<IconName, IconSpec> = {
  online: { glyph: '●', label: 'online', textColor: 'success', color: t => t.status.good },
  idle: { glyph: '◐', label: 'idle', textColor: 'merged', color: t => t.series.violet },
  offline: { glyph: '○', label: 'offline', textColor: 'subtle', color: t => t.muted },
  rising: { glyph: '▲', label: 'rising', textColor: 'suggestion', color: t => t.series.blue },
  falling: { glyph: '▼', label: 'falling', textColor: 'claude', color: t => t.series.orange },
  alert: { glyph: '⚑', label: 'alert', textColor: 'warning', color: t => t.status.warning },
  failed: { glyph: '✕', label: 'failed', textColor: 'error', color: t => t.status.critical },
}

export const ICON_NAMES = Object.keys(ICONS) as IconName[]

/** The icon's shape as an SVG fragment of radius `r` centred on `(cx, cy)`. */
export function iconMark(name: IconName, cx: number, cy: number, r: number, theme: Theme): string {
  const color = ICONS[name].color(theme)
  const sw = num(Math.max(1.5, r / 4.5))
  const stroke = `fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"`
  const p = (dx: number, dy: number) => `${num(cx + dx * r)} ${num(cy + dy * r)}`
  const circle = (k: number, paint: string) => `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r * k)}" ${paint}/>`
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

export type IconOptions = {
  theme?: Theme | 'dark' | 'light'
  /** The icon's radius in CSS pixels; the picture is `2r + 4` square. */
  r?: number
  /** What the icon means here, for `alt` and the tooltip; the icon's name by default. */
  label?: string
  /** Paint the theme surface behind the icon. */
  background?: boolean
}

export type IconPicture = Picture & {
  glyph: string
  /** The hex the picture paints the icon in. */
  color: string
  /** The theme key for a `Text` holding the glyph. */
  textColor: IconTextColor
}

/** One icon as a picture; its twin is the glyph. */
export function icon(name: IconName, options: IconOptions = {}): IconPicture {
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
