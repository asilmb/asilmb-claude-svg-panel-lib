import assert from 'node:assert/strict'
import { test } from 'node:test'

import { abbreviate, arcPath, assertBudget, bar, blocks, esc, niceMax, num, polar, scale, SVG_BUDGET, svgDoc, thin } from '../src/index.ts'
import { assertWellFormed, near, pathEnd } from './helpers.ts'

test('esc escapes & < > " and nothing else', () => {
  assert.equal(esc(`a & b < c > d "e" 'f'`), `a &amp; b &lt; c &gt; d &quot;e&quot; 'f'`)
  assert.equal(esc('&amp;'), '&amp;amp;')
})

test('num keeps two decimals and drops trailing zeros', () => {
  assert.equal(num(1.005), '1')
  assert.equal(num(12.3456), '12.35')
  assert.equal(num(-0.001), '0')
  assert.equal(num(Number.NaN), '0')
})

test('abbreviate names thousands and millions', () => {
  assert.equal(abbreviate(236000), '236k')
  assert.equal(abbreviate(12345), '12.3k')
  assert.equal(abbreviate(1500), '1.5k')
  assert.equal(abbreviate(1_200_000), '1.2M')
  assert.equal(abbreviate(42), '42')
  assert.equal(abbreviate(2.5), '2.5')
})

test('the budget passes 131072 characters and refuses one more', () => {
  assert.equal(assertBudget('x'.repeat(SVG_BUDGET)).length, SVG_BUDGET)
  assert.throws(() => assertBudget('x'.repeat(SVG_BUDGET + 1)), RangeError)
})

test('svgDoc is a well-formed document with its title escaped', () => {
  const svg = svgDoc({ width: 10, height: 20, title: 'a < b', body: '<g/>' })
  assertWellFormed(svg)
  assert.match(svg, /width="10" height="20" viewBox="0 0 10 20"/)
  assert.match(svg, /<title>a &lt; b<\/title>/)
})

test('scale maps and clamps', () => {
  const s = scale(0, 300, 0, 240)
  assert.equal(s(150), 120)
  assert.equal(s(-50), 0)
  assert.equal(s(900), 240)
  assert.equal(scale(5, 5, 1, 9)(5), 1)
})

test('polar measures degrees clockwise from twelve', () => {
  const top = polar(100, 100, 50, 0)
  near(top.x, 100, 'top x')
  near(top.y, 50, 'top y')
  const right = polar(100, 100, 50, 90)
  near(right.x, 150, 'right x')
  near(right.y, 100, 'right y')
})

test('arcPath runs clockwise and flags arcs over 180°', () => {
  const d = arcPath(100, 100, 50, -120, 120)
  assert.match(d, /A50 50 0 1 1 /)
  const end = pathEnd(d)
  near(end.x, 143.3, 'end x', 0.01)
  near(end.y, 125, 'end y')
  assert.match(arcPath(100, 100, 50, -120, 0), /A50 50 0 0 1 100 50$/)
})

test('niceMax rounds up to 1, 2, 2.5 or 5 times a power of ten', () => {
  assert.equal(niceMax(236000), 250000)
  assert.equal(niceMax(312), 500)
  assert.equal(niceMax(0), 1)
})

test('bar fills, leaves empty and places the tick', () => {
  assert.equal(bar(236, 300, { tick: 270 }), '████████████████░░│░')
  assert.equal(bar(0, 10, { width: 5 }), '░░░░░')
  assert.equal(bar(10, 10, { width: 5, tick: 10 }), '████│')
  assert.equal(bar(50, 100, { width: 4, min: 0 }), '██░░')
  // The tick takes the nearest cell: 3.6 of 10 is cell 4, not cell 3.
  assert.equal(bar(0, 10, { width: 10, tick: 3.6 }), '░░░░│░░░░░')
})

test('blocks steps from ▁ to █ and thins to a width', () => {
  assert.equal(blocks([0, 1, 2, 3, 4, 5, 6, 7]), '▁▂▃▄▅▆▇█')
  assert.equal(blocks([3, 3, 3]), '▄▄▄')
  assert.equal(blocks([]), '')
  assert.equal(blocks(Array.from({ length: 100 }, (_, i) => i), { width: 10 }).length, 10)
})

test('thin keeps the ends, the kept steps and no more than asked', () => {
  assert.deepEqual(thin(5, 10), [0, 1, 2, 3, 4])
  assert.deepEqual(thin(101, 3), [0, 50, 100])
  assert.deepEqual(thin(101, 3, [7]), [0, 7, 50, 100])
})
