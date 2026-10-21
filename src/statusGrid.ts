// A grid of tiles, one per thing watched (a host, a service, a job): a status
// dot, its name, and its figure or the status's word under it.

import { assertBudget, num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { pickTheme, STATUS_WORD, type Status, type Theme } from './theme.ts'

export type StatusItem = {
  label: string
  status: Status
  /** The line under the name; the status's word by default. */
  value?: string
}

export type StatusGridOptions = {
  theme?: Theme | 'dark' | 'light'
  /** Tiles a row; as many as fit in `width` when absent, 6 at most. */
  columns?: number
  /** A tile's size in CSS pixels. */
  tile?: { width: number; height: number }
  gap?: number
  /** The picture's width when `columns` is absent. */
  width?: number
  /** What the tiles are, for the alt text. */
  label?: string
  background?: boolean
}

/** The one-column glyph each status stands for in a twin: a shape as well as a colour. */
export const STATUS_GLYPH: Record<Status, string> = { good: '●', warning: '▲', serious: '◆', critical: '✕' }

const GRID_PAD = 6

/** A label cut to `room` pixels at this size, with `…` where it was cut. */
export function fitLabel(label: string, room: number, size: number): string {
  const chars = [...label]
  if (textWidth(label, size) <= room) return label
  const keep = Math.max(1, Math.floor(room / (size * 0.58)) - 1)
  return `${chars.slice(0, keep).join('')}…`
}

export function statusGrid(items: readonly StatusItem[], options: StatusGridOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const tile = options.tile ?? { width: 84, height: 44 }
  const gap = options.gap ?? 6
  const fit = Math.max(1, Math.floor(((options.width ?? 6 * (tile.width + gap) + 2 * GRID_PAD - gap) - 2 * GRID_PAD + gap) / (tile.width + gap)))
  const columns = Math.max(1, Math.min(items.length || 1, options.columns ?? Math.min(6, fit)))
  const rows = Math.ceil(items.length / columns)
  const width = 2 * GRID_PAD + columns * (tile.width + gap) - gap
  const height = 2 * GRID_PAD + Math.max(1, rows) * (tile.height + gap) - gap
  const room = tile.width - 28
  const parts = items.map((item, i) => {
    const x = GRID_PAD + (i % columns) * (tile.width + gap)
    const y = GRID_PAD + Math.floor(i / columns) * (tile.height + gap)
    const line = item.value ?? STATUS_WORD[item.status]
    return (
      `<g class="status-tile" data-status="${item.status}">` +
      `<rect x="${num(x)}" y="${num(y)}" width="${tile.width}" height="${tile.height}" rx="6" fill="${theme.grid}"/>` +
      `<circle class="status-dot" cx="${num(x + 12)}" cy="${num(y + 14)}" r="4" fill="${theme.status[item.status]}"/>` +
      text(x + 22, y + 18, fitLabel(item.label, room, 11), { size: 11, fill: theme.ink, cls: 'status-label' }) +
      text(x + 22, y + 33, fitLabel(line, room, 10), { size: 10, fill: theme.muted, cls: 'status-value' }) +
      '</g>'
    )
  })

  const counts = (['good', 'warning', 'serious', 'critical'] as const)
    .map(s => [s, items.filter(item => item.status === s)] as const)
    .filter(([, list]) => list.length > 0)
  const name = options.label ?? 'Status'
  const worst = [...counts].reverse().find(([s]) => s !== 'good')
  const alt = items.length === 0
    ? `${name}: nothing to watch yet`
    : `${name}: ${items.length} ${items.length === 1 ? 'item' : 'items'}, ` + counts.map(([s, list]) => `${list.length} ${STATUS_WORD[s]}`).join(', ') +
      (worst === undefined ? '' : `; ${STATUS_WORD[worst[0]]}: ${worst[1].map(item => item.label).join(', ')}`)
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
    twin: items.map(item => `${STATUS_GLYPH[item.status]} ${item.label}`).join('  '),
    isInteractive: false,
  }
}
