import assert from 'node:assert/strict'
import { test } from 'node:test'

import { sparkline, SVG_BUDGET } from '../src/index.ts'
import { assertEscaped, assertPicture, attrOf, HOSTILE, numAttr, pathEnd, pathNumbers } from './helpers.ts'

test('the line runs from the left pad to the right pad, low values low', () => {
  // 120 × 32, pads 4 left, 6 right, 5 top and bottom.
  const svg = sparkline([0, 10, 5], { width: 120, height: 32 }).svg
  const n = pathNumbers(attrOf(svg, 'spark-line', 'd'))
  assert.deepEqual(n, [4, 27, 59, 5, 114, 16])
  assert.deepEqual(pathEnd(attrOf(svg, 'spark-line', 'd')), { x: 114, y: 16 })
})

test('the latest point is marked where the line ends', () => {
  const svg = sparkline([3, 1, 4, 1, 5], { width: 100, height: 40 }).svg
  const end = pathEnd(attrOf(svg, 'spark-line', 'd'))
  assert.equal(numAttr(svg, 'spark-latest', 'cx'), end.x)
  assert.equal(numAttr(svg, 'spark-latest', 'cy'), end.y)
  assert.equal(end.y, 5)
})

test('last N keeps only the newest values', () => {
  const p = sparkline([100, 0, 1, 2], { last: 3 })
  assert.equal(p.twin, '▁▅█')
  assert.deepEqual(pathNumbers(attrOf(p.svg, 'spark-line', 'd')).slice(0, 2), [4, 27])
})

test('the dashed reference line sits at its value and widens the scale', () => {
  const svg = sparkline([0, 10], { width: 120, height: 32, reference: 20 }).svg
  assert.equal(attrOf(svg, 'spark-ref', 'stroke-dasharray'), '3 3')
  assert.deepEqual(pathNumbers(attrOf(svg, 'spark-ref', 'd')), [4, 5, 114])
  assert.equal(pathEnd(attrOf(svg, 'spark-line', 'd')).y, 16)
})

test('the twin is ▁..█ blocks', () => {
  const p = sparkline([1, 2, 3, 5, 8])
  assertPicture(p)
  assert.equal(p.twin, '▁▂▃▅█')
  assert.equal(p.alt, 'Trend: 5 values from 1 to 8, low 1, high 8')
  assert.equal(sparkline([]).twin, '')
  assert.equal(sparkline([]).alt, 'Trend: no values yet')
})

test('a long series stays inside the budget', () => {
  const p = sparkline(Array.from({ length: 200000 }, (_, i) => Math.sin(i) * 1000))
  assert.ok(p.svg.length < SVG_BUDGET / 10)
  assertPicture(p)
})

test('a hostile label is escaped', () => {
  assertEscaped(sparkline([1, 2], { label: HOSTILE }).svg)
})
