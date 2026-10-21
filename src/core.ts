// The pieces every picture is built from: the Picture shape, escaping, number
// formatting, the size budget and the <svg> wrapper.

/** What every component returns: the markup, its words, its terminal twin. */
export type Picture = {
  svg: string
  alt: string
  twin: string
  isInteractive: boolean
}

/** The most characters an `Svg` element's `source` may hold. */
export const SVG_BUDGET = 131072

/** The system sans stack: external fonts do not load inside the app's frame. */
export const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }

/** Escapes `& < > "` so a string can sit in markup text or a quoted attribute. */
export function esc(text: unknown): string {
  return String(text).replace(/[&<>"]/g, ch => ESCAPES[ch] ?? ch)
}

/** Throws when a picture would be refused by `Svg` for its length. */
export function assertBudget(svg: string): string {
  if (svg.length > SVG_BUDGET) {
    throw new RangeError(`svg-panel: ${svg.length} characters is over the ${SVG_BUDGET} an Svg source may hold`)
  }
  return svg
}

/** A coordinate for markup: at most two decimals, no trailing zeros. */
export function num(value: number): string {
  if (!Number.isFinite(value)) return '0'
  const rounded = Math.round(value * 100) / 100
  return String(Object.is(rounded, -0) ? 0 : rounded)
}

/** `value` as a finite number, `fallback` otherwise. */
export function finite(value: number | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/** The lowest and highest of the values, by loop: a spread overflows the stack on long series. */
export function extent(values: readonly number[]): { lo: number; hi: number } {
  let lo = Infinity
  let hi = -Infinity
  for (const v of values) {
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  return { lo, hi }
}

export function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value))
}

/** 236000 → `236k`, 12345 → `12.3k`, 1200000 → `1.2M`, 42 → `42`. */
export function abbreviate(value: number): string {
  const n = finite(value)
  const abs = Math.abs(n)
  const units: [number, string][] = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k']]
  for (const [size, suffix] of units) {
    if (abs >= size) {
      const scaled = n / size
      const digits = Math.abs(scaled) >= 100 ? 0 : 1
      return `${trimZeros(scaled.toFixed(digits))}${suffix}`
    }
  }
  return abs < 10 && !Number.isInteger(n) ? trimZeros(n.toFixed(1)) : String(Math.round(n))
}

function trimZeros(text: string): string {
  return text.includes('.') ? text.replace(/\.?0+$/, '') : text
}

/** A rough width for a label, so layout can leave it room. */
export function textWidth(text: string, size: number): number {
  return [...text].length * size * 0.58
}

export type DocOptions = {
  width: number
  height: number
  body: string
  /** The page's own CSS, for an interactive picture. */
  style?: string
  /** Painted behind everything, so surface rings read as gaps. */
  background?: string
  /** The first child: what a reader hears for the whole picture. */
  title?: string
}

/** Wraps a body in the `<svg>` document every picture is. */
export function svgDoc({ width, height, body, style, background, title }: DocOptions): string {
  const w = num(width)
  const h = num(height)
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" ` +
    `role="img" font-family="${FONT}">` +
    (title === undefined ? '' : `<title>${esc(title)}</title>`) +
    (style === undefined ? '' : `<style>${style}</style>`) +
    (background === undefined ? '' : `<rect width="${w}" height="${h}" rx="8" fill="${background}"/>`) +
    body +
    '</svg>'
  )
}

/** A `<text>` element, its words escaped. */
export function text(
  x: number,
  y: number,
  words: string,
  attrs: { size?: number; fill: string; anchor?: 'start' | 'middle' | 'end'; weight?: number; cls?: string },
): string {
  const { size = 11, fill, anchor = 'start', weight, cls } = attrs
  return (
    `<text x="${num(x)}" y="${num(y)}" font-size="${num(size)}" fill="${fill}"` +
    (anchor === 'start' ? '' : ` text-anchor="${anchor}"`) +
    (weight === undefined ? '' : ` font-weight="${weight}"`) +
    (cls === undefined ? '' : ` class="${cls}"`) +
    ` style="font-variant-numeric:tabular-nums">${esc(words)}</text>`
  )
}
