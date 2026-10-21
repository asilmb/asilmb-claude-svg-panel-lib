// Copied from svg-panel's src/sparkline.ts by scripts/build.mjs: edit src/, then rebuild.

// The last N values as a line, the latest point marked, an optional dashed
// reference line.

import { abbreviate, assertBudget, extent, finite, num, svgDoc, type Picture } from './core.ts'
import { linePath, scale, type Point } from './geom.ts'
import { blocks, thin } from './twin.ts'
import { pickTheme, type Theme } from './theme.ts'

export type SparklineOptions = {
  theme?: Theme | 'dark' | 'light'
  width?: number
  height?: number
  /** Draw only the last `last` values. */
  last?: number
  /** A dashed rule at this value (a limit, a mean). */
  reference?: number
  /** The line's colour; the theme's blue by default. */
  color?: string
  /** The scale's ends; the data's (and the reference's) by default. */
  min?: number
  max?: number
  /** What the values are, for the alt text. */
  label?: string
  format?: (value: number) => string
  background?: boolean
}

export const SPARK_PAD = { left: 4, right: 6, top: 5, bottom: 5 }

/** Where each of the values sits in a sparkline of this size and domain. */
export function sparkPoints(values: readonly number[], width: number, height: number, lo: number, hi: number): Point[] {
  const x = scale(0, Math.max(1, values.length - 1), SPARK_PAD.left, width - SPARK_PAD.right)
  const y = hi === lo
    ? () => height / 2
    : scale(lo, hi, height - SPARK_PAD.bottom, SPARK_PAD.top)
  return values.map((v, i) => ({ x: values.length === 1 ? width - SPARK_PAD.right : x(i), y: y(v) }))
}

export function sparkline(values: readonly number[], options: SparklineOptions = {}): Picture {
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
  const parts: string[] = []

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
