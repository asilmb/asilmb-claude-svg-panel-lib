import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dotRow, icon, meter, sparkline, statTile, svgSize, timeline } from '../src/index.ts'
import { assertEscaped, assertPicture, assertWellFormed, HOSTILE, textOf } from './helpers.ts'

test('label and value, with the body placed below them', () => {
  const body = sparkline([1, 3, 2, 5], { width: 120, height: 32 })
  const p = statTile({ label: 'Requests', value: 236000, body }, { width: 200 })
  assertPicture(p)
  assert.equal(textOf(p.svg, 'tile-label'), 'Requests')
  assert.equal(textOf(p.svg, 'tile-value'), '236k')
  assert.match(p.svg, /<g class="tile-body"><svg x="12" y="64" xmlns=/)
  assert.deepEqual(svgSize(p.svg), { width: 200, height: 64 + 32 + 12 })
})

test('a body wider than the tile is scaled down to fit, keeping its shape', () => {
  const p = statTile({ label: 'CPU', value: '82%', body: meter({ value: 82, max: 100 }, { width: 352 }) }, { width: 200 })
  const inner = /<svg x="12" y="64"[^>]*>/.exec(p.svg)![0]
  assert.match(inner, /width="176"/)
  assert.match(inner, /height="19.5"/, '39 × 176/352')
})

test('the twin joins the tile and its body', () => {
  assert.equal(statTile({ label: 'Requests', value: 236000, body: sparkline([1, 2, 3, 5, 8]) }).twin, 'Requests 236k  ▁▂▃▅█')
  assert.equal(statTile({ label: 'Trend', value: 'up', body: icon('rising') }).twin, 'Trend up  ▲')
  assert.equal(statTile({ label: 'Budget', value: '$1.20', status: 'warning' }).twin, 'Budget $1.20 warning')
  assert.equal(statTile({ label: 'Hosts', value: 2, unit: 'up', body: dotRow(['online', 'idle', 'offline', 'failed']) }).twin, 'Hosts 2 up  ●◐○✕')
})

test('the body sets whether the tile is interactive', () => {
  assert.equal(statTile({ label: 'a', value: 1, body: sparkline([1, 2]) }).isInteractive, false)
  assert.equal(statTile({ label: 'a', value: 1, body: timeline({ values: [1, 2] }) }).isInteractive, true)
})

test('a fragment body is drawn from the body origin at the height given', () => {
  const p = statTile({ label: 'a', value: 1, body: '<circle r="3"/>' }, { bodyHeight: 10 })
  assertWellFormed(p.svg)
  assert.match(p.svg, /<g class="tile-body" transform="translate\(12 64\)"><circle r="3"\/><\/g>/)
  assert.equal(svgSize(p.svg)?.height, 64 + 10 + 12)
  assert.equal(p.twin, 'a 1')
})

test('dotRow draws one icon per name, its twin the glyphs', () => {
  const p = dotRow(['online', 'online', 'idle'], { r: 6, gap: 4 })
  assertPicture(p)
  assert.deepEqual(svgSize(p.svg), { width: 3 * 16 + 4, height: 20 })
  assert.equal((p.svg.match(/class="icon-online"/g) ?? []).length, 2)
  assert.equal(p.alt, '2 online, 1 idle')
})

test('hostile labels are escaped', () => {
  assertEscaped(statTile({ label: HOSTILE, value: HOSTILE, unit: HOSTILE, status: 'good', statusWord: HOSTILE }).svg)
})
