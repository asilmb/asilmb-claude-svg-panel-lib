import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dark, legend, legendMarkup, legendTwin, type LegendItem } from '../src/index.ts'
import { assertEscaped, assertPicture, HOSTILE } from './helpers.ts'

const ITEMS: LegendItem[] = [
  { label: 'requests', color: '#3987e5' },
  { label: 'deploy', color: '#d95926', mark: 'diamond' },
  { label: 'incident', color: '#199e70', mark: 'square' },
  { label: 'online', mark: { icon: 'online' } },
]

test('the twin names each swatch with its glyph', () => {
  assert.equal(legendTwin(ITEMS), '─ requests  ◆ deploy  ■ incident  ● online')
  const p = legend(ITEMS)
  assertPicture(p)
  assert.equal(p.twin, legendTwin(ITEMS))
  assert.equal(p.alt, 'Legend: requests, deploy, incident, online')
})

test('a swatch per item, in its colour and shape, its label beside it', () => {
  const { markup } = legendMarkup(ITEMS, 0, 0, 1000, dark)
  assert.match(markup, /<path d="M0 9H14" stroke="#3987e5" stroke-width="2"/)
  assert.match(markup, /<path d="M[^"]+Z" fill="#d95926"/)
  assert.match(markup, /<rect [^>]*fill="#199e70"/)
  assert.match(markup, /class="icon-online"/)
  assert.equal((markup.match(/<text /g) ?? []).length, 4)
})

test('the items wrap into rows at the width given', () => {
  assert.equal(legendMarkup(ITEMS, 0, 0, 1000, dark).height, 18)
  assert.equal(legendMarkup(ITEMS, 0, 0, 90, dark).height, 18 * 4)
  assert.equal(legendMarkup([], 0, 0, 90, dark).height, 0)
})

test('a hostile label is escaped', () => {
  assertEscaped(legend([{ label: HOSTILE }]).svg)
})
