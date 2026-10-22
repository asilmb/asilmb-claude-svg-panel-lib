// Copied from svg-panel's src/kitty.ts by scripts/build.mjs: edit src/, then rebuild.

// The kitty graphics protocol, for a program that writes to the terminal
// itself: pixels sent as raw RGBA in the escape, so no PNG encoder is needed.
// kitty, Ghostty and WezTerm read it.

import type { PixelPicture } from './pixels.ts'
import { toBase64 } from './raster.ts'

/** The most base64 one command may carry. */
export const KITTY_CHUNK = 4096

const command = (keys: string, payload = '') => `\x1b_G${keys}${payload ? `;${payload}` : ''}\x1b\\`

/**
 * Pixels shown at the cursor over their box of cells, the cursor after them.
 * With an `id`, sending that id again deletes the earlier picture and its
 * placements, and shows the new one at the cursor.
 * `q=2`: the terminal answers nothing, so nothing lands in the program's input.
 */
export function kittyImage(pixels: PixelPicture, options: { id?: number } = {}): string {
  const id = options.id === undefined ? '' : `,i=${options.id}`
  const keys = `a=T,f=32,s=${pixels.width},v=${pixels.height},c=${pixels.columns},r=${pixels.rows}${id},q=2`
  const payload = toBase64(pixels.data)
  if (payload.length <= KITTY_CHUNK) return command(keys, payload)
  // Every chunk but the last says more follow (m=1); only the first carries the keys.
  let out = ''
  for (let at = 0; at < payload.length; at += KITTY_CHUNK) {
    const more = at + KITTY_CHUNK < payload.length ? 1 : 0
    out += command(at === 0 ? `${keys},m=1` : `m=${more},q=2`, payload.slice(at, at + KITTY_CHUNK))
  }
  return out
}

/** Deletes the image `id` and frees its data. */
export function kittyDelete(id: number): string {
  return command(`a=d,d=I,i=${id},q=2`)
}
