// Copied from svg-panel's src/statTile.ts by scripts/build.mjs: edit src/, then rebuild.

// A label, a value, and a body slot that takes another picture's markup.

import { abbreviate, assertBudget, esc, num, svgDoc, text, textWidth, type Picture } from './core.ts'
import { ICONS, iconMark, type IconName } from './icon.ts'
import { pickTheme, STATUS_WORD, type Status, type Theme } from './theme.ts'

export type StatTileData = {
  label: string
  value: string | number
  unit?: string
  /** A dot and its word in the top right corner. */
  status?: Status
  statusWord?: string
  /**
   * Another picture (a sparkline, a meter, an icon, a dot row), or raw markup:
   * a whole `<svg>` document, or a fragment drawn from the body's top left.
   */
  body?: Picture | string
}

export type StatTileOptions = {
  theme?: Theme | 'dark' | 'light'
  width?: number
  /** The body's height when it is a fragment, which has no size of its own. */
  bodyHeight?: number
  format?: (value: number) => string
  background?: boolean
}

const PAD = 12
const BODY_TOP = 64

/** The `width` and `height` an `<svg>` document's root tag declares. */
export function svgSize(svg: string): { width: number; height: number } | undefined {
  const root = /^<svg\b[^>]*>/.exec(svg)?.[0]
  const w = root && /\swidth="([\d.]+)"/.exec(root)?.[1]
  const h = root && /\sheight="([\d.]+)"/.exec(root)?.[1]
  return w && h ? { width: Number(w), height: Number(h) } : undefined
}

/** A whole `<svg>` placed at `(x, y)`, scaled down to `maxWidth` if wider. */
export function place(svg: string, x: number, y: number, maxWidth: number): { markup: string; height: number } {
  const size = svgSize(svg) ?? { width: maxWidth, height: 24 }
  const k = size.width > maxWidth ? maxWidth / size.width : 1
  const w = size.width * k
  const h = size.height * k
  const markup = svg.replace(/^<svg\b[^>]*>/, root =>
    root
      .replace(/\swidth="[\d.]+"/, ` width="${num(w)}"`)
      .replace(/\sheight="[\d.]+"/, ` height="${num(h)}"`)
      .replace(/^<svg/, `<svg x="${num(x)}" y="${num(y)}"`),
  )
  return { markup, height: h }
}

export function statTile(data: StatTileData, options: StatTileOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const fmt = options.format ?? abbreviate
  const width = options.width ?? 200
  const value = typeof data.value === 'number' ? fmt(data.value) : data.value
  const word = data.status === undefined ? undefined : (data.statusWord ?? STATUS_WORD[data.status])
  const parts: string[] = [text(PAD, 22, data.label, { size: 11, fill: theme.ink2, cls: 'tile-label' })]

  parts.push(text(PAD, 50, value, { size: 24, fill: theme.ink, weight: 600, cls: 'tile-value' }))
  if (data.unit !== undefined) {
    // Bold figures run wider than the estimate for regular text.
    parts.push(text(PAD + textWidth(value, 24) * 1.12 + 6, 50, data.unit, { size: 12, fill: theme.muted }))
  }
  if (data.status !== undefined && word !== undefined) {
    const wx = width - PAD - textWidth(word, 11)
    parts.push(
      `<circle class="tile-dot" cx="${num(wx - 8)}" cy="18" r="4" fill="${theme.status[data.status]}"/>`,
      text(wx, 22, word, { size: 11, fill: theme.ink2 }),
    )
  }

  let bodyHeight = 0
  const body = data.body
  const markup = body === undefined ? undefined : typeof body === 'string' ? body : body.svg
  if (markup !== undefined) {
    if (markup.startsWith('<svg')) {
      const placed = place(markup, PAD, BODY_TOP, width - 2 * PAD)
      parts.push(`<g class="tile-body">${placed.markup}</g>`)
      bodyHeight = placed.height
    } else {
      bodyHeight = options.bodyHeight ?? 24
      parts.push(`<g class="tile-body" transform="translate(${PAD} ${BODY_TOP})">${markup}</g>`)
    }
  }
  const height = body === undefined ? BODY_TOP : BODY_TOP + bodyHeight + PAD

  const bodyPicture = typeof body === 'object' ? body : undefined
  const head = `${data.label}: ${value}${data.unit === undefined ? '' : ` ${data.unit}`}${word === undefined ? '' : `, ${word}`}`
  const alt = bodyPicture === undefined ? head : `${head}. ${bodyPicture.alt}`
  const lead = `${data.label} ${value}${data.unit === undefined ? '' : ` ${data.unit}`}${word === undefined ? '' : ` ${word}`}`
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
    twin: bodyPicture === undefined || bodyPicture.twin === '' ? lead : `${lead}  ${bodyPicture.twin}`,
    isInteractive: bodyPicture?.isInteractive ?? false,
  }
}

export type DotRowOptions = { theme?: Theme | 'dark' | 'light'; r?: number; gap?: number; background?: boolean }

/** A row of icons (one per host, per job...), for a tile's body; its twin is the glyphs. */
export function dotRow(names: readonly IconName[], options: DotRowOptions = {}): Picture {
  const theme = pickTheme(options.theme)
  const r = options.r ?? 6
  const gap = options.gap ?? 4
  const cell = 2 * r + gap
  const width = Math.max(cell, names.length * cell + gap)
  const height = 2 * r + 2 * gap
  const marks = names.map(
    (name, i) => `<g><title>${esc(ICONS[name].label)}</title>${iconMark(name, gap + r + i * cell, gap + r, r, theme)}</g>`,
  )
  const counts = new Map<IconName, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return {
    svg: assertBudget(
      svgDoc({
        width,
        height,
        background: options.background === false ? undefined : theme.surface,
        body: marks.join(''),
      }),
    ),
    alt: names.length === 0 ? 'none' : [...counts].map(([name, c]) => `${c} ${ICONS[name].label}`).join(', '),
    twin: names.map(name => ICONS[name].glyph).join(''),
    isInteractive: false,
  }
}
