// Copied from svg-panel's src/marks.ts by scripts/build.mjs: edit src/, then rebuild.

// Marker shapes for points and legend swatches, each with a surface ring.

import { num } from './core.ts'

export type Shape = 'circle' | 'diamond' | 'square' | 'triangle'

/** The one-column glyph that stands for each shape in a twin. */
export const SHAPE_GLYPH: Record<Shape, string> = {
  circle: '●',
  diamond: '◆',
  square: '■',
  triangle: '▲',
}

/**
 * A filled `shape` of radius `r` at `(cx, cy)`; `ring` paints a 2px ring of
 * that colour around it, so it reads apart from a line it sits on.
 */
export function marker(shape: Shape, cx: number, cy: number, r: number, fill: string, ring?: string, extra = ''): string {
  const paint = `fill="${fill}"` + (ring === undefined ? '' : ` stroke="${ring}" stroke-width="4" paint-order="stroke"`) + extra
  switch (shape) {
    case 'circle':
      return `<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" ${paint}/>`
    case 'square': {
      const s = r * 0.9
      return `<rect x="${num(cx - s)}" y="${num(cy - s)}" width="${num(2 * s)}" height="${num(2 * s)}" rx="1" ${paint}/>`
    }
    case 'diamond': {
      const d = r * 1.25
      return `<path d="M${num(cx)} ${num(cy - d)}L${num(cx + d)} ${num(cy)}L${num(cx)} ${num(cy + d)}L${num(cx - d)} ${num(cy)}Z" ${paint}/>`
    }
    case 'triangle': {
      const t = r * 1.2
      return `<path d="M${num(cx)} ${num(cy - t)}L${num(cx + t)} ${num(cy + t * 0.8)}L${num(cx - t)} ${num(cy + t * 0.8)}Z" stroke-linejoin="round" ${paint}/>`
    }
  }
}
