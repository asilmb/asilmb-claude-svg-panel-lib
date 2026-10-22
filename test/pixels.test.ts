import assert from 'node:assert/strict'
import { test } from 'node:test'

import { svgDoc, toPixels, type Pixels } from '../src/index.ts'

/** The pixel at `(x, y)` as `[r, g, b, a]`. */
function at(p: Pixels, x: number, y: number): number[] {
  const i = (y * p.width + x) * 4
  return [...p.data.subarray(i, i + 4)]
}

// 80 by 40 CSS pixels, a red rect in the middle half.
const RECT = svgDoc({ width: 80, height: 40, body: '<rect x="20" y="10" width="40" height="20" fill="#ff0000"/>' })

test('a picture becomes RGBA pixels over a box of whole cells, two rows of pixels to a column', () => {
  const p = toPixels(RECT, { columns: 10 })
  // 10 cells across, 8 CSS pixels each; a cell is twice as tall, so 40 CSS pixels take 3 rows.
  assert.equal(p.columns, 10)
  assert.equal(p.rows, 3)
  // 16 pixels across a cell and 32 down, by default.
  assert.equal(p.width, 160)
  assert.equal(p.height, 96)
  assert.equal(p.data.length, 160 * 96 * 4)
})

test('a shape keeps its own colour, and what the picture leaves bare stays clear', () => {
  const p = toPixels(RECT, { columns: 10 })
  assert.deepEqual(at(p, 80, 40), [255, 0, 0, 255])
  assert.deepEqual(at(p, 2, 2), [0, 0, 0, 0])
  // Below the picture, in the last row's spare half.
  assert.deepEqual(at(p, 80, 90), [0, 0, 0, 0])
})

test('a big box takes fewer pixels a cell, so the bytes stay within an Image', () => {
  const big = svgDoc({ width: 1600, height: 800, body: '<rect width="1600" height="800" fill="#336699"/>' })
  const p = toPixels(big, { columns: 200 })
  assert.equal(p.rows, 50)
  // 16 a cell would be 3200 pixels across and 10 MB; 5 a cell is the most within 2 MiB.
  assert.equal(p.width, 1000)
  assert.equal(p.height, 500)
  assert.ok(p.data.length <= 2 * 1024 * 1024)
  assert.deepEqual(at(p, 500, 250), [0x33, 0x66, 0x99, 255])
})

test('the box is 1 to 255 cells a side, whatever is asked', () => {
  const tall = svgDoc({ width: 10, height: 10000, body: '' })
  const p = toPixels(tall, { columns: 999 })
  assert.equal(p.columns, 255)
  assert.equal(p.rows, 255)
  assert.ok(p.width <= 2048 && p.height <= 2048)
  assert.equal(toPixels(RECT, { columns: 0 }).columns, 1)
})

test('pictures that share a tree share its 2 MiB: maxBytes thins each one to its part', () => {
  const big = svgDoc({ width: 1600, height: 800, body: '<rect width="1600" height="800" fill="#336699"/>' })
  // A tenth of 2 MiB is 209715 bytes: 1 pixel a cell is 200 by 100, 80000 bytes; 2 a cell would be 320000.
  const p = toPixels(big, { columns: 200, maxBytes: 209715 })
  assert.equal(p.width, 200)
  assert.equal(p.height, 100)
  // More than an Image takes is still an Image's 2 MiB.
  assert.equal(toPixels(big, { columns: 200, maxBytes: 1e9 }).width, 1000)
})

test('a see-through shape keeps its colour and gives its opacity to alpha', () => {
  const half = svgDoc({ width: 80, height: 40, body: '<rect x="20" y="10" width="40" height="20" fill="#ff0000" fill-opacity="0.5"/>' })
  assert.deepEqual(at(toPixels(half, { columns: 10 }), 80, 40), [255, 0, 0, 128])
})
