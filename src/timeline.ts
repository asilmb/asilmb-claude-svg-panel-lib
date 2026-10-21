// Values per step with event markers, a dashed threshold rule, a flag on the
// latest point, a legend and a CSS hover per step. Interactive.

import { abbreviate, assertBudget, esc, extent, finite, num, svgDoc, SVG_BUDGET, text, textWidth, type Picture } from './core.ts'
import { linePath, niceMax, scale } from './geom.ts'
import { legendMarkup, type LegendItem } from './legend.ts'
import { marker, SHAPE_GLYPH, type Shape } from './marks.ts'
import { blocks, thin } from './twin.ts'
import { pickTheme, type Theme } from './theme.ts'

export type TimelineEvent = { step: number; kind: string }

export type TimelineData = {
  /** One value per step, oldest first; a step is its index. */
  values: readonly number[]
  events?: readonly TimelineEvent[]
  threshold?: number
  thresholdLabel?: string
}

export type EventKind = { label: string; shape?: Shape; color?: string }

export type TimelineOptions = {
  theme?: Theme | 'dark' | 'light'
  width?: number
  height?: number
  /** How each event kind is named and drawn; unnamed kinds take the next shape and colour. */
  kinds?: Readonly<Record<string, EventKind>>
  /** What the line is, for the legend and the alt text. */
  seriesLabel?: string
  /** A step's name in tooltips and the twin; `step 1`, `step 2`... by default. */
  stepName?: (step: number) => string
  format?: (value: number) => string
  /** The axis top; a tidy figure over the data and the threshold by default. */
  max?: number
  /** The most steps that get their own hover target; thinned below it to fit the budget. */
  maxPoints?: number
  background?: boolean
}

const SHAPES: Shape[] = ['diamond', 'square', 'triangle', 'circle']

const STYLE =
  '.tl-cross,.tl-dot,.tl-tip{visibility:hidden;pointer-events:none}' +
  '.tl-pt:hover .tl-cross,.tl-pt:hover .tl-dot,.tl-pt:hover .tl-tip{visibility:visible}' +
  '.tl-pt:hover .tl-hit{fill:currentColor;fill-opacity:.06}'

type ResolvedKind = Required<EventKind>

function resolveKinds(events: readonly TimelineEvent[], given: TimelineOptions['kinds'], theme: Theme): Map<string, ResolvedKind> {
  const colors = [theme.series.orange, theme.series.aqua, theme.ink2, theme.muted]
  const kinds = new Map<string, ResolvedKind>()
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
function eventsLine(events: readonly TimelineEvent[], kinds: Map<string, ResolvedKind>, stepName: (s: number) => string): string {
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

export function timeline(data: TimelineData, options: TimelineOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const stepName = options.stepName ?? ((s: number) => `step ${s + 1}`)
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

  function draw(limit: number): string {
    const width = options.width ?? 480
    const legendItems: LegendItem[] = [
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
    const parts: string[] = []
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

    const byStep = new Map<number, TimelineEvent[]>()
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
