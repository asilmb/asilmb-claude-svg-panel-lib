import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dark, meter, type Zone } from '../src/index.ts'
import { assertEscaped, assertPicture, attrOf, HOSTILE, numAttr, pathNumbers, textOf } from './helpers.ts'

const ZONES: Zone[] = [
  { upTo: 70, status: 'good' },
  { upTo: 90, status: 'warning' },
  { upTo: 100, status: 'critical' },
]

test('the fill is as wide as the value on a 200px track', () => {
  const svg = meter({ value: 50, max: 200 }, { width: 212 }).svg
  assert.equal(numAttr(svg, 'meter-track', 'width'), 200)
  assert.equal(numAttr(svg, 'meter-fill', 'x'), 6)
  assert.equal(numAttr(svg, 'meter-fill', 'width'), 50)
  assert.equal(numAttr(meter({ value: 500, max: 200 }, { width: 212 }).svg, 'meter-fill', 'width'), 200)
  assert.doesNotMatch(meter({ value: 0, max: 200 }).svg, /meter-fill/)
})

test('the tick stands at its value across the track', () => {
  const svg = meter({ value: 50, max: 200, tick: 150 }, { width: 212 }).svg
  assert.deepEqual(pathNumbers(attrOf(svg, 'meter-tick', 'd')), [156, 19, 33])
  const bare = meter({ value: 50, max: 200, tick: 150 }, { width: 212, showText: false }).svg
  assert.deepEqual(pathNumbers(attrOf(bare, 'meter-tick', 'd')), [156, 6, 20])
})

test('the fill takes the colour of the zone the value is in, and says its word', () => {
  const at = (value: number) => meter({ value, max: 100, zones: ZONES }, { theme: dark })
  assert.equal(attrOf(at(40).svg, 'meter-fill', 'fill'), dark.status.good)
  assert.equal(attrOf(at(82).svg, 'meter-fill', 'fill'), dark.status.warning)
  assert.equal(attrOf(at(95).svg, 'meter-fill', 'fill'), dark.status.critical)
  assert.equal(textOf(at(82).svg, 'meter-figures'), '82 / 100 · warning')
  // A zone holds its own upper bound.
  assert.equal(attrOf(at(70).svg, 'meter-fill', 'fill'), dark.status.good)
  assert.equal(attrOf(at(71).svg, 'meter-fill', 'fill'), dark.status.warning)
  assert.equal(attrOf(at(90).svg, 'meter-fill', 'fill'), dark.status.warning)
  assert.equal(attrOf(at(90.5).svg, 'meter-fill', 'fill'), dark.status.critical)
  assert.equal(attrOf(meter({ value: 5, max: 10 }, { theme: dark }).svg, 'meter-fill', 'fill'), dark.series.blue)
})

test('the twin is the bar with its figures', () => {
  const p = meter({ value: 82, max: 100, tick: 90, label: 'Window', zones: ZONES })
  assertPicture(p)
  assert.equal(p.twin, 'Window ████████████████░░│░ 82 / 100 warning')
  assert.equal(p.alt, 'Window: 82 of 100, warning; mark at 90')
  assert.equal(meter({ value: 1, max: 4 }).twin, '█████░░░░░░░░░░░░░░░ 1 / 4')
})

test('a hostile label is escaped', () => {
  assertEscaped(meter({ value: 1, max: 2, label: HOSTILE, zones: ZONES, statusWord: HOSTILE }).svg)
})
