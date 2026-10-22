import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DemoState } from '../types'
import type { TerminalEnv, TerminalView } from '../vendor/svg-panel/index.ts'
import { apply, draw, HOST_NAMES, nextStatus, seed, simulateMeasure, terminalScene, type DemoEvent } from './scene.ts'

const PANE = 'svg-panel-demo'
/** How often the live mode takes a sample, in milliseconds. */
const TICK_MS = 2000

const service = atom({ plugin: 'svg-panel-demo', key: 'state' } as const, seed())
const theme = atom({ plugin: 'svg-panel-demo', key: 'theme' } as const, 'dark')
const isLive = atom({ plugin: 'svg-panel-demo', key: 'isLive' } as const, false)

/**
 * Changes the state from its value at write time (two quick presses both
 * land); the write redraws every reader, and the status line shows the twin.
 */
async function change($: EngineInterface, fn: (state: DemoState) => DemoState): Promise<void> {
  const next = await update($, service, fn)
  $.ui.status(draw(next, 'dark').throughput.twin)
}

async function send($: EngineInterface, ev: DemoEvent): Promise<void> {
  await change($, state => apply(state, ev))
}

/** The live mode's tick: one more sample while live is on. */
async function tick($: EngineInterface): Promise<void> {
  if (await read($, isLive)) await change($, s => apply(s, simulateMeasure(s)))
}

/**
 * What the drivers judge the terminal by. `$.env.get` takes each name as a
 * literal, so they are spelt out: svg-panel's TERMINAL_ENV. One it cannot
 * read is unset, so the picture falls back to a Raster.
 */
async function terminalEnv($: EngineInterface): Promise<TerminalEnv> {
  const [TERM, TERM_PROGRAM, KITTY_WINDOW_ID, TMUX, SVG_PANEL_DRIVER] = await Promise.all([
    $.env.get('TERM').catch(() => undefined),
    $.env.get('TERM_PROGRAM').catch(() => undefined),
    $.env.get('KITTY_WINDOW_ID').catch(() => undefined),
    $.env.get('TMUX').catch(() => undefined),
    $.env.get('SVG_PANEL_DRIVER').catch(() => undefined),
  ])
  return { TERM, TERM_PROGRAM, KITTY_WINDOW_ID, TMUX, SVG_PANEL_DRIVER }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'svg-panel', description: 'Show the svg-panel demo pane' })
    // The pictures follow the theme `/config` names.
    const rows = await $.config.list().catch(() => [])
    const chosen = rows.find(row => row.key === 'theme')?.value
    if (typeof chosen === 'string' && chosen.includes('light')) await update($, theme, () => 'light')
    $.clock.every(TICK_MS, () => void tick($))
    void $.ui.open({ id: PANE, title: 'svg-panel' })

    return next(e)
  })

  on('command.run', { command: 'svg-panel' }, async $ => {
    const opened = await $.ui.open({ id: PANE, title: 'svg-panel' })

    return {
      text: opened.isPlaced
        ? 'svg-panel demo pane opened.'
        : `svg-panel demo pane is open but not drawn here: ${opened.reason}`,
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const state = await read($, service)
    const live = await read($, isLive)
    const themeName = await read($, theme)
    const scene = draw(state, themeName)
    const press = (ev: DemoEvent) => () => send($, ev)
    const sample = () => change($, s => apply(s, simulateMeasure(s)))
    const toggleLive = () => update($, isLive, was => !was)
    const hostPress = (i: number) => () =>
      change($, s => apply(s, { event: 'status', host: i, status: nextStatus(s.hosts[i] ?? 'online') }))
    const hostName = (i: number) => HOST_NAMES[i] ?? `host ${i + 1}`

    if (e.surface === 'terminal') {
      // The terminal draws no Svg: each picture comes as an Image of pixels
      // where the terminal draws them (kitty, Ghostty), else as a Raster, its
      // shapes in block and braille cells and its labels in letters.
      const { Box, Text, Button, Raster, Image } = $.ui.resolve(e)
      const views = terminalScene(scene, themeName, e.props.bodyColumns, await terminalEnv($))
      const show = (v: TerminalView) => (v.element === 'Image' ? <Image {...v.props} /> : <Raster {...v.props} />)

      return (
        <Box flexDirection="column" gap="md">
          <Box flexDirection="row" flexWrap="wrap" gap="sm">
            {views.gauges.map(show)}
          </Box>
          {show(views.requests)}
          <Box flexDirection="row" flexWrap="wrap" gap="sm">
            {views.breakdown.map(show)}
          </Box>
          <Box flexDirection="row" flexWrap="wrap" gap="sm">
            {views.tiles.map(show)}
          </Box>
          <Box flexDirection="row" flexWrap="wrap" gap="sm">
            <Box flexDirection="column">
              {views.meters.map(show)}
            </Box>
            <Box flexDirection="column">
              <Text dimColor>Latency p95</Text>
              {show(views.sparkline)}
            </Box>
          </Box>
          <Box flexDirection="row" flexWrap="wrap" gap="xs">
            {scene.hosts.map((pic, i) => (
              <Button key={`host:${i}`} onPress={hostPress(i)}>
                <Text color={pic.textColor}>{pic.glyph}</Text> {hostName(i)}
              </Button>
            ))}
          </Box>
          <Text dimColor>{scene.legend.twin}</Text>
          <Box flexDirection="row" flexWrap="wrap" gap="xs">
            <Button key="sample" variant="primary" onPress={sample}>+ sample</Button>
            <Button key="deploy" onPress={press({ event: 'marker', kind: 'deploy' })}>deploy</Button>
            <Button key="incident" onPress={press({ event: 'marker', kind: 'incident' })}>incident</Button>
            <Button key="live" onPress={toggleLive}>{live ? 'pause' : 'live'}</Button>
            <Button key="reset" onPress={press({ event: 'reset' })}>reset</Button>
          </Box>
        </Box>
      )
    }

    const { Box, Text, Button, Svg } = $.ui.resolve(e)
    const isLight = themeName === 'light'

    return (
      <Box flexDirection="column" gap="md">
        <Box flexDirection="row" flexWrap="wrap" gap="md">
          <Svg source={scene.throughput.svg} alt={scene.throughput.alt} />
          <Svg source={scene.latency.svg} alt={scene.latency.alt} />
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap="sm">
          {scene.tiles.map(tile => (
            <Svg source={tile.svg} alt={tile.alt} isInteractive={tile.isInteractive} />
          ))}
        </Box>
        <Svg source={scene.requests.svg} alt={scene.requests.alt} isInteractive={scene.requests.isInteractive} />
        <Box flexDirection="row" flexWrap="wrap" gap="md">
          {scene.breakdown.map(p => (
            <Svg source={p.svg} alt={p.alt} />
          ))}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap="sm">
          <Button key="sample" variant="primary" onPress={sample}>+ sample</Button>
          <Button key="deploy" onPress={press({ event: 'marker', kind: 'deploy' })}>deploy</Button>
          <Button key="incident" onPress={press({ event: 'marker', kind: 'incident' })}>incident</Button>
          <Button key="live" onPress={toggleLive}>{live ? 'pause' : 'live'}</Button>
          <Button key="reset" onPress={press({ event: 'reset' })}>reset</Button>
          <Button key="theme" onPress={() => update($, theme, t => (t === 'light' ? 'dark' : 'light'))}>
            {isLight ? 'dark pictures' : 'light pictures'}
          </Button>
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap="md">
          <Box flexDirection="column" gap="sm">
            {scene.meters.map(m => (
              <Svg source={m.svg} alt={m.alt} />
            ))}
          </Box>
          <Svg source={scene.sparkline.svg} alt={scene.sparkline.alt} />
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap="sm">
          {scene.hosts.map((pic, i) => (
            <Box key={`host-${i}`} flexDirection="row" gap="xs" alignItems="center">
              <Svg source={pic.svg} alt={pic.alt} />
              <Button key={`host:${i}`} onPress={hostPress(i)}>
                <Text color={pic.textColor}>{pic.glyph}</Text> {hostName(i)}
              </Button>
            </Box>
          ))}
        </Box>
        <Svg source={scene.legend.svg} alt={scene.legend.alt} />
        <Box flexDirection="row" flexWrap="wrap" gap="sm">
          {scene.icons.map(pic => (
            <Box key={`icon-${pic.alt}`} flexDirection="row" gap="xs" alignItems="center">
              <Svg source={pic.svg} alt={pic.alt} />
              <Text color={pic.textColor}>{pic.glyph}</Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
