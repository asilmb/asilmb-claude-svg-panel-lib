// Copied from svg-panel's src/gauge.ts by scripts/build.mjs: edit src/, then rebuild.

// A 240° arc over a scale, a threshold tick, the value as the hero figure and
// a status dot with its word.

import { abbreviate, assertBudget, finite, num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { arcPath, polar, scale } from './geom.ts'
import { bar } from './twin.ts'
import { pickTheme, STATUS_WORD, type Status, type Theme } from './theme.ts'

export type GaugeData = {
  value: number
  max: number
  min?: number
  /** Where the tick goes, as a value on the same scale. */
  threshold?: number
  /** The tick's label; the threshold's figure by default. */
  thresholdLabel?: string
  /** What is measured (`Throughput`); leads the alt text and the twin. */
  label?: string
  /** Derived when absent: critical at max, warning past the threshold, good below. */
  status?: Status
  /** The word beside the status dot; the status's own word by default. */
  statusWord?: string
}

export type GaugeOptions = {
  theme?: Theme | 'dark' | 'light'
  format?: (value: number) => string
  background?: boolean
}

export const GAUGE_SWEEP = 240
export const GAUGE_SIZE = { width: 232, height: 176 }
/** The arc's centre and radius in the picture's own pixels. */
export const GAUGE_ARC = { cx: 116, cy: 96, r: 72 }

/** The status a gauge or meter shows when none is given. */
export function statusOf(value: number, max: number, threshold?: number): Status {
  if (value >= max) return 'critical'
  if (threshold !== undefined && value >= threshold) return 'warning'
  return 'good'
}

/** The angle (degrees clockwise from twelve) a value sits at on the gauge. */
export function gaugeAngle(value: number, min: number, max: number): number {
  return scale(min, max, -GAUGE_SWEEP / 2, GAUGE_SWEEP / 2)(value)
}

export function gauge(data: GaugeData, options: GaugeOptions = {}): Picture {
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
  const parts: string[] = []

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
