# svg-panel API

This is the reference for every export of `src/index.ts`. [README.md](README.md) is the guide: how to add the library to
a mod, what each picture looks like, and the platform facts it rests on.

## The library draws, the mod decides

svg-panel is a small library of pure functions. Data goes in, and strings and numbers come out. It does not:

- call `$`, read state or set timers;
- create elements;
- look at `e.surface`;
- lay anything out.

It has no packages and no DOM or Node APIs.

So every choice about showing a picture belongs to the mod:

- **Form.** Which form of the picture each surface gets: the `Svg` markup, `Raster` cells, the one-line `twin`, or
  nothing.
- **Element.** The element and its props: the `key`, `width` and `height` on an `Svg`, and where it sits in the tree.
- **Size.** The picture's size in CSS pixels (`width`, `height`) and on the terminal in cells (`columns`).
- **Colour.** The theme: the library has no way to know the app's theme, so the mod passes `'dark'`, `'light'` or its
  own `Theme`.
- **Updates.** When to redraw (an atom write) or to repaint a mounted Raster in place (`$.ui.blit`).

A picture gives a mod these forms to choose from:

| Form | Made by | Fits |
| --- | --- | --- |
| `svg`, `alt`, `isInteractive` | every component | an `Svg` on desktop, VS Code and mobile |
| `{ columns, rows, cells }` | `toRaster(picture)` | a `Raster` on the terminal |
| `twin` | every component | a `Text` anywhere, `$.ui.status`, a toast, a log |
| `Grid` (cells as numbers) | `rasterGrid(picture)` | the mod's own drawing, an ANSI print, a blit that changes a few cells |
| `glyph`, `textColor` | `icon` | a coloured `Text`, such as inside a `Button` |

The forms do not depend on each other. A mod can use one, several, or a different one per surface:

```tsx
const picture = gauge({ value, max: 2000, threshold: 1600, label: 'Throughput' }, { theme })

if (e.surface === 'terminal') {
  const { Raster, Text } = $.ui.resolve(e)
  // One choice: the cells when the pane is wide enough, the twin when it is not.
  if (e.props.bodyColumns < 29) return <Text>{picture.twin}</Text>
  const cells = toRaster(picture, { theme })
  return <Raster key="throughput" columns={cells.columns} rows={cells.rows} cells={cells.cells} />
}
const { Svg } = $.ui.resolve(e)
return <Svg source={picture.svg} alt={picture.alt} isInteractive={picture.isInteractive} />
```

The demo mod's choices (every picture as a Raster on the terminal, the twin in the status line, the chart narrowed to
the pane) are in `examples/demo-mod/hooks/`. They are one way to use the library, not part of it.

## Importing

Copy `examples/demo-mod/vendor/svg-panel/` into the mod, then import from its `index.ts`:

```ts
import { gauge, toRaster } from '../vendor/svg-panel/index.ts'
```

Each file is a module of its own that imports only its neighbours. So a mod that wants less can import a file directly:
`gauge.ts` brings `core`, `geom`, `twin` and `theme`, and none of the terminal branch's three files (`dots`,
`readSvg`, `raster`). Outside TypeScript, `dist/svg-panel.js` is the whole library as one ES module.

## Picture

```ts
type Picture = { svg: string; alt: string; twin: string; isInteractive: boolean }
```

| Field | What it is |
| --- | --- |
| `svg` | One `<svg>` document with a fixed `width` and `height` in CSS pixels. Every string in it is escaped, and it is at most `SVG_BUDGET` (131072) characters, the most an `Svg` `source` may hold. |
| `alt` | What the picture says, in words: the `Svg`'s required `alt`. |
| `twin` | The picture as plain text, one line (the timeline's has two). |
| `isInteractive` | `true` when the picture has a CSS hover (the timeline, or a tile holding one): the `Svg`'s flag. |

### Options every component takes

| Option | Default | What it does |
| --- | --- | --- |
| `theme` | `'dark'` | `'dark'`, `'light'`, or a `Theme` object |
| `background` | `true` (`icon`: `false`) | `false` leaves out the surface rectangle behind the picture |
| `format` | `abbreviate` | Turns a number into its text: `n => \`${n} ms\``. Components that print no figures do not take it. |

## Components

### gauge

```ts
gauge(data: GaugeData, options?: GaugeOptions): Picture
```

A speedometer: a 240° arc over a scale, a threshold tick with its label, the value as the hero figure, and a status dot
with its word. It is 232 × 176 (`GAUGE_SIZE`), or 29 × 11 cells as a Raster.

| `GaugeData` | Default | |
| --- | --- | --- |
| `value`, `max` | | required |
| `min` | `0` | |
| `threshold` | none | where the tick goes, on the same scale |
| `thresholdLabel` | the threshold's figure | the tick's label |
| `label` | none | what is measured; it leads the alt and the twin |
| `status` | `statusOf(value, max, threshold)` | `'good'`, `'warning'`, `'serious'` or `'critical'` |
| `statusWord` | `STATUS_WORD[status]` | the word beside the dot |

`GaugeOptions` takes `theme`, `format` and `background`. The twin is `Throughput 1240 / 2000 ████████████░░░░│░░░ ok`.

### meter

```ts
meter(data: MeterData, options?: MeterOptions): Picture
```

A horizontal track with a fill and an optional tick. The fill takes the colour of the zone the value is in, or of
`status`, or blue. It is 240 × 39 (3 rows of cells) with its text, or 240 × 26 (2 rows) as a bare track.

| `MeterData` | Default | |
| --- | --- | --- |
| `value`, `max` | | required |
| `min` | `0` | |
| `tick` | none | a mark on the track |
| `label` | none | |
| `zones` | none | `{ upTo, status }[]` in rising order; the fill takes the first zone the value does not pass |
| `status`, `statusWord` | none | the fill's status when there are no zones |

| `MeterOptions` | Default | |
| --- | --- | --- |
| `width` | `240` | |
| `showText` | `true` | `false` draws the bare track, for a tile's body |
| `theme`, `format`, `background` | | |

The twin is `CPU ████████████████░│░░ 82% / 100% warning`.

### sparkline

```ts
sparkline(values: readonly number[], options?: SparklineOptions): Picture
```

The values as a 2px line with the latest point marked, and an optional dashed reference line. It is 120 × 32, or 15 × 2
cells. It draws at most one point per pixel across.

| `SparklineOptions` | Default | |
| --- | --- | --- |
| `width`, `height` | `120`, `32` | |
| `last` | all | draw only the last `last` values |
| `reference` | none | a dashed rule at this value |
| `color` | the theme's blue | |
| `min`, `max` | the data's (and the reference's) | the scale's ends |
| `label` | `'Trend'` | for the alt |
| `theme`, `format`, `background` | | |

The twin is `▁▂▂▃█▇▅`: one block per value, thinned to 24.

### timeline

```ts
timeline(data: TimelineData, options?: TimelineOptions): Picture   // isInteractive: true
```

Values per step with event markers, a dashed threshold rule, a flag on the latest value, a legend once any event kind
appears beside the line, and a hover per step drawn in CSS. It is 480 wide, 150 high (174 with a legend), or 60 columns.
Over the size budget it thins its hover targets, always keeping the latest step and the events.

| `TimelineData` | | |
| --- | --- | --- |
| `values` | required | one per step, oldest first; a step is its index |
| `events` | `[]` | `{ step, kind }[]` |
| `threshold`, `thresholdLabel` | none | |

| `TimelineOptions` | Default | |
| --- | --- | --- |
| `width`, `height` | `480`, the plot's | |
| `kinds` | next shape and colour | `{ [kind]: { label, shape?, color? } }` |
| `seriesLabel` | `'value'` | the line's name, for the legend and the alt |
| `stepName` | `s => \`step ${s + 1}\`` | a step's name in tooltips and the twin |
| `max` | a tidy figure over the data | the axis top |
| `maxPoints` | `240` | the most steps with a hover target |
| `theme`, `format`, `background` | | |

The twin is two lines, the values in blocks with the latest figure, then the events:

```text
▁▂▄▆█▅▂▄▆▅ 1.3k
◆ deploy ×1 (#4) · ■ incident ×1 (#6)
```

### statTile and dotRow

```ts
statTile(data: StatTileData, options?: StatTileOptions): Picture
dotRow(names: readonly IconName[], options?: DotRowOptions): Picture
```

A tile holds a label, a value, an optional unit and status, and a body. It is 200 × 64 without a body, or 25 × 4 cells.
With a body it is 64 + the body's height + 12.

| `StatTileData` | | |
| --- | --- | --- |
| `label`, `value` | required | a number value goes through `format` |
| `unit` | none | |
| `status`, `statusWord` | none | a dot and its word in the top right |
| `body` | none | another `Picture`, a whole `<svg>`, or a fragment drawn from the body's top left. A wider one is scaled down to fit. |

`StatTileOptions` takes `width` (default `200`), `bodyHeight` (the height of a fragment body, default `24`), `theme`,
`format` and `background`. The tile's `alt` and `twin` carry its body's, and it is interactive when its body is.

`dotRow` is a row of icons for a body. Its options are `r` (default `6`), `gap` (default `4`), `theme` and `background`.
Its twin is the glyphs: `●●◐○✕`.

### icon

```ts
icon(name: IconName, options?: IconOptions): IconPicture
type IconPicture = Picture & { glyph: string; color: string; textColor: IconTextColor }
```

One of `ICON_NAMES`: `online`, `idle`, `offline`, `rising`, `falling`, `alert`, `failed`. It is `2r + 4` square, with
`r` defaulting to `8`.

- `options.label` is what it means here, for the alt and the tooltip.
- `background` is off by default.
- `glyph` is a one-column character, and its twin.
- `color` is the hex the picture paints.
- `textColor` is the Claude Code theme key for a `Text` holding the glyph.

`ICONS[name]` holds each icon's glyph, label, text colour and colour.

### legend

```ts
legend(items: readonly LegendItem[], options?: LegendOptions): Picture
type LegendItem = { label: string; color?: string; mark?: 'line' | Shape | { icon: IconName } }
```

Swatches with labels, wrapping at `width` (default `240`). The twin is `─ requests/s  ◆ deploy  ● online`. Use
`legendMarkup(items, x, y, maxWidth, theme)` to draw one inside another picture, and `legendTwin(items)` for the line
of text alone.

### bars

```ts
bars(items: readonly BarItem[], options?: BarsOptions): Picture
type BarItem = { label: string; value: number; status?: Status }
```

Columns over a baseline, 240 × 140 (30 × 9 cells). Each column's figure sits over it and its label under it, where they
fit the column's slot; the alt and the twin keep every one.

| `BarsOptions` | Default | |
| --- | --- | --- |
| `width`, `height` | `240`, `140` | |
| `threshold` | none | a dashed rule; a column at or past it is `warning` unless its item has a `status` |
| `max` | a tidy figure over the data and the threshold | the scale's top |
| `label` | `'Bars'` | for the alt and the twin |
| `theme`, `format`, `background` | | |

The twin is `Deploys ▄▆▃▇▅▆▂ high thu 88`. `barLayout(count, width, height, top)` gives each column's place.

### donut

```ts
donut(slices: readonly Slice[], options?: DonutOptions): Picture
type Slice = { label: string; value: number; color?: string }
```

A ring of shares with the total in its middle and the shares listed beside it, 232 × 144 (29 × 9 cells). Values at or
under zero are left out. With nothing left the ring is an empty track.

| `DonutOptions` | Default | |
| --- | --- | --- |
| `center` | the total | the figure in the middle |
| `maxSlices` | `5` | past it the smallest shares fold into `other` |
| `legend` | `true` | the list of shares beside the ring |
| `label` | `'Shares'` | for the alt and the twin |
| `theme`, `format`, `background` | | |

The twin is `Traffic 12.4k: api 46% · web 31% · batch 23%`. `donutShares(slices, max, theme)` gives the shares as drawn,
with their colours.

### heatmap

```ts
heatmap(data: HeatmapData, options?: HeatmapOptions): Picture
type HeatmapData = { values: readonly (readonly (number | null | undefined)[])[]; rowLabels?: readonly string[]; colLabels?: readonly string[] }
```

Rows of cells in `HEAT_STEPS` (5) steps of one colour. A value that is not a finite number is missing and drawn as a
short dash. Column labels are shown every so many columns, so none runs into the next. The grid starts on a terminal
cell's corner (8 × 16 CSS pixels) and a cell with its gap is 16 pixels, two terminal columns.

| `HeatmapOptions` | Default | |
| --- | --- | --- |
| `cell`, `gap` | `14`, `2` | a cell's side and the space between cells |
| `min`, `max` | the data's | the scale's ends |
| `color` | the theme's blue | the top step; the lower ones mix toward the grid colour (`heatColors`) |
| `key` | `true` | the `less ■■■■■ more` key under the grid |
| `label` | `'Heatmap'` | for the alt |
| `theme`, `format`, `background` | | |

The twin is a line a row, one shade a cell from `HEAT_SHADES` (` ·░▒▓█`, a space for missing), the row's label in front.
`heatStep(value, lo, hi)` gives a value's step.

### statusGrid

```ts
statusGrid(items: readonly StatusItem[], options?: StatusGridOptions): Picture
type StatusItem = { label: string; status: Status; value?: string }
```

Tiles of 84 × 44, six to a row by default: a dot in the status colour, the name, and the `value` or the status's word
under it. A name too long for its tile is cut with `…` (`fitLabel`).

| `StatusGridOptions` | Default | |
| --- | --- | --- |
| `columns` | as many as fit `width`, 6 at most | tiles a row |
| `tile`, `gap` | `{ width: 84, height: 44 }`, `6` | |
| `label` | `'Status'` | for the alt |
| `theme`, `background` | | |

The twin is `● web-1  ▲ api-1  ✕ batch`: each status has a shape as well as a colour (`STATUS_GLYPH`).

## Terminal: Raster cells

The terminal has no `Svg`. These functions turn a picture, or any `<svg>` string, into the cells of a `Raster`. They paint
the picture's shapes on dots (2 across and 4 down a cell), give each cell the block or braille character and two colours
that best repeat its dots, and set each `<text>` in letters. They never pick a key, a place in the tree or a size the
mod did not ask for.

### toRaster

```ts
toRaster(picture: Picture | string, options?: RasterOptions): RasterCells
toRaster(picture: Picture | string, options: RasterOptions & { key: string }): RasterPicture

type RasterCells = { columns: number; rows: number; cells: string }
type RasterPicture = RasterCells & { key: string }
```

Without a `key`, it returns the size and the cells, and the mod gives the element its own key. With one, the key comes
back too, so the result spreads: `<Raster {...toRaster(picture, { key: 'cpu' })} />`. `cells` is what `RasterProps`
takes: padded base64 of little-endian u32 triplets `[codePoint, foreground, background]`, row by row.

| `RasterOptions` | Default | |
| --- | --- | --- |
| `columns` | width ÷ `CELL_PX` (8), rounded up | the width in cells; the rows follow from the picture's shape |
| `theme` | `'dark'` | its surface is what the picture's soft edges mix with |
| `backdrop` | the theme's surface | that colour as a hex |

Sizes at the default scale, in cells: gauge 29 × 11, meter 30 × 3, sparkline 15 × 2, timeline 60 × 10, bars 30 × 9,
donut 29 × 9, a bare tile 25 × 4, an icon 3 × 2. A Raster is at most 512 × 256 (`RASTER_MAX`), so a taller picture is scaled down to fit.

What the mod decides around it:

- **Size.** Pass `columns` from the room it has, such as `e.props.bodyColumns`, or leave the default. The site clips
  what does not fit.
- **Theme.** Pass the same `theme` the picture was drawn with, so its edges mix with its own surface.
- **Background.** A picture drawn with `background: false` leaves its bare cells as `DEFAULT_COLOR`, the terminal's own
  background.
- **Updates.** Redraw (a new tree) when the size changes. To repaint a mounted Raster of the same size, the mod can call
  `$.ui.blit({ requestId, key, cells })` with a new `toRaster(...).cells`.

### rasterGrid and the grid

```ts
rasterGrid(picture: Picture | string, options?: RasterOptions): Grid
type Grid = { columns: number; rows: number; cells: Cell[] }   // row by row
type Cell = { ch: number; fg: number; bg: number }            // code point; 0xRRGGBB or DEFAULT_COLOR
```

These are the cells before they are packed: to change a few, to draw them some other way, or to test them.

| Function | Returns |
| --- | --- |
| `encodeCells(grid)` | a Raster's `cells` |
| `decodeCells(cells, columns, rows)` | the grid back; it throws if the length is not `columns × rows` |
| `gridText(grid)` | the characters alone, a line a row: what a test reads labels from |
| `ansi(grid)` | the grid in 24-bit ANSI colour, to print in a terminal outside Claude Code |

`DEFAULT_COLOR` is `0x01000000`, the terminal's own colour. `CELL_PX` is `8`. `RASTER_MAX` is
`{ columns: 512, rows: 256 }`.

### What a cell can hold

Every cell's character is one printable, one-column BMP character, because a Raster refuses the whole tree otherwise.
`cellChars(words)` makes a label's characters safe: a control character becomes a space, a wide or astral one
(`日`, `😀`) becomes `?`, and a combining mark is dropped.

The colours are the picture's own colours, exactly, where a cell is near one. Any other blend is rounded to 32 steps a
channel, for the terminal's palette of 1024 pairs.

### The pieces

The functions `toRaster` is built from are exported for a mod that wants to draw differently:

| Export | What it is |
| --- | --- |
| `readSvg(svg, scale)` | Paints an `<svg>` at `scale` dots per CSS pixel. Returns `{ dots, labels, columns, rows }`. |
| `fitCell(dots, backdrop, inks?)` | Picks one cell's character, `fg` and `bg` from its eight `Rgb` dots, row by row. |
| `BLOCK_GLYPHS` | The 16 block characters by the mask of their inked dots (bit `row * 2 + column`). |
| `brailleOf(mask)` | The braille character for a mask. |
| `BRAILLE_INK` | How much of its square a braille dot is taken to ink (`0.5`). |
| `cellChars`, `packRgb`, `hexRgb` | Characters and colours for cells. |
| `dots(width, height)` and its painters | The canvas: `fillCircle`, `strokeCircle`, `fillRoundRect`, `strokeRoundRect`, `fillPolygon`, `strokePolyline`, `dash`. |
| `pathPoints`, `arcPoints`, `snapLine`, `hiddenClasses`, `gradientColors`, `MIN_STROKE` | Path flattening, hairline snapping, CSS hiding, gradients' mean colours, and the thinnest stroke (1 dot). |

`readSvg` reads the subset of SVG that these components write, which is enough for most hand-written pictures too:

- **Elements.** `svg` (nested, with `x`, `y`, `width`, `height` and `viewBox`), `g`, `rect` (with `rx`), `circle`,
  `ellipse`, `line`, `polyline`, `polygon`, `path` and `text`.
- **Paths.** The `M L H V C S Q T A Z` commands, absolute or relative: lines, cubic and quadratic curves (with the
  mirrored control point of `S` and `T`) and arcs.
- **Gradients.** A fill or stroke of `url(#id)` naming a `linearGradient` or `radialGradient` paints in the gradient's
  mean colour, since a cell holds two colours. Stops come from `<stop>`s (`stop-color` as an attribute or in `style`), or
  from the gradient its `href` names.
- **Definitions.** What `<defs>`, `<clipPath>`, `<mask>`, `<pattern>`, `<marker>`, `<symbol>` and `<filter>` hold is not
  painted where it stands.
- **Paint.** `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-dasharray`, `paint-order`, `fill-opacity`,
  `stroke-opacity` and `currentColor`, inherited from groups as SVG inherits them, and `opacity` on a shape.
- **Transforms.** `translate()` and `scale()`.
- **CSS.** A class hidden by `<style>` (`.a{visibility:hidden}`) stays hidden.

It skips clipping and masks (what they would cut is drawn whole), filters, `<use>`, images, `opacity` on a group and
other transforms. A path stops at a command outside the list above.

## Terminal: drivers

A driver is one way of showing a picture in a terminal. A list of drivers, ranked, picks the best one the terminal can
draw; the last one draws everywhere, so a picture always shows. There are two lists:

| List | Drivers, best first | Gives |
| --- | --- | --- |
| `claudeCode` | `image` (pixels in an `Image`), `raster` (cells in a `Raster`) | a `TerminalView`: the element to draw and its props |
| `printDrivers` | `kitty` (a kitty graphics escape), `ansi` (24-bit coloured cells) | text for a program to write to standard output |

The `image` and `kitty` drivers take kitty and Ghostty: `TERM` of `xterm-kitty` or `xterm-ghostty`, `KITTY_WINDOW_ID`
set, or `TERM_PROGRAM` of `ghostty`. Never inside tmux (`TMUX` set): Claude Code draws no Image there, and tmux drops a
kitty escape it is not asked to pass on. Everywhere else, Windows Terminal among them, the cells.

### terminalView

```ts
terminalView(picture: Picture | string, options: ViewOptions): TerminalView

type TerminalView = { element: 'Image'; props: ImageProps } | { element: 'Raster'; props: RasterPicture }
type ImageProps = { key: string; source: { rgba: string; width: number; height: number }; columns: number; rows: number; alt: string }
```

```tsx
const env = { TERM: await $.env.get('TERM'), TERM_PROGRAM: await $.env.get('TERM_PROGRAM'), /* … */ }
const v = terminalView(picture, { env, key: 'cpu', columns: 29 })
return v.element === 'Image' ? <Image {...v.props} /> : <Raster {...v.props} />
```

| `ViewOptions` | Default | |
| --- | --- | --- |
| `env` | required | the variables in `TERMINAL_ENV`, read with `$.env.get`; `$.env.get` takes each name as a literal |
| `key` | required | the element's key: a Raster needs one, and `$.ui.blit` names it |
| `prefer` | `SVG_PANEL_DRIVER` | a driver's id, used whatever the terminal says; an unknown one is passed over |
| `columns` | width ÷ `CELL_PX` | the same box for both drivers: an Image fills the cells a Raster would |
| `alt` | the picture's alt | an Image's words where it cannot draw |
| `theme`, `backdrop` | | for the Raster, as in `toRaster` |
| `cellPixels`, `maxBytes` | `16`, 2 MiB | for the Image, as in `toPixels` |

iTerm2 3.5 and later draws an Image too, but only under Claude Code's fullscreen rendering, which the environment does
not tell. There, pass `prefer: 'image'` or set `SVG_PANEL_DRIVER=image`.

### toPixels

```ts
toPixels(picture: Picture | string, options?: PixelOptions): PixelPicture
type PixelPicture = { width: number; height: number; data: Uint8Array; columns: number; rows: number }
```

The picture as straight RGBA pixels, four bytes each, row by row, over a box of `columns × rows` cells. A cell is twice
as tall as it is wide, as a Raster's is, so the box keeps the picture's shape; past its edge the pixels are clear and the
terminal's own background shows. It is the same painter as the Raster's, at more dots a cell.

| `PixelOptions` | Default | |
| --- | --- | --- |
| `columns` | width ÷ `CELL_PX` | the box's width in cells |
| `cellPixels` | `16` (`CELL_PIXELS`) | pixels across a cell, twice that down |
| `maxBytes` | 2 MiB | the most bytes the pixels take |

An Image takes 1 to 255 cells a side, 2048 pixels a side and 2 MiB of bytes (`PIXELS_MAX`); a bigger box takes fewer
pixels a cell. **The Images of one tree share those 2 MiB**, so a pane of several passes each a part as `maxBytes`. The
demo's pane splits it evenly over its 15 pictures.

The pixels carry no letters yet: the library has no font, so a picture's `<text>` is left out. Shapes, colours and soft
edges are all there; gradients paint in their mean colour, as in a Raster.

### kittyImage and kittyDelete

```ts
kittyImage(pixels: PixelPicture, options?: { id?: number }): string
kittyDelete(id: number): string
```

The kitty graphics escape for a program that writes to the terminal itself: raw RGBA (`f=32`), so no PNG encoder is
needed, shown at the cursor over the box's cells, with no reply asked (`q=2`). A payload over 4096 base64 bytes
(`KITTY_CHUNK`) goes in chunks, the keys on the first and `m=1` on all but the last. With an `id`, sending that id again
deletes the earlier picture and its placements and shows the new one at the cursor, so move the cursor back first to
redraw in place. `kittyDelete(id)` deletes the image and frees its data.

### printView

```ts
printView(picture: Picture | string, options: PrintOptions): string
```

```ts
process.stdout.write(printView(gauge(data), { env: process.env, columns: 29 }) + '\n')
```

kitty pixels where the terminal draws them, coloured cells (`ansi`) elsewhere. `PrintOptions` are `env`, `prefer`, and
the options of `toRaster` and `toPixels`.

### Adding a driver

```ts
type Driver<Out, Options> = {
  id: string
  rank: number                                     // the highest the terminal supports wins
  supports(env: TerminalEnv): boolean              // judged by the environment alone
  draw(picture: Picture | string, options: Options): Out
}
```

`add` returns a new list with the driver in it and leaves the old one as it was; an id already in the list throws.

```ts
const wezterm: Driver<TerminalView, ViewOptions> = {
  id: 'wezterm',
  rank: 20,
  supports: env => env.TERM_PROGRAM === 'WezTerm',
  draw: (picture, options) => imageDriver.draw(picture, options),
}
const mine = claudeCode.add(wezterm)
mine.draw(picture, { env, key: 'cpu' })
```

`drivers(...list)` makes a list of any kind of output, for a host of your own. `list.pick(env, prefer?)` names the
driver it would use, and `list.byId(id)` finds one.

## Twins

| Export | What it is |
| --- | --- |
| `bar(value, max, { width = 20, min = 0, tick })` | A `█░` bar with `│` at the tick: `████████████████░░│░` |
| `blocks(values, { min, max, width })` | `▁`…`█` per value, thinned to `width` |
| `thin(count, limit, keep?)` | At most `limit` evenly spread indices, the first, the last and `keep` among them |
| `BAR_FULL`, `BAR_EMPTY`, `BAR_TICK`, `BLOCKS` | The characters they use |
| `legendTwin(items)` | A legend as one line |
| `SHAPE_GLYPH` | One glyph per marker shape: `●◆■▲` |

## Theme

| Export | What it is |
| --- | --- |
| `Theme` | `surface`, `ink`, `ink2`, `muted`, `grid`, `baseline`, `status[Status]`, `series.{blue, orange, aqua, violet}` |
| `dark`, `light`, `themes` | The two themes, and both by name |
| `pickTheme(theme)` | A theme from a name or an object; dark when absent |
| `Status` | `'good' \| 'warning' \| 'serious' \| 'critical'` |
| `STATUS_WORD` | The word for each status: `ok`, `warning`, `serious`, `critical` |
| `STATUS_TEXT_COLOR` | The Claude Code theme key for a `Text` beside each status: `success`, `warning` or `error` |
| `statusOf(value, max, threshold?)` | The status a gauge or meter takes when none is given |
| `zoneOf(value, zones)` | The zone a value falls in |

A mod with its own colours passes its own `Theme`, a plain object of hex strings.

## Building a picture of your own

Everything the components are made of is exported, so a mod can draw a picture they do not cover, give it the
`Picture` shape, and use it like any other, `toRaster` included.

| Export | What it is |
| --- | --- |
| `svgDoc({ width, height, body, style?, background?, title? })` | The `<svg>` wrapper every picture is |
| `text(x, y, words, { size = 11, fill, anchor, weight, cls })` | A `<text>`, its words escaped |
| `esc(text)` | Escapes `& < > "` |
| `assertBudget(svg)`, `SVG_BUDGET` | Throws past 131072 characters |
| `num(value)` | A coordinate with at most two decimals |
| `textWidth(text, size)` | A rough width for laying out a label |
| `abbreviate(value)` | `236000` → `236k`, `1200000` → `1.2M` |
| `extent(values)` | `{ lo, hi }` by loop |
| `FONT` | The system sans stack |
| `scale`, `polar`, `arcPath`, `linePath`, `niceMax` | Scales, angles (degrees clockwise from twelve), arcs and paths |
| `marker(shape, cx, cy, r, fill, ring?)` | A circle, diamond, square or triangle |
| `iconMark(name, cx, cy, r, theme)` | An icon inside another picture |
| `legendMarkup(items, x, y, maxWidth, theme)` | A legend inside another picture, and the height it took |
| `place(svg, x, y, maxWidth)`, `svgSize(svg)` | One whole `<svg>` placed inside another, and the size a root declares |
| `GAUGE_SIZE`, `GAUGE_ARC`, `GAUGE_SWEEP`, `gaugeAngle` | The gauge's geometry |
| `METER_PAD`, `METER_TRACK`, `SPARK_PAD`, `sparkPoints` | The meter's and the sparkline's |

```ts
const ring = (value: number, theme = dark): Picture => {
  const body = `<path d="${arcPath(20, 20, 14, 0, value * 359.9)}" fill="none" stroke="${theme.series.blue}" stroke-width="5"/>`
  return { svg: svgDoc({ width: 40, height: 40, body, background: theme.surface }), alt: `${Math.round(value * 100)}%`, twin: bar(value, 1, { width: 5 }), isInteractive: false }
}
toRaster(ring(0.6))   // 5 × 3 cells
```
