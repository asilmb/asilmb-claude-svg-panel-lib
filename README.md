# svg-panel

Pictures for Claude Code mod panels: speedometer gauges, meters, sparklines, timelines, stat tiles, status icons and
legends. Every picture is a pure function, data in, a `Picture` out:

```ts
type Picture = { svg: string; alt: string; twin: string; isInteractive: boolean }
```

`svg` goes into the platform's `Svg` element on the desktop app, VS Code and mobile; `alt` is that element's required
words; `isInteractive` is its flag. The terminal draws no `Svg`, so a mod prints `twin` there instead: a plain-text form
of the same picture (a `█░│` bar for a meter, `▁▂▃▅▇` blocks for a sparkline, a glyph for an icon).

ES module TypeScript, no DOM, no Node APIs, no runtime packages. Every string that reaches the markup is escaped, every
picture is checked against the `Svg` size limit, and every colour comes from one `Theme` with a dark and a light set.

- `src/`: the library
- `examples/demo-mod/`: a service monitor in a pane, with every component, redrawn from atoms, twins on the terminal
- `demo/index.html`: every component in both themes, driven by an event simulator. It opens from a double click.

## Adding a speedometer to your mod

A hooks module imports only its own files and `'claude-code'` (see [platform facts](#platform-facts)), so the library is a
folder you copy into your mod:

```sh
cp -r path/to/svg-panel/src  my-mod/vendor/svg-panel
```

Your mod's `tsconfig.json` needs `"allowImportingTsExtensions": true`, because the library's files import each other
with their `.ts` names. `examples/demo-mod/tsconfig.json` is a complete one.

`hooks/register.tsx`:

```tsx
import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import { gauge } from '../vendor/svg-panel/index.ts'

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
      const { Box, Text, Button } = $.ui.resolve(e)
      return (
        <Box flexDirection="column">
          <Text>{picture.twin}</Text>
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

### Helpers

- `esc` escapes `& < > "`.
- `assertBudget` throws past 131072 characters (`SVG_BUDGET`).
- `abbreviate` shortens a number: `1240` becomes `1.2k`, `1200000` becomes `1.2M`.
- `bar` and `blocks` make the twins.
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
- CPU, memory and error meters, and a latency sparkline against its 250 ms target;
- six hosts, each an icon beside a `Button` that cycles it through online, idle, offline and failed;
- the legend of the icon set.

How it is built:

- `hooks/scene.ts` holds the state, the events that change it, and `draw(state, theme)`, which returns every picture.
  It is pure, and `demo/index.html` runs the same file.
- `hooks/register.tsx` keeps the state in atoms. The pane's buttons send the events: a new sample, a deploy or
  incident marker, a host status change, a reset, and a dark/light switch. A `live` button turns on a `$.clock.every`
  timer that adds a sample every two seconds.
- The apps draw the pictures as `Svg` elements. The terminal prints the twins in `Text` and shows the throughput
  gauge's twin in the status line.
- It starts from a seeded history, so every picture has something to show.
- `/svg-panel` opens the pane.

To try it, either run `claude --plugin-dir examples/demo-mod`, or copy the folder into a session's mods folder.

`claude plugin validate examples/demo-mod` passes, and `claude plugin test examples/demo-mod` runs
`tests/pane.test.tsx`. Those tests check that the apps draw 25 `Svg` elements with their alts, that the terminal prints
the twins and no `Svg`, that a press redraws on the desktop and the terminal, that a host button cycles its status and
glyph colour, that live mode samples on a mocked clock until paused, and that the theme switch repaints.

## The demo page

`demo/index.html` imports nothing: `scripts/build.mjs` inlines a copy of the built library and the demo's `scene.ts`.

- It draws each picture the way the app does: an `<img>` from a `data:` URL, or a `sandbox=""` `<iframe srcdoc>` when
  the picture is interactive. The timeline's hover works in that frame.
- It shows each component in a dark and a light column (or one of them), with its twin under it.
- It renders a terminal view of the pane.
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

`npm run mutate` applies 23 deliberate breakages, one at a time, and every one turns a test red.

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
    kitty or iTerm2 protocols). A terminal pane could draw a sparkline as a `Raster`; this library uses text twins.
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

MIT
