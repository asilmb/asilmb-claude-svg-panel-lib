// A small service watched from a pane: its state, the events that change it
// and the pictures drawn from it, as Svg markup for the apps and as Raster
// cells for the terminal. Pure, so the mod and demo/index.html run the same
// code, and the page's simulator sends the events the mod's buttons and timer
// send.

import type { DemoHost, DemoMarker, DemoSample, DemoState } from '../types'
import {
  bars,
  donut,
  dotRow,
  gauge,
  heatmap,
  icon,
  ICON_NAMES,
  ICONS,
  legend,
  meter,
  PIXELS_MAX,
  sparkline,
  STATUS_TEXT_COLOR,
  statTile,
  statusGrid,
  statusOf,
  themes,
  terminalView,
  timeline,
  toRaster,
  zoneOf,
  type IconName,
  type IconPicture,
  type Picture,
  type RasterPicture,
  type Status,
  type TerminalEnv,
  type TerminalView,
  type Theme,
  type Zone,
} from '../vendor/svg-panel/index.ts'

export type DemoEvent =
  /** A new measurement: the live timer's tick, or the `+ sample` button. */
  | { event: 'measure'; sample: DemoSample }
  /** A marker on the chart: a deploy warms up, an incident slows things down. */
  | { event: 'marker'; kind: DemoMarker }
  /** One host changes state. */
  | { event: 'status'; host: number; status: DemoHost }
  | { event: 'reset' }

/** Samples kept; older ones fall off the left. */
export const MAX_SAMPLES = 240
/** The requests per second the service is built for, and where the redline starts. */
export const CAPACITY = 2000
export const REDLINE = 1600
/** The latency the service promises, in milliseconds. */
export const SLO_MS = 250

export const HOST_NAMES = ['web-1', 'web-2', 'web-3', 'api-1', 'api-2', 'batch']
/** The requests per second one host is built for. */
export const HOST_LIMIT = 400
const HOST_CYCLE: DemoHost[] = ['online', 'idle', 'offline', 'failed']

export const EMPTY: DemoState = {
  samples: [],
  markers: [],
  hosts: ['online', 'online', 'online', 'online', 'online', 'online'],
  incident: 0,
  warmup: 0,
}

export function apply(state: DemoState, ev: DemoEvent): DemoState {
  switch (ev.event) {
    case 'measure': {
      const drop = Math.max(0, state.samples.length + 1 - MAX_SAMPLES)
      return {
        ...state,
        samples: [...state.samples.slice(drop), ev.sample],
        markers: state.markers.map(m => ({ ...m, step: m.step - drop })).filter(m => m.step >= 0),
        incident: Math.max(0, state.incident - 1),
        warmup: Math.max(0, state.warmup - 1),
      }
    }
    case 'marker': {
      const step = state.samples.length - 1
      if (step < 0) return state
      const markers = [...state.markers, { step, kind: ev.kind }]
      return ev.kind === 'deploy' ? { ...state, markers, warmup: 3 } : { ...state, markers, incident: 6 }
    }
    case 'status': {
      if (!(ev.host >= 0 && ev.host < state.hosts.length)) return state
      return { ...state, hosts: state.hosts.map((h, i) => (i === ev.host ? ev.status : h)) }
    }
    case 'reset':
      return EMPTY
  }
}

/** The status a host goes to when its button is pressed. */
export function nextStatus(status: DemoHost): DemoHost {
  return HOST_CYCLE[(HOST_CYCLE.indexOf(status) + 1) % HOST_CYCLE.length] ?? 'online'
}

/** A repeatable stand-in for noise: 0 to 1, from the step and a channel. */
function noise(step: number, channel: number): number {
  const x = Math.sin(step * 12.9898 + channel * 78.233) * 43758.5453
  return x - Math.floor(x)
}

const round1 = (n: number) => Math.round(n * 10) / 10

/** The next measurement: traffic on a slow wave, shaped by the hosts, a deploy or an incident. */
export function simulateMeasure(state: DemoState): DemoEvent {
  const i = state.samples.length
  const up = state.hosts.filter(h => h === 'online').length + 0.5 * state.hosts.filter(h => h === 'idle').length
  const failed = state.hosts.filter(h => h === 'failed').length
  const rps = Math.max(0, Math.min(CAPACITY,
    1050 + 420 * Math.sin(i / 6) + 160 * noise(i, 1) - (state.incident > 0 ? 260 : 0) - (state.warmup > 0 ? 140 : 0)))
  const cpu = Math.min(100, (rps / (Math.max(1, up) * 400)) * 85 + 8 * noise(i, 2))
  const p95 = 70 + cpu * 1.3 + 30 * noise(i, 3) + (state.incident > 0 ? 210 : 0) + (state.warmup > 0 ? 60 : 0)
  const mem = 46 + (i % 48) * 0.7 + 4 * noise(i, 4)
  const errors = 0.2 + 0.4 * noise(i, 5) + (state.incident > 0 ? 3.2 : 0) + failed * 0.9
  return {
    event: 'measure',
    sample: { rps: Math.round(rps), p95: Math.round(p95), cpu: round1(cpu), mem: round1(mem), errors: round1(errors) },
  }
}

/**
 * Each host's share of sample `i`'s requests per second, by the hosts as they
 * are now: an online host takes a full share, an idle one half, give or take
 * a little; an offline or failed host serves nothing and reads as `null`.
 */
export function hostLoad(state: DemoState, i: number): (number | null)[] {
  const rps = state.samples[i]?.rps ?? 0
  const weights = state.hosts.map((h, k) => (h === 'online' ? 1 : h === 'idle' ? 0.5 : 0) * (0.85 + 0.3 * noise(i, 10 + k)))
  const sum = weights.reduce((a, b) => a + b, 0)
  return weights.map(w => (w === 0 ? null : sum === 0 ? 0 : Math.round((rps * w) / sum)))
}

/** A history to start from, so every picture has something to show. */
export function seed(): DemoState {
  let state = apply(apply(EMPTY, { event: 'status', host: 3, status: 'idle' }), { event: 'status', host: 5, status: 'offline' })
  for (let i = 0; i < 40; i++) {
    state = apply(state, simulateMeasure(state))
    if (i === 11) state = apply(state, { event: 'marker', kind: 'deploy' })
    if (i === 25) state = apply(state, { event: 'marker', kind: 'incident' })
  }
  return state
}

export type Scene = {
  status: Status
  /** The theme key for a `Text` beside the status. */
  statusColor: 'success' | 'warning' | 'error'
  throughput: Picture
  latency: Picture
  tiles: Picture[]
  requests: Picture
  meters: Picture[]
  sparkline: Picture
  hosts: IconPicture[]
  /** Requests by host: as columns, as shares, over the last samples, and each host's tile. */
  breakdown: Picture[]
  legend: Picture
  icons: IconPicture[]
}

const PERCENT_ZONES: Zone[] = [
  { upTo: 70, status: 'good' },
  { upTo: 85, status: 'warning' },
  { upTo: 100, status: 'critical' },
]
const ERROR_ZONES: Zone[] = [
  { upTo: 1, status: 'good' },
  { upTo: 3, status: 'warning' },
  { upTo: 10, status: 'critical' },
]

const ms = (n: number) => `${Math.round(n)} ms`
const pct = (n: number) => `${Math.round(n)}%`
const pct1 = (n: number) => `${n.toFixed(1)}%`
const whole = (n: number) => String(Math.round(n))

export function draw(state: DemoState, themeName: 'dark' | 'light'): Scene {
  const theme = themes[themeName]
  const last: DemoSample = state.samples[state.samples.length - 1] ?? { rps: 0, p95: 0, cpu: 0, mem: 0, errors: 0 }
  const before = state.samples[state.samples.length - 2]
  const rps = state.samples.map(s => s.rps)
  const throughput = gauge(
    { value: last.rps, max: CAPACITY, threshold: REDLINE, label: 'Throughput' },
    { theme, format: whole },
  )
  const status = statusOf(last.rps, CAPACITY, REDLINE)
  const online = state.hosts.filter(h => h === 'online').length
  const errorStatus = zoneOf(last.errors, ERROR_ZONES)?.status ?? 'good'
  const trend: IconName = before !== undefined && last.rps < before.rps ? 'falling' : 'rising'
  const kinds = {
    deploy: { label: 'deploy', shape: 'diamond', color: theme.series.aqua },
    incident: { label: 'incident', shape: 'square', color: theme.series.orange },
  } as const

  return {
    status,
    statusColor: STATUS_TEXT_COLOR[status],
    throughput,
    latency: gauge({ value: last.p95, max: 600, threshold: 300, label: 'Latency p95' }, { theme, format: ms }),
    tiles: [
      statTile({ label: 'Requests/s', value: whole(last.rps), body: sparkline(rps, { theme, width: 176, last: 30, label: 'Requests/s, last 30 samples', format: whole }) }, { theme }),
      statTile({ label: 'Hosts', value: `${online}/${state.hosts.length}`, unit: 'online', body: dotRow(state.hosts, { theme }) }, { theme }),
      statTile(
        { label: 'Errors', value: pct1(last.errors), status: errorStatus, body: meter({ value: last.errors, max: 10, zones: ERROR_ZONES }, { theme, width: 176, showText: false, format: pct1 }) },
        { theme },
      ),
      statTile({ label: 'Trend', value: ICONS[trend].label, body: icon(trend, { theme, r: 10, label: `traffic ${ICONS[trend].label}` }) }, { theme }),
    ],
    requests: timeline(
      { values: rps, events: state.markers, threshold: REDLINE, thresholdLabel: `redline ${REDLINE}` },
      { theme, kinds, seriesLabel: 'requests/s', stepName: s => `#${s + 1}`, format: whole, width: 440, max: CAPACITY },
    ),
    meters: [
      meter({ value: last.cpu, max: 100, zones: PERCENT_ZONES, tick: 85, label: 'CPU' }, { theme, width: 260, format: pct }),
      meter({ value: last.mem, max: 100, zones: PERCENT_ZONES, tick: 85, label: 'Memory' }, { theme, width: 260, format: pct }),
      meter({ value: last.errors, max: 10, zones: ERROR_ZONES, tick: 3, label: 'Errors' }, { theme, width: 260, format: pct1 }),
    ],
    sparkline: sparkline(state.samples.map(s => s.p95), { theme, width: 200, height: 40, last: 30, reference: SLO_MS, label: 'Latency p95, last 30 samples', format: ms }),
    hosts: state.hosts.map((h, i) => icon(h, { theme, r: 9, label: `${HOST_NAMES[i] ?? `host ${i + 1}`} ${h}` })),
    breakdown: breakdown(state, theme),
    legend: legend(ICON_NAMES.map(name => ({ label: ICONS[name].label, mark: { icon: name } })), { theme, width: 300 }),
    icons: ICON_NAMES.map(name => icon(name, { theme, r: 9 })),
  }
}

/** The breakdown by host, drawn from `hostLoad`: four pictures of the same numbers. */
function breakdown(state: DemoState, theme: Theme): Picture[] {
  const n = state.samples.length
  const now = hostLoad(state, n - 1)
  const name = (k: number) => HOST_NAMES[k] ?? `host ${k + 1}`
  const recent = Array.from({ length: Math.min(16, n) }, (_, j) => n - Math.min(16, n) + j)
  const word: Record<DemoHost, Status> = { online: 'good', idle: 'warning', offline: 'serious', failed: 'critical' }
  return [
    bars(state.hosts.map((_, k) => ({ label: name(k), value: now[k] ?? 0 })), { theme, threshold: HOST_LIMIT, label: 'Requests/s by host', format: whole, width: 300 }),
    donut(state.hosts.map((_, k) => ({ label: name(k), value: now[k] ?? 0 })), { theme, label: 'Traffic share', format: whole }),
    heatmap(
      { values: state.hosts.map((_, k) => recent.map(i => hostLoad(state, i)[k] ?? null)), rowLabels: HOST_NAMES, colLabels: recent.map(i => `#${i + 1}`) },
      { theme, label: 'Requests/s by host, last 16 samples', format: whole, min: 0, max: HOST_LIMIT },
    ),
    statusGrid(
      state.hosts.map((h, k) => ({ label: name(k), status: word[h], value: now[k] === null ? h : `${whole(now[k] ?? 0)}/s` })),
      { theme, label: 'Hosts' },
    ),
  ]
}

/** The terminal's pictures, each shown one way: a Raster's props, or a driver's view. */
export type TerminalScene<T = RasterPicture> = {
  gauges: T[]
  requests: T
  tiles: T[]
  meters: T[]
  sparkline: T
  breakdown: T[]
}

/** How wide the requests chart is drawn on the terminal, in cells, when the pane has room. */
export const CHART_COLUMNS = 55

/**
 * Lays the scene's pictures out for the terminal, each shown by `show` under
 * its key. `columns` is the pane's body width; the chart narrows to it.
 */
function layOut<T>(scene: Scene, columns: number, show: (key: string, picture: Picture, width?: number) => T): TerminalScene<T> {
  return {
    gauges: [show('throughput', scene.throughput), show('latency', scene.latency)],
    requests: show('requests', scene.requests, Math.max(1, Math.min(CHART_COLUMNS, columns))),
    tiles: scene.tiles.map((tile, i) => show(`tile-${i}`, tile)),
    meters: scene.meters.map((m, i) => show(`meter-${i}`, m)),
    sparkline: show('latency-trend', scene.sparkline),
    breakdown: scene.breakdown.map((p, i) => show(['host-load', 'traffic-share', 'host-heat', 'host-grid'][i] ?? `breakdown-${i}`, p)),
  }
}

/**
 * The scene's pictures as Raster props, for any terminal, which draws no Svg:
 * the same shapes on dots, the labels in letters.
 */
export function rasterize(scene: Scene, themeName: 'dark' | 'light', columns: number): TerminalScene {
  return layOut(scene, columns, (key, picture, width) => toRaster(picture, { key, theme: themeName, columns: width }))
}

/**
 * The scene's pictures as the drivers pick for this terminal: Images of pixels
 * where it draws them (kitty, Ghostty), Rasters elsewhere. The Images of one
 * pane share its 2 MiB of pixels, a like part each.
 */
export function terminalScene(scene: Scene, themeName: 'dark' | 'light', columns: number, env: TerminalEnv): TerminalScene<TerminalView> {
  const count = 4 + scene.tiles.length + scene.meters.length + scene.breakdown.length
  const maxBytes = Math.floor(PIXELS_MAX.bytes / count)
  return layOut(scene, columns, (key, picture, width) => terminalView(picture, { key, env, theme: themeName, columns: width, maxBytes }))
}
