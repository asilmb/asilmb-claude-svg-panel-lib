// Drivers: one way each of showing a picture in a terminal, and a ranked list
// that picks the best one the terminal can draw. `claudeCode` holds an `Image`
// of pixels and a `Raster` of cells, for a mod; `printDrivers` holds a kitty
// escape and ANSI cells, for a program that writes to the terminal itself. A
// driver for another terminal or another host is one more entry, `add`ed.

import type { Picture } from './core.ts'
import { toPixels, type PixelOptions } from './pixels.ts'
import { kittyImage } from './kitty.ts'
import { ansi, rasterGrid, toBase64, toRaster, type RasterOptions, type RasterPicture } from './raster.ts'

/** The environment the drivers judge the terminal by: what `$.env.get` gives a mod. */
export type TerminalEnv = Readonly<Record<string, string | undefined>>

/** The variables the drivers here read; a mod asks `$.env.get` for each. */
export const TERMINAL_ENV = ['TERM', 'TERM_PROGRAM', 'KITTY_WINDOW_ID', 'TMUX', 'SVG_PANEL_DRIVER'] as const

/** What every driver's options carry: the environment, and a driver to use whatever it says. */
export type DriverOptions = {
  env: TerminalEnv
  /** A driver's `id`; `SVG_PANEL_DRIVER` in the environment names one too. A name not in the list is passed over. */
  prefer?: string
}

export type Driver<Out, Options extends DriverOptions> = {
  id: string
  /** Of the drivers the terminal can draw, the highest rank wins. */
  rank: number
  /** Whether this terminal draws what the driver gives, judged by its environment alone. */
  supports(env: TerminalEnv): boolean
  draw(picture: Picture | string, options: Options): Out
}

export type Drivers<Out, Options extends DriverOptions> = {
  /** Highest rank first. */
  readonly list: readonly Driver<Out, Options>[]
  /** A new list with `driver` in it; this one is left as it was. */
  add(driver: Driver<Out, Options>): Drivers<Out, Options>
  byId(id: string): Driver<Out, Options> | undefined
  /** The driver named by `prefer` or `SVG_PANEL_DRIVER`, else the highest ranked the terminal supports. */
  pick(env: TerminalEnv, prefer?: string): Driver<Out, Options>
  /** The picked driver's drawing. */
  draw(picture: Picture | string, options: Options): Out
}

/** A ranked list of drivers. Keep one that supports every terminal in it, lowest, so a picture always shows. */
export function drivers<Out, Options extends DriverOptions>(...list: Driver<Out, Options>[]): Drivers<Out, Options> {
  const ranked = [...list].sort((a, b) => b.rank - a.rank)
  const byId = (id: string) => ranked.find(d => d.id === id)
  const pick = (env: TerminalEnv, prefer?: string) => {
    const named = byId(prefer ?? '') ?? byId(env.SVG_PANEL_DRIVER ?? '')
    const driver = named ?? ranked.find(d => d.supports(env))
    if (!driver) throw new Error(`svg-panel: no driver in [${ranked.map(d => d.id).join(', ')}] draws in this terminal`)
    return driver
  }
  return {
    list: ranked,
    add(driver) {
      if (byId(driver.id)) throw new Error(`svg-panel: a driver named ${driver.id} is already in the list`)
      return drivers(...ranked, driver)
    },
    byId,
    pick,
    draw: (picture, options) => pick(options.env, options.prefer).draw(picture, options),
  }
}

/** An `Image`'s props: RGBA pixels over a box of cells. */
export type ImageProps = {
  key: string
  source: { rgba: string; width: number; height: number }
  columns: number
  rows: number
  alt: string
}

/** What a Claude Code terminal shows: the element to draw and its props, ready to spread. */
export type TerminalView = { element: 'Image'; props: ImageProps } | { element: 'Raster'; props: RasterPicture }

export type ViewOptions = DriverOptions &
  RasterOptions &
  PixelOptions & {
    /** The element's key: a Raster needs one, and `$.ui.blit` names it. */
    key: string
    /** An Image's words where it cannot draw; the picture's alt by default. */
    alt?: string
  }

/**
 * Pixels through Claude Code's `Image`, which draws them in kitty and Ghostty
 * (and in iTerm2 3.5 and later under fullscreen rendering, which the
 * environment does not tell: `prefer: 'image'` there). Never inside tmux,
 * where an Image draws only its alt.
 */
export const imageDriver: Driver<TerminalView, ViewOptions> = {
  id: 'image',
  rank: 10,
  supports: env =>
    env.TMUX === undefined &&
    (env.TERM === 'xterm-kitty' || env.TERM === 'xterm-ghostty' || env.KITTY_WINDOW_ID !== undefined || env.TERM_PROGRAM === 'ghostty'),
  draw(picture, options) {
    const pixels = toPixels(picture, options)
    const alt = options.alt ?? (typeof picture === 'string' ? '' : picture.alt)
    return {
      element: 'Image',
      props: {
        key: options.key,
        source: { rgba: toBase64(pixels.data), width: pixels.width, height: pixels.height },
        columns: pixels.columns,
        rows: pixels.rows,
        alt: alt || ' ',
      },
    }
  },
}

/** Cells through Claude Code's `Raster`: blocks, braille and letters, in every terminal. */
export const rasterDriver: Driver<TerminalView, ViewOptions> = {
  id: 'raster',
  rank: 0,
  supports: () => true,
  draw: (picture, options) => ({ element: 'Raster', props: toRaster(picture, options) }),
}

/** The drivers for a Claude Code mod's terminal surface. */
export const claudeCode = drivers(imageDriver, rasterDriver)

/**
 * A picture for a Claude Code terminal: an Image where the terminal draws
 * pixels, a Raster elsewhere.
 * `const v = terminalView(p, { env, columns: e.props.bodyColumns, key: 'cpu' })`, then
 * `v.element === 'Image' ? <Image {...v.props} /> : <Raster {...v.props} />`.
 */
export function terminalView(picture: Picture | string, options: ViewOptions): TerminalView {
  return claudeCode.draw(picture, options)
}

export type PrintOptions = DriverOptions & RasterOptions & PixelOptions

/** kitty pixels on standard output: kitty and Ghostty, outside tmux (which drops the escape unless wrapped). */
export const kittyPrintDriver: Driver<string, PrintOptions> = {
  id: 'kitty',
  rank: 10,
  supports: imageDriver.supports,
  draw: (picture, options) => kittyImage(toPixels(picture, options)),
}

/** Coloured block and braille cells on standard output, in any terminal with 24-bit colour. */
export const ansiPrintDriver: Driver<string, PrintOptions> = {
  id: 'ansi',
  rank: 0,
  supports: () => true,
  draw: (picture, options) => ansi(rasterGrid(picture, options)),
}

/** The drivers for a program that prints to the terminal itself. */
export const printDrivers = drivers(kittyPrintDriver, ansiPrintDriver)

/** A picture as text to write to standard output: kitty pixels where the terminal draws them, coloured cells elsewhere. */
export function printView(picture: Picture | string, options: PrintOptions): string {
  return printDrivers.draw(picture, options)
}
