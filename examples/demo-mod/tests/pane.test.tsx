import { expect, mock, test } from 'claude-code/testing'

import { decodeCells, fromBase64, gridText } from '../vendor/svg-panel/index.ts'

const PANE = {
  plugin: 'svg-panel-demo',
  component: 'Pane',
  requestId: 'svg-panel-demo',
  props: {
    title: 'svg-panel',
    isFocused: false,
    bodyColumns: 80,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const APPS = ['desktop', 'vscode', 'mobile'] as const

type Mounted = { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }

/** The letters a mounted Raster shows, a line a row: its labels among the block and braille cells. */
async function rasterText(ui: Mounted, key: string): Promise<string> {
  const found = (await ui.findAll({ type: 'Raster' })).find(r => r.props.key === key)
  if (!found) return ''
  const { cells, columns, rows } = found.props as { cells: string; columns: number; rows: number }
  return gridText(decodeCells(cells, columns, rows))
}

/** An Svg takes no key: a picture is found by what its alt says. */
async function svg(ui: Mounted, alt: RegExp) {
  return (await ui.findAll({ type: 'Svg' })).find(found => alt.test(String(found.props.alt)))
}

test('the apps draw every picture as an Svg with its alt', async $ => {
  for (const surface of APPS) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const pictures = await ui.findAll({ type: 'Svg' })
    // two gauges, four tiles, the chart, the four by host, three meters, a sparkline, six hosts, the legend, seven icons
    expect(pictures).toHaveLength(29)
    for (const found of pictures) {
      expect(String(found.props.source)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
      expect(String(found.props.alt).length).toBeGreaterThan(0)
    }
    expect(await svg(ui, /^Throughput: 1182 of 2000, ok; threshold 1600$/)).toBeDefined()
    expect(await svg(ui, /^Latency p95: 158 ms of 600 ms, ok; threshold 300 ms$/)).toBeDefined()
    expect((await svg(ui, /^requests\/s over 40 steps/))?.props.isInteractive).toBe(true)
    expect(await svg(ui, /^Hosts: 6 items, 4 ok, 1 warning, 1 serious; serious: batch$/)).toBeDefined()
    expect(await svg(ui, /^Traffic share: total 1182; /)).toBeDefined()
    await ui.unmount()
  }
})

test('the terminal draws the pictures as Rasters, with their labels in letters', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  const rasters = await ui.findAll({ type: 'Raster' })
  // two gauges, the chart, the four by host, four tiles, three meters, a sparkline
  expect(rasters.map(r => r.props.key)).toEqual([
    'throughput', 'latency', 'requests', 'host-load', 'traffic-share', 'host-heat', 'host-grid',
    'tile-0', 'tile-1', 'tile-2', 'tile-3', 'meter-0', 'meter-1', 'meter-2', 'latency-trend',
  ])
  for (const r of rasters) {
    const { cells, columns, rows } = r.props as { cells: string; columns: number; rows: number }
    expect(columns).toBeLessThanOrEqual(PANE.props.bodyColumns)
    expect(decodeCells(cells, columns, rows).cells).toHaveLength(columns * rows)
  }
  expect(rasters[0]?.props).toMatchObject({ columns: 29, rows: 11 })
  const gauge = await rasterText(ui, 'throughput')
  for (const words of ['1182', 'of 2000', '1600', ' 0 ', 'ok']) expect(gauge).toContain(words)
  expect(gauge).toMatch(/[▀▄▌▐▖▗▘▝▚▞▙▛▜▟█]/)
  const chart = await rasterText(ui, 'requests')
  for (const words of ['requests/s', 'deploy', 'incident', 'redline 1600', '#40']) expect(chart).toContain(words)
  // The hover tooltips are hidden by the picture's CSS, and stay hidden here.
  expect(chart).not.toContain('#1 ·')
  expect(await rasterText(ui, 'tile-1')).toMatch(/Hosts[\s\S]*4\/6/)
  expect(await rasterText(ui, 'meter-1')).toContain('74% / 100% · warning')
  for (const host of ['web-1', 'api-1', 'batch']) expect(await rasterText(ui, 'host-grid')).toContain(host)
  expect(await rasterText(ui, 'traffic-share')).toContain('1182')
  expect(await ui.find({ type: 'Text', text: '● online  ◐ idle  ○ offline  ▲ rising  ▼ falling  ⚑ alert  ✕ failed' })).toBeDefined()
  await ui.unmount()
})

test('in kitty the terminal draws the same pictures as Images of pixels, with their alt', async ($, on) => {
  mock.env(on, { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Raster' })).toHaveLength(0)
  const images = await ui.findAll({ type: 'Image' })
  expect(images.map(i => i.props.key)).toEqual([
    'throughput', 'latency', 'requests', 'host-load', 'traffic-share', 'host-heat', 'host-grid',
    'tile-0', 'tile-1', 'tile-2', 'tile-3', 'meter-0', 'meter-1', 'meter-2', 'latency-trend',
  ])
  let bytes = 0
  for (const i of images) {
    const { source, columns } = i.props as { source: { rgba: string; width: number; height: number }; columns: number }
    expect(columns).toBeLessThanOrEqual(PANE.props.bodyColumns)
    expect(fromBase64(source.rgba)).toHaveLength(source.width * source.height * 4)
    bytes += source.width * source.height * 4
  }
  // One tree's Images share 2 MiB.
  expect(bytes).toBeLessThanOrEqual(2 * 1024 * 1024)
  // The gauge keeps the Raster's box: 29 cells by 11.
  expect(images[0]?.props).toMatchObject({ columns: 29, rows: 11, alt: 'Throughput: 1182 of 2000, ok; threshold 1600' })
  await ui.unmount()
})

for (const [why, extra] of [['inside tmux', { TMUX: '/tmp/tmux-0/default,1,0' }], ['with SVG_PANEL_DRIVER=raster', { SVG_PANEL_DRIVER: 'raster' }]] as const) {
  test(`${why}, kitty gets Rasters again`, async ($, on) => {
    mock.env(on, { TERM: 'xterm-kitty', ...extra })
    const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
    expect(await ui.findAll({ type: 'Image' })).toHaveLength(0)
    expect(await ui.findAll({ type: 'Raster' })).toHaveLength(15)
    await ui.unmount()
  })
}

test('a press redraws the pane on the app and on the terminal', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'reset' })
    await ui.press({ key: 'sample' })
    if (surface === 'desktop') {
      expect(await svg(ui, /^requests\/s over 1 steps/)).toBeDefined()
    } else {
      expect(await rasterText(ui, 'throughput')).toContain('of 2000')
      expect(await rasterText(ui, 'tile-1')).toContain('6/6')
      expect(await rasterText(ui, 'requests')).not.toContain('incident')
    }
    await ui.press({ key: 'incident' })
    if (surface === 'terminal') expect(await rasterText(ui, 'requests')).toContain('incident')
    else expect(await svg(ui, /events: 1 incident$/)).toBeDefined()
    await ui.press({ key: 'host:2' })
    if (surface === 'terminal') expect(await rasterText(ui, 'tile-1')).toContain('5/6')
    else expect(await svg(ui, /^web-3 idle$/)).toBeDefined()
    await ui.unmount()
  }
})

test('a host button cycles online, idle, offline, failed, and its glyph follows', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  const glyphColor = async () => {
    const button = await ui.find({ type: 'Button', key: 'host:0' })
    const glyph = (button?.children ?? []).find(c => typeof c === 'object' && c !== null && (c as { type?: string }).type === 'Text')
    return { text: button?.text, color: (glyph as { props: { color?: string } } | undefined)?.props.color }
  }
  expect(await glyphColor()).toEqual({ text: '● web-1', color: 'success' })
  await ui.press({ key: 'host:0' })
  expect(await glyphColor()).toEqual({ text: '◐ web-1', color: 'merged' })
  await ui.press({ key: 'host:0' })
  await ui.press({ key: 'host:0' })
  expect(await glyphColor()).toEqual({ text: '✕ web-1', color: 'error' })
  expect(await svg(ui, /^web-1 failed$/)).toBeDefined()
  await ui.unmount()
})

test('live mode samples on the clock until paused', async ($, on) => {
  const clock = mock.clock(on)
  on('ui.status', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('command.register', () => ({ value: { command: 'svg-panel' } }))
  on('config.list', () => ({ value: [] }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await clock.advance(5000)
  expect(await svg(ui, /^requests\/s over 40 steps/)).toBeDefined()

  await ui.press({ key: 'live' })
  expect((await ui.find({ type: 'Button', key: 'live' }))?.text).toBe('pause')
  await clock.advance(4000)
  expect(await svg(ui, /^requests\/s over 42 steps/)).toBeDefined()

  await ui.press({ key: 'live' })
  await clock.advance(4000)
  expect(await svg(ui, /^requests\/s over 42 steps/)).toBeDefined()
  await ui.unmount()
})

test('the theme button repaints the pictures for a light app', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(String((await svg(ui, /^Throughput: /))?.props.source)).toContain('fill="#1a1a19"')
  await ui.press({ key: 'theme' })
  expect(String((await svg(ui, /^Throughput: /))?.props.source)).toContain('fill="#fcfcfb"')
  await ui.unmount()
})
