import assert from 'node:assert/strict'
import { test } from 'node:test'

import { claudeCode, decodeCells, fromBase64, gauge, terminalView, toPixels, type Driver, type TerminalView, type ViewOptions } from '../src/index.ts'

const PICTURE = gauge({ label: 'CPU', value: 42, max: 100 })

const KITTY = { TERM: 'xterm-kitty', KITTY_WINDOW_ID: '1' }
const GHOSTTY = { TERM: 'xterm-ghostty', TERM_PROGRAM: 'ghostty' }
const WINDOWS_TERMINAL = { WT_SESSION: 'a3f1' }

function image(view: TerminalView) {
  if (view.element !== 'Image') throw new Error(`a ${view.element}, not an Image`)
  return view.props
}

test('kitty and Ghostty get an Image of the picture: its pixels, box and words', () => {
  for (const env of [KITTY, GHOSTTY]) {
    const props = image(terminalView(PICTURE, { env, columns: 20, key: 'cpu' }))
    const pixels = toPixels(PICTURE, { columns: 20 })
    assert.equal(props.key, 'cpu')
    assert.equal(props.columns, pixels.columns)
    assert.equal(props.rows, pixels.rows)
    assert.equal(props.source.width, pixels.width)
    assert.equal(props.source.height, pixels.height)
    assert.deepEqual(fromBase64(props.source.rgba), pixels.data)
    assert.equal(props.alt, PICTURE.alt)
  }
})

test('any other terminal gets a Raster of the same width', () => {
  for (const env of [{}, WINDOWS_TERMINAL, { TERM: 'xterm-256color', TERM_PROGRAM: 'WezTerm' }]) {
    const view = terminalView(PICTURE, { env, columns: 20, key: 'cpu' })
    assert.equal(view.element, 'Raster')
    if (view.element !== 'Raster') return
    assert.equal(view.props.key, 'cpu')
    assert.equal(view.props.columns, 20)
    assert.equal(decodeCells(view.props.cells, view.props.columns, view.props.rows).cells.length, 20 * view.props.rows)
  }
})

test('inside tmux even kitty gets a Raster: Claude Code draws no Image there', () => {
  assert.equal(terminalView(PICTURE, { env: { ...KITTY, TMUX: '/tmp/tmux-0/default,1,0' }, columns: 20, key: 'cpu' }).element, 'Raster')
})

test('a driver named by the option or by SVG_PANEL_DRIVER is used whatever the terminal says; an unknown name is not', () => {
  assert.equal(terminalView(PICTURE, { env: WINDOWS_TERMINAL, columns: 20, key: 'cpu', prefer: 'image' }).element, 'Image')
  assert.equal(terminalView(PICTURE, { env: { ...KITTY, SVG_PANEL_DRIVER: 'raster' }, columns: 20, key: 'cpu' }).element, 'Raster')
  assert.equal(terminalView(PICTURE, { env: KITTY, columns: 20, key: 'cpu', prefer: 'sixel' }).element, 'Image')
})

test('a driver added to the list wins where it ranks highest, and the list it came from is left as it was', () => {
  const wezterm: Driver<TerminalView, ViewOptions> = {
    id: 'wezterm',
    rank: 20,
    supports: env => env.TERM_PROGRAM === 'WezTerm',
    draw: (picture, options) => claudeCode.byId('image')!.draw(picture, options),
  }
  const mine = claudeCode.add(wezterm)
  const env = { TERM_PROGRAM: 'WezTerm' }
  assert.equal(mine.pick(env).id, 'wezterm')
  assert.equal(mine.draw(PICTURE, { env, columns: 20, key: 'cpu' }).element, 'Image')
  assert.equal(mine.pick(KITTY).id, 'image')
  assert.equal(claudeCode.pick(env).id, 'raster')
  assert.deepEqual(claudeCode.list.map(d => d.id), ['image', 'raster'])
  assert.throws(() => mine.add({ ...wezterm, rank: 1 }), /a driver named wezterm is already in the list/)
})
