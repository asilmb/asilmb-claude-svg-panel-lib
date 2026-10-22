# svg-panel

Pictures for Claude Code mod panels: speedometer gauges, meters, sparklines, timelines, bar charts, donuts, heatmaps,
status grids, stat tiles, status icons and legends. Every picture is a pure function, data in, a `Picture` out:

```ts
type Picture = { svg: string; alt: string; twin: string; isInteractive: boolean }
```

`svg` goes into the platform's `Svg` element on the desktop app, VS Code and mobile; `alt` is that element's required
words; `isInteractive` is its flag. The terminal draws no `Svg`, so the library has a terminal branch:
`toRaster(picture)` turns the same picture into the cells of the terminal's `Raster` element, a grid of coloured cells. Its shapes come out in block and braille characters, and its labels and figures in plain letters (see
[On the terminal](#on-the-terminal-raster-cells)). `twin` is the picture as one line of text (a `█░│` bar for a meter,
`▁▂▃▅▇` blocks for a sparkline, a glyph for an icon), for a status line or a log.

The library only makes these forms. It never calls `$`, creates an element or looks at the surface, so each mod decides
which form it shows, on which surface, at what size and in which theme. [API.md](API.md) lists every export.

ES module TypeScript, no DOM, no Node APIs, no runtime packages. Every string that reaches the markup is escaped, every
picture is checked against the `Svg` size limit, and every colour comes from one `Theme` with a dark and a light set.

- `src/`: the library
- `API.md`: the reference for every export
- `examples/demo-mod/`: a service monitor in a pane, with every component, redrawn from atoms, as Rasters on the terminal
- `demo/index.html`: every component in both themes, driven by an event simulator. It opens from a double click.

## Adding a speedometer to your mod

A hooks module imports only its own files and `'claude-code'` (see [platform facts](#platform-facts)), so the library is a
folder you copy into your mod:

```sh
cp -r path/to/svg-panel/examples/demo-mod/vendor/svg-panel  my-mod/vendor/svg-panel
```

That folder is `src/` plus the `LICENSE`, which the MIT license asks to keep with every copy.

Your mod's `tsconfig.json` needs `"allowImportingTsExtensions": true`, because the library's files import each other
with their `.ts` names. `examples/demo-mod/tsconfig.json` is a complete one.

`hooks/register.tsx`:

```tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { gauge, toRaster } from '../vendor/svg-panel/index.ts'

const rps = atom({ plugin: 'my-mod', key: 'rps' } as const, 1240)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    void $.ui.open({ id: 'my-mod', title: 'Throughput' })
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: 'my-mod' }, async ($, e) => {
    const picture = gauge(
      { value: await read($, rps), max: 2000, threshold: 1600, label: 'Throughput' },
      { format: n => String(Math.round(n)) },
    )
    const faster = () => update($, rps, n => Math.min(2000, n + 100))

    if (e.surface === 'terminal') {
      const { Box, Button, Raster } = $.ui.resolve(e)
      const cells = toRaster(picture, { key: 'rps' })
      return (
        <Box flexDirection="column">
          <Raster key={cells.key} columns={cells.columns} rows={cells.rows} cells={cells.cells} />
          <Button key="faster" onPress={faster}>+100 rps</Button>
        </Box>
      )
    }
    const { Box, Svg, Button } = $.ui.resolve(e)
    return (
      <Box flexDirection="column" gap="sm">
        <Svg source={picture.svg} alt={picture.alt} isInteractive={picture.isInteractive} />
        <Button key="faster" onPress={faster}>+100 rps</Button>
      </Box>
    )
  })
}
```

The atom's value is declared in your mod's state contract, `types/index.d.ts`. Name it in `plugin.json` as
`"types": "./types/index.d.ts"`. A contract exports types and nothing else:

```ts
export type Rps = number

declare module 'claude-code' {
  interface PluginState {
    'my-mod': { rps: Rps }
  }
}
```

A press writes the atom, and the write redraws the pane on every surface. A picture never takes a press, since clicks
inside an `Svg` reach nobody: the press goes on a `Button` beside it. A `Button` holds only strings and `Text`, so an icon
on a button is the icon's glyph in a coloured `Text`, as in the [icon](#icon) example.

## Components

Every component takes `(data, options)`. Every `options` takes `theme` (`'dark'`, the default, `'light'`, or a `Theme`)
and `background: false` to leave out the surface rectangle. Components that print figures take `format`, a function
from a number to its text (`` n => `${n} ms` ``); the default shortens it (`1240` → `1.2k`). The twins below are the real
output.

### gauge

A speedometer: a 240° arc over a scale, a threshold tick with its label, the value as the hero figure, and a status dot
with its word. The status is `critical` at max, `warning` from the threshold, `good` below it, unless you pass one.

```ts
gauge({ value: 1240, max: 2000, threshold: 1600, label: 'Throughput' }, { format: n => String(Math.round(n)) })
// twin: Throughput 1240 / 2000 ████████████░░░░│░░░ ok
// alt:  Throughput: 1240 of 2000, ok; threshold 1600

gauge({ value: 182, max: 600, threshold: 300, label: 'Latency p95' }, { format: n => `${n} ms` })
// twin: Latency p95 182 ms / 600 ms ██████░░░░│░░░░░░░░░ ok
```

### meter

A horizontal track whose fill takes the colour of the zone the value is in, with an optional tick. `showText: false`
draws the bare track, for a tile's body.

```ts
meter(
  {
    value: 82, max: 100, tick: 85, label: 'CPU',
    zones: [{ upTo: 70, status: 'good' }, { upTo: 85, status: 'warning' }, { upTo: 100, status: 'critical' }],
  },
  { format: n => `${n}%` },
)
// twin: CPU ████████████████░│░░ 82% / 100% warning
```

### sparkline

The last N values (`last`) as a 2px line, the latest point marked, and an optional dashed `reference` line.

```ts
sparkline([142, 156, 149, 171, 238, 226, 190], { reference: 250, label: 'Latency p95' })
// twin: ▁▂▂▃█▇▅
```

### timeline

Values per step with event markers, each kind in its own colour and shape. It adds a dashed threshold rule, a flag on
the latest point, a legend once two or more series or kinds appear, and a hover per step: a crosshair, a dot and a
tooltip, drawn with CSS `:hover` and no script, plus a `<title>` per mark. It is interactive. Over the size budget, it
thins its points (always keeping the latest step and the events) until it fits.

```ts
timeline(
  {
    values: [820, 940, 1180, 1420, 1610, 1230, 980, 1110, 1350, 1290],
    events: [{ step: 3, kind: 'deploy' }, { step: 5, kind: 'incident' }],
    threshold: 1600,
  },
  {
    kinds: { deploy: { label: 'deploy', shape: 'diamond' }, incident: { label: 'incident', shape: 'square' } },
    seriesLabel: 'requests/s',
    stepName: s => `#${s + 1}`,
  },
)
// twin: ▁▂▄▆█▅▂▄▆▅ 1.3k
//       ◆ deploy ×1 (#4) · ■ incident ×1 (#6)
```

### statTile

A label, a value (a number is shortened: `1290` → `1.3k`), an optional unit and status, and a body slot that takes
another picture (a sparkline, a meter, an icon, a `dotRow`), or raw markup with `bodyHeight`. A body wider than the
tile is scaled down to fit. The tile's twin carries its body's twin.

```ts
statTile({ label: 'Requests/s', value: 1290, status: 'good', body: sparkline([820, 940, 1180, 1420, 1290]) })
// twin: Requests/s 1.3k ok  ▁▂▅█▆

dotRow(['online', 'online', 'idle', 'offline', 'failed'])   // a row of icons, for a body
// twin: ●●◐○✕
```

### icon

A named set. Each icon is drawn as SVG at any radius `r` and paired with a one-column glyph, the hex it is painted in,
and a theme key for a `Text`.

| name | glyph | colour | `textColor` |
| --- | --- | --- | --- |
| `online` | ● | status good | `success` |
| `idle` | ◐ | violet | `merged` |
| `offline` | ○ | muted | `subtle` |
| `rising` | ▲ | blue | `suggestion` |
| `falling` | ▼ | orange | `claude` |
| `alert` | ⚑ | status warning | `warning` |
| `failed` | ✕ | status critical | `error` |

```tsx
const alert = icon('alert', { r: 9 })        // twin: ⚑
<Svg source={alert.svg} alt={alert.alt} />
<Button key="ack" onPress={acknowledge}><Text color={alert.textColor}>{alert.glyph}</Text> acknowledge</Button>
```

`iconMark(name, cx, cy, r, theme)` draws one inside another picture.

### legend

Swatches with labels: a line for a series, a shape for an event kind, or an icon. Use it as a picture of its own, or
`legendMarkup` inside another picture, or `legendTwin` as a line of text.

```ts
legend([
  { label: 'requests/s', color: dark.series.blue },
  { label: 'deploy', mark: 'diamond', color: dark.series.aqua },
  { label: 'online', mark: { icon: 'online' } },
])
// twin: ─ requests/s  ◆ deploy  ● online
```

### bars

One column per item over a baseline, its figure over it and its label under it. An optional `threshold` draws a dashed
rule, and the columns at or past it take the warning colour unless an item names its own `status`. A label that does
not fit its slot is left out of the picture and kept in the alt and the twin.

```ts
bars(
  [{ label: 'mon', value: 42 }, { label: 'tue', value: 65 }, { label: 'wed', value: 30 }, { label: 'thu', value: 88 },
   { label: 'fri', value: 54 }, { label: 'sat', value: 71 }, { label: 'sun', value: 20 }],
  { threshold: 80, label: 'Deploys' },
)
// twin: Deploys ▄▆▃▇▅▆▂ high thu 88
```

### donut

A ring cut into shares, the total in its middle and the shares listed beside it. Past `maxSlices` (5) the smallest
shares fold into one `other`. The shares take blue, orange and aqua, then the secondary and muted inks.

```ts
donut([{ label: 'api', value: 5700 }, { label: 'web', value: 3850 }, { label: 'batch', value: 2850 }], { label: 'Traffic' })
// twin: Traffic 12.4k: api 46% · web 31% · batch 23%
```

### heatmap

Rows of cells in five steps of one colour, with row and column labels and a `less ■■■■■ more` key. A missing value is a
short dash. The grid starts on a terminal cell's corner and a cell is two terminal columns wide, so it stays crisp as a
Raster. The twin is a row of shades per row.

```ts
heatmap({ values: [[3, 8, 12, 20], [0, 4, null, 9]], rowLabels: ['web', 'api'], colLabels: ['0h', '6h', '12h', '18h'] })
// twin: web ·▒▓█
//       api ·░ ▒
```

### statusGrid

A grid of tiles, one per thing watched: a status dot, the name, and a figure or the status's word under it. Six to a
row by default. The twin gives each status its own shape as well as its colour: `●` ok, `▲` warning, `◆` serious,
`✕` critical.

```ts
statusGrid([{ label: 'web-1', status: 'good', value: '312/s' }, { label: 'api-1', status: 'warning' }, { label: 'batch', status: 'critical' }])
// twin: ● web-1  ▲ api-1  ✕ batch
```

## On the terminal: Raster cells

The terminal draws no `Svg`, but it has `Raster`: a fixed box of cells, each holding one character, a foreground colour and
a background colour. `toRaster` draws any picture into one, in the same way as
[chafa](https://hpjansson.org/chafa/), in TypeScript and with no packages:

1. **Dots.** It reads the picture's own markup and paints the same shapes on an invisible canvas of dots: arcs, curves,
   lines, rounded rectangles, circles and ellipses, filled or stroked, dashed where the Svg is dashed. A gradient
   paints in its mean colour. Each shape paints by its distance
   from the dot, so its edges are soft. What the picture's CSS hides, such as a timeline's hover tooltips, stays hidden.
2. **Cells.** It cuts the canvas into terminal cells, 2 dots across and 4 down per cell.
3. **Symbols.** For each cell it picks the character and the two colours that best repeat the cell's eight dots, by the
   least squared error. The characters are the half blocks `▀▄▌▐`, the quarters `▖▗▘▝▚▞▙▛▜▟`, the full block, and braille
   (`⠁`…`⣿`) for thin lines that no block can split. Of a block's two colours, the one nearer the surface goes in the
   background, so the surface stays one colour from cell to cell.
4. **Letters.** Each `<text>` is set in plain letters on the row and in the columns its anchor gives, over the cells it
   falls on. So `236k`, `300k` or `60k left` stay sharp instead of turning into dots.

The result is the `Raster`'s `columns`, `rows` and `cells`, plus its `key` if you pass one. Claude Code paints them in
whatever terminal it runs in, such as Windows Terminal.

```tsx
const throughput = gauge({ value: 236e3, max: 300e3, threshold: 270e3, label: 'Tokens' })
const cells = toRaster(throughput, { key: 'tokens' })   // { key: 'tokens', columns: 29, rows: 11, cells: '…' }
<Raster key={cells.key} columns={cells.columns} rows={cells.rows} cells={cells.cells} />
```

By default a cell spans 8 CSS pixels across (`CELL_PX`) and 16 down, about a terminal's cell beside the pictures' 11px
text. So a 232 × 176 gauge is 29 × 11 cells, and a 440px timeline is 55 columns.

- `columns` sets the width in cells, and the height follows.
- `theme` (or a hex `backdrop`) names the surface that a picture's soft edges mix into. Use the picture's own theme.
- A picture drawn with `background: false` leaves its bare cells to the terminal's own background.

What the cells hold, and what keeps them valid:

- **Thin lines.** A stroke is at least one dot wide, so a 1px grid line still shows. Level and upright lines, and the
  edges of rectangles, sit on whole dots, so a rule or a meter's track is one solid row and not two half-tones.
- **Colour.** A thin line in braille keeps its own colour, not a blend with its soft edge. A colour within a few steps of
  one of the picture's own colours is drawn in that colour exactly. Any other blend is rounded to 32 steps a channel,
  so it fits the terminal's palette, which paints 1024 colour pairs at once.
- **Valid characters.** A label's characters are made safe for a cell. A Raster takes only one-column BMP characters and
  refuses the whole tree otherwise. So a control character becomes a space, a wide or astral one (`日`, `😀`) becomes `?`,
  and a combining mark is dropped.
- **Size.** A Raster is at most 512 × 256 cells. A taller picture is scaled down to fit.

The pieces are exported too:

- `rasterGrid(picture, options)` returns the cells as a grid: `{ ch, fg, bg }` per cell, colours as `0xRRGGBB` or
  `DEFAULT_COLOR`.
- `encodeCells` and `decodeCells` turn a grid into a `Raster`'s `cells` and back. Use them for a test, or for a
  `$.ui.blit` that repaints a mounted Raster.
- `gridText(grid)` returns the characters alone.
- `ansi(grid)` returns the grid in 24-bit colour, to print in a terminal outside Claude Code.
- `fitCell` is the per-cell choice, and `readSvg` is the dot painter.

## On the terminal: pixels where it draws them

Claude Code's terminal also has `Image`, which draws real pixels in kitty and Ghostty. `terminalView` picks for the
terminal it runs in: an Image there, a Raster everywhere else, Windows Terminal among them.

```tsx
const env = { TERM: await $.env.get('TERM'), KITTY_WINDOW_ID: await $.env.get('KITTY_WINDOW_ID'), /* … */ }
const v = terminalView(throughput, { env, key: 'tokens' })
return v.element === 'Image' ? <Image {...v.props} /> : <Raster {...v.props} />
```

Each way of showing a picture is a driver in a ranked list, so another terminal or another host is one more driver:

- `claudeCode` holds `image` and `raster`, for a mod's terminal surface.
- `printDrivers` holds `kitty` (a kitty graphics escape) and `ansi` (coloured cells), for a program that writes to
  standard output itself: `printView(picture, { env: process.env })`.
- `list.add(driver)` returns a list with your driver in it. The highest-ranked driver the terminal supports wins, and
  `prefer` or `SVG_PANEL_DRIVER` names one outright.

What to know:

- **Text.** The pixels carry no letters yet, because the library has no font. Shapes and colours are all there.
- **Size.** The Images of one pane share 2 MiB of pixels. Give each its part with `maxBytes`.
- **tmux.** Inside tmux the drivers fall back to cells.
- **iTerm2.** iTerm2 draws an Image only under fullscreen rendering, which the environment does not tell, so it gets
  cells unless you pass `prefer: 'image'`.

### Helpers

[API.md](API.md) describes each of these in full.

- `esc` escapes `& < > "`.
- `assertBudget` throws past 131072 characters (`SVG_BUDGET`).
- `abbreviate` shortens a number: `1240` becomes `1.2k`, `1200000` becomes `1.2M`.
- `bar` and `blocks` make the twins.
- `toRaster` and `rasterGrid` make a `Raster` for the terminal.
- `scale`, `polar` and `arcPath` do the geometry.
- `statusOf`, `STATUS_WORD` and `STATUS_TEXT_COLOR` map a value to a status, its word, and the theme key for a `Text`.

## Theme

One `Theme` object per surface colour, `dark` and `light`. Each holds the surface, primary ink, secondary ink, muted,
grid and baseline colours, the four status colours, and the series colours. Text always wears an ink colour. A coloured
mark beside the text carries the meaning, and a status colour always comes with a word or an icon.

| role | dark | light |
| --- | --- | --- |
| surface | `#1a1a19` | `#fcfcfb` |
| primary ink | `#f0efec` | `#0b0b0b` |
| secondary ink | `#c3c2b7` | `#52514e` |
| muted | `#898781` | `#898781` |
| grid | `#2c2c2a` | `#e1e0d9` |
| baseline | `#383835` | `#c3c2b7` |
| status good, warning, serious, critical | `#0ca30c` `#fab219` `#ec835a` `#d03b3b` | the same |
| series blue, orange, aqua | `#3987e5` `#d95926` `#199e70` | `#2a78d6` `#eb6834` `#1baf7a` |
| violet (the `idle` icon only) | `#9085e9` | `#6250d6` |

The light column uses the same ramps as the dark one, stepped for a light surface. It is not a flipped copy.

Blue and violet fail a palette check as a pair. On the dark surface the pair scores ΔE 1.9 for protanopia and 9.8 for
normal vision, against floors of 8 and 15. So a chart's event kinds take the next validated slots, orange and aqua:
blue, orange and aqua pass every pair in both modes. Violet paints only the `idle` icon, whose shape tells it apart. On
the light surface, aqua sits under 3:1 contrast, so a timeline always draws its legend and a title on each mark beside it.

## The demo mod

`examples/demo-mod/` is a service monitor in one pane, with every component:

- two speedometers, throughput (requests per second, redline at 1600) and p95 latency;
- four tiles: requests per second over a sparkline, hosts online over a row of host icons, the error rate over a meter,
  and the traffic trend as an icon;
- the requests chart, with deploy and incident markers and the redline;
- requests by host four ways: bars against each host's 400/s limit, a donut of traffic shares, a heatmap of the last
  16 samples, and a status grid of the hosts;
- CPU, memory and error meters, and a latency sparkline against its 250 ms target;
- six hosts, each an icon beside a `Button` that cycles it through online, idle, offline and failed;
- the legend of the icon set.

How it is built:

- `hooks/scene.ts` holds the state, the events that change it, and `draw(state, theme)`, which returns every picture.
  It is pure, and `demo/index.html` runs the same file.
- `hooks/register.tsx` keeps the state in atoms. The pane's buttons send the events: a new sample, a deploy or
  incident marker, a host status change, a reset, and a dark/light switch. A `live` button turns on a `$.clock.every`
  timer that adds a sample every two seconds.
- The apps draw the pictures as `Svg` elements. The terminal draws the same pictures as `Raster` elements, from
  `rasterize(scene, theme, columns)` in `scene.ts`. The requests chart narrows to the pane's `bodyColumns`. The
  throughput gauge's twin goes in the status line.
- It starts from a seeded history, so every picture has something to show.
- `/svg-panel` opens the pane.

To try it, either run `claude --plugin-dir examples/demo-mod`, or copy the folder into a session's mods folder.

`claude plugin validate examples/demo-mod` passes, and `claude plugin test examples/demo-mod` runs
`tests/pane.test.tsx`. Those tests check that the apps draw 29 `Svg` elements with their alts, that the terminal draws
15 `Raster` elements and no `Svg`, with the figures and labels in letters in their cells and the hover tooltips left
out, that a press redraws on the desktop and the terminal, that a host button cycles its status and
glyph colour, that live mode samples on a mocked clock until paused, and that the theme switch repaints.

## The demo page

`demo/index.html` imports nothing: `scripts/build.mjs` inlines a copy of the built library and the demo's `scene.ts`.

- It draws each picture the way the app does: an `<img>` from a `data:` URL, or a `sandbox=""` `<iframe srcdoc>` when
  the picture is interactive. The timeline's hover works in that frame.
- It shows each component in a dark and a light column (or one of them), with its twin under it.
- It renders a terminal view of the pane. It paints each `Raster` from the same `cells` the mod sends: quarter blocks as
  rectangles, braille as dots, and the rest as letters. The twins are shown under it.
- Its simulator sends the demo mod's events: `measure` (a new sample, or a stream of them with `live`), `marker`
  (deploy or incident), `status` (a host's state) and `reset`. It logs them and redraws from the state.

## Development

Node 22.18 or later runs the TypeScript directly; nothing needs installing.

```sh
npm run build      # vendor src/ into the demo mod, write dist/svg-panel.js and demo/index.html
npm run typecheck  # tsc on the library and on the demo mod
npm test           # the library's tests (node:test)
npm run mutate     # breaks each component on purpose and checks a test fails
npm run test:mod   # claude plugin test examples/demo-mod
npm run check      # all of the above, plus claude plugin validate
```

The demo mod's type check reads this Claude Code build's API types from `examples/demo-mod/.claude-plugin/types/`. A
session that loads the mod writes them there itself. Without one, run the `plugin-authoring` skill once, then run
`node scripts/lay-types.mjs` to copy the types it wrote. You can also pass a types file's path to that script.

Each component's test checks four things for a known input:

- its geometry: an arc's end point, the tick's angle, a fill's width, a line's end, a marker's centre
- its exact twin text
- that a hostile label comes out escaped and well-formed
- that it stays within the size budget

`test/raster.test.ts` checks the terminal branch. It covers how cells pack, which block or braille character a cell
takes, the braille dot order, where a gauge's figures land, the hidden tooltips, hairlines, a tile's nested body, arcs,
and the size limits.

`npm run mutate` applies 60 deliberate breakages, one at a time, and every one turns a test red.

### Releases

A release is automatic. `.github/workflows/release.yml` runs on every pull request and on every push to `main`. It checks
that the built files match `src/`, then runs the type check, the tests and the mutants. On a push to `main` whose
`package.json` version has no tag yet, it then tags `vX.Y.Z` and publishes a GitHub release, with notes listing the
merged pull requests.

To release, raise `version` in `package.json` (and in `examples/demo-mod/.claude-plugin/plugin.json`) in the pull
request. Merging it does the rest. A push that leaves the version as it is releases nothing. The demo mod's checks need
Claude Code, so run them locally with `npm run check`.

## Platform facts

These were checked against Claude Code **2.1.306 on 2026-10-21**. The sources were this build's types file (written by
the `plugin-authoring` skill), `claude plugin validate`, and probe mods run under `claude plugin test`. The API moves
between releases, so re-check these facts against your own build's types.

**Confirmed:**

- **Elements.** A panel is drawn from `$.ui.resolve(e)`'s table, with flexbox on `Box`. Spacing takes cells or the steps
  `xs` to `xl`. On the terminal and in VS Code, `xs` and `sm` draw as one cell across and zero rows down, `md` as 2
  across and 1 down, `lg` as 3 and 1, and `xl` as 4 and 2. The desktop and mobile apps size the steps their own way.
  Colours are theme keys (`success`, `warning`, `error`, `claude`, `subtle`, `merged`, `suggestion`...) or any other
  colour string.
- **`SvgProps`.**
  - `source` is at most 131072 characters, and `alt` is required.
  - `width` and `height` are CSS pixels. Without them, the picture takes its own width up to the slot.
  - With `isInteractive`, the picture is drawn in a sandboxed frame with no scripts, where `:hover`, SMIL and `<title>`
    work. Script and event-handler attributes are stripped. Presses go on an enclosing element.
- **`Button`.** Its children are strings and `Text` only. Any other element is refused.
- **Atoms.**
  - `atom({ plugin, key }, initial)`, `read($, atom)` while drawing, and `update($, atom, fn)` from a handler.
  - `update` resolves to the new value, retries on a version miss, and redraws the readers.
  - A render hook may not write state.
- **`$` and top-level functions.** `$` may be passed only to a function declared at the top level of the file. The
  validator's words: "a function declaration, or a const bound to one", "nor one imported from a file of the module's
  own". A nested arrow that receives `$` is refused at load.
- **No local `on`.** A local variable named `on` is refused at load: `"on" is declared again (shadowed)`.
- **`.catch` on the engine's path.** A hook on the engine's own path gets `.catch(($, e, next) => next(e))`, so a failure
  never blocks the session. `claude plugin validate` lists such a hook as a "gating hook with .catch".
- **`import()`.** A module holding `import()` does not load. The types file's header says so.
- **Tests.** `claude plugin test <dir>` runs `*.test.ts(x)` against the engine. `claude-code/testing` gives `test`,
  `expect` and `mock` (`mock.clock` drives `$.clock` timers), plus `$.ui.mount(...)` with `find`, `findAll` and
  `press`. The kit has no `$.fs`.

**What this build says instead:**

- **The element set differs by surface.**
  - Desktop has all ten elements.
  - VS Code has no `Client`.
  - Mobile has no `Input`, `Select` or `Client`.
  - The terminal has no `Svg`, but it alone has `Raster` (a grid of coloured cells) and `Image` (a bitmap through the
    kitty or iTerm2 protocols). This library draws its pictures there as Rasters.
- **`RasterProps`.** These are `key`, `columns` (1 to 512), `rows` (1 to 256) and `cells`.
  - `cells` is padded base64 of `columns × rows` little-endian u32 triplets `[codePoint, foreground, background]`,
    row by row. A colour is `0x00RRGGBB`, or `0x01000000` for the terminal's own.
  - A code point must be one printable one-column BMP character, or the tree is refused, naming the cell.
  - The palette paints 1024 colour pairs at once, and the rest as their nearest.
  - `$.ui.blit({ requestId, key, cells })` repaints a mounted Raster without a redraw. A resize is a redraw.
  - The test kit's `findAll({ type: 'Raster' })` returns the props as drawn.
- **npm packages are refused, so the library ships as a folder.** A bare specifier fails at load with:
  `cannot import "pkg" (from hooks/register.tsx): a hooks module imports its own files by relative path and
  "claude-code", nothing else`. A relative path into `node_modules/` does load, but the supported way is the copied
  folder, `vendor/svg-panel/`. Relative imports with a `.ts` suffix (`'../vendor/svg-panel/index.ts'`) load.
- **`Svg` takes no `key`.** A `key` given to an `Svg` is dropped from the drawn tree. A test finds a picture by its
  `alt`, and anything you need to address goes on a keyed `Box` around it.
- **Own `ui.open` and `ui.close` hooks are not silent in the test kit.** A probe mod's own `ui.open` and `ui.close`
  hooks both ran on its own `$.ui.open` and `$.ui.close`, called from a `command.run` hook. What the engine skips is
  the hook that made the call (the re-entry rule). This was checked in the test kit only, not in a live session. A band
  that bumps an atom after its own open or close stays correct either way.
- **`ui.status` needs an answer in tests.** Nothing in the test kit answers `$.ui.status`, so a test answers it with
  `on('ui.status', () => ({ value: undefined }))`. Otherwise the call is dropped with a note.
- **Fonts and colour.** This build's types say nothing about external fonts. The pictures use the system sans stack
  everywhere and carry their own surface colour, because nothing on `e` reports the app's theme. The demo reads the
  `theme` row of `/config` at session start, and offers a button to switch.

## License

MIT, see [LICENSE](LICENSE).
