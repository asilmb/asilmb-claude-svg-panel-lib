import { expect, mock, test } from 'claude-code/testing'

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

/** An Svg takes no key: a picture is found by what its alt says. */
async function svg(ui: Mounted, alt: RegExp) {
  return (await ui.findAll({ type: 'Svg' })).find(found => alt.test(String(found.props.alt)))
}

test('the apps draw every picture as an Svg with its alt', async $ => {
  for (const surface of APPS) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const pictures = await ui.findAll({ type: 'Svg' })
    // two gauges, four tiles, the chart, three meters, a sparkline, six hosts, the legend, seven icons
    expect(pictures).toHaveLength(25)
    for (const found of pictures) {
      expect(String(found.props.source)).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
      expect(String(found.props.alt).length).toBeGreaterThan(0)
    }
    expect(await svg(ui, /^Throughput: 1182 of 2000, ok; threshold 1600$/)).toBeDefined()
    expect(await svg(ui, /^Latency p95: 158 ms of 600 ms, ok; threshold 300 ms$/)).toBeDefined()
    expect((await svg(ui, /^requests\/s over 40 steps/))?.props.isInteractive).toBe(true)
    await ui.unmount()
  }
})

test('the terminal prints the twins, and no Svg', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(0)
  expect((await ui.find({ type: 'Text', text: /^Throughput / }))?.text).toBe('Throughput 1182 / 2000 ████████████░░░░│░░░ ok')
  expect(await ui.find({ type: 'Text', text: /◆ deploy ×1 \(#12\) · ■ incident ×1 \(#26\)/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Hosts 4/6 online  ●●●◐●○' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^Memory ███████████████░░│░░ 74% \/ 100% warning$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '● online  ◐ idle  ○ offline  ▲ rising  ▼ falling  ⚑ alert  ✕ failed' })).toBeDefined()
  await ui.unmount()
})

test('a press redraws the pane on the app and on the terminal', async ($, on) => {
  on('ui.status', () => ({ value: undefined }))
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'reset' })
    await ui.press({ key: 'sample' })
    if (surface === 'desktop') {
      expect(await svg(ui, /^requests\/s over 1 steps/)).toBeDefined()
    } else {
      expect(await ui.find({ type: 'Text', text: /^Throughput \d+ \/ 2000/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /^Hosts 6\/6 online  ●●●●●●$/ })).toBeDefined()
    }
    await ui.press({ key: 'incident' })
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /■ incident ×1 \(#1\)/ })).toBeDefined()
    else expect(await svg(ui, /events: 1 incident$/)).toBeDefined()
    await ui.press({ key: 'host:2' })
    if (surface === 'terminal') expect(await ui.find({ type: 'Text', text: /^Hosts 5\/6 online  ●●◐●●●$/ })).toBeDefined()
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
