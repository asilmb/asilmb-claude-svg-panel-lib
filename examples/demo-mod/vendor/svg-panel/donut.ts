// Copied from svg-panel's src/donut.ts by scripts/build.mjs: edit src/, then rebuild.

// A ring cut into shares, the total in its middle and a legend of shares
// beside it. Past `maxSlices` the smallest shares fold into one `other`.

import { abbreviate, assertBudget, finite, num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { arcPath } from './geom.ts'
import { pickTheme, type Theme } from './theme.ts'

export type Slice = { label: string; value: number; color?: string }

export type DonutOptions = {
  theme?: Theme | 'dark' | 'light'
  /** The figure in the ring's middle; the total by default. */
  center?: string
  /** What the ring shares out, for the alt text and the twin. */
  label?: string
  /** The most shares drawn apart; the rest fold into `other`. 5 by default. */
  maxSlices?: number
  /** Draw the legend beside the ring. */
  legend?: boolean
  format?: (value: number) => string
  background?: boolean
}

/** The ring's centre, radius and width in the picture's own pixels. */
export const DONUT_RING = { cx: 72, cy: 72, r: 50, width: 18 }
/** The gap between two shares, in degrees, so each reads apart. */
export const DONUT_GAP = 2

type Share = { label: string; value: number; color: string }

/** The shares to draw: positive values only, the largest `max - 1` apart and the rest as `other` when there are more than `max`. */
export function donutShares(slices: readonly Slice[], max: number, theme: Theme): Share[] {
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

export function donut(slices: readonly Slice[], options: DonutOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const shares = donutShares(slices, options.maxSlices ?? 5, theme)
  const total = shares.reduce((sum, s) => sum + s.value, 0)
  const pct = (v: number) => (total === 0 ? 0 : Math.round((v / total) * 100))
  const { cx, cy, r, width: ring } = DONUT_RING
  const showLegend = options.legend ?? true
  const rows = shares.map(s => `${s.label} ${pct(s.value)}%`)
  const legendX = cx + r + ring / 2 + 16
  const width = showLegend && shares.length > 0
    ? Math.max(232, Math.ceil(legendX + 16 + Math.max(...rows.map(row => textWidth(row, 11))) + 8))
    : 2 * cx
  const height = Math.max(2 * cy, 20 + shares.length * 20)
  const parts: string[] = []

  if (total === 0) {
    parts.push(`<circle class="donut-track" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${theme.grid}" stroke-width="${ring}"/>`)
  } else if (shares.length === 1) {
    parts.push(`<circle class="donut-slice" cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${shares[0]!.color}" stroke-width="${ring}"/>`)
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
        text(legendX + 16, ry + 4, rows[i]!, { size: 11, fill: theme.ink2, cls: 'donut-row' }),
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
