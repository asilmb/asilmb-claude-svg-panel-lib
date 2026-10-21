// A horizontal track with a fill coloured by zone and an optional tick.

import { abbreviate, assertBudget, finite, num, svgDoc, text, type Picture } from './core.ts'
import { scale } from './geom.ts'
import { bar } from './twin.ts'
import { pickTheme, STATUS_WORD, type Status, type Theme } from './theme.ts'

export type Zone = { upTo: number; status: Status }

export type MeterData = {
  value: number
  max: number
  min?: number
  /** A mark on the track, as a value on the same scale. */
  tick?: number
  label?: string
  /** Zones in rising order: the fill takes the first zone the value is within. */
  zones?: readonly Zone[]
  /** A status for the fill when there are no zones. */
  status?: Status
  statusWord?: string
}

export type MeterOptions = {
  theme?: Theme | 'dark' | 'light'
  width?: number
  /** Draw the label and the figures above the track; off for a bare track. */
  showText?: boolean
  format?: (value: number) => string
  background?: boolean
}

export const METER_PAD = 6
export const METER_TRACK = 8

/** The zone a value falls in: the first whose `upTo` it does not pass, else the last. */
export function zoneOf(value: number, zones: readonly Zone[]): Zone | undefined {
  return zones.find(z => value <= z.upTo) ?? zones[zones.length - 1]
}

export function meter(data: MeterData, options: MeterOptions = {}): Picture {
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
  const parts: string[] = []

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
