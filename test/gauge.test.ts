import assert from 'node:assert/strict'
import { test } from 'node:test'

import { gauge, light } from '../src/index.ts'
import { assertEscaped, assertPicture, attrOf, HOSTILE, near, pathEnd, pathNumbers, textOf } from './helpers.ts'

test('the value arc ends where the value sits on the 240° sweep', () => {
  // 150 of 300 is half way: straight up from the centre (116, 96), r 72.
  const half = gauge({ value: 150, max: 300 }).svg
  const end = pathEnd(attrOf(half, 'gauge-value', 'd'))
  near(end.x, 116, 'x at half')
  near(end.y, 24, 'y at half')

  // The arc starts at -120°: (116 - 72 sin 120°, 96 + 72 cos 120°... below the centre).
  const start = pathNumbers(attrOf(half, 'gauge-value', 'd'))
  near(start[0]!, 53.65, 'start x')
  near(start[1]!, 132, 'start y')

  // Full scale ends at +120°.
  const full = pathEnd(attrOf(gauge({ value: 300, max: 300 }).svg, 'gauge-value', 'd'))
  near(full.x, 178.35, 'x at max')
  near(full.y, 132, 'y at max')
})

test('the track spans the full 240° and an empty gauge draws no value arc', () => {
  const svg = gauge({ value: 0, max: 300 }).svg
  assert.match(attrOf(svg, 'gauge-track', 'd'), /A72 72 0 1 1 178\.35 132$/)
  assert.doesNotMatch(svg, /gauge-value/)
})

test('the threshold tick points along its angle', () => {
  // 270 of 300 sits at -120 + 0.9 × 240 = 96°.
  const n = pathNumbers(attrOf(gauge({ value: 100, max: 300, threshold: 270 }).svg, 'gauge-tick', 'd'))
  const angle = (x: number, y: number) => (Math.atan2(x - 116, 96 - y) * 180) / Math.PI
  near(angle(n[0]!, n[1]!), 96, 'inner end angle', 0.1)
  near(angle(n[2]!, n[3]!), 96, 'outer end angle', 0.1)
  near(Math.hypot(n[2]! - 116, n[3]! - 96), 81, 'outer radius', 0.05)
})

test('the hero figure, the status word and the twin', () => {
  const p = gauge({ value: 1240, max: 2000, threshold: 1600, label: 'Throughput' })
  assertPicture(p)
  assert.equal(textOf(p.svg, 'gauge-hero'), '1.2k')
  assert.equal(textOf(p.svg, 'gauge-word'), 'ok')
  assert.equal(p.twin, 'Throughput 1.2k / 2k ████████████░░░░│░░░ ok')
  assert.equal(p.alt, 'Throughput: 1.2k of 2k, ok; threshold 1.6k')
  const ms = gauge({ value: 182, max: 500, label: 'Latency' }, { format: n => `${n} ms` })
  assert.equal(textOf(ms.svg, 'gauge-hero'), '182 ms')
  assert.equal(ms.twin, 'Latency 182 ms / 500 ms ███████░░░░░░░░░░░░░ ok')
  assert.equal(p.isInteractive, false)
})

test('status follows the threshold and the max, and colours the arc and dot', () => {
  const warn = gauge({ value: 280, max: 300, threshold: 270 }, { theme: light })
  assert.equal(textOf(warn.svg, 'gauge-word'), 'warning')
  assert.equal(attrOf(warn.svg, 'gauge-value', 'stroke'), light.status.warning)
  assert.equal(attrOf(warn.svg, 'gauge-dot', 'fill'), light.status.warning)
  assert.equal(textOf(gauge({ value: 300, max: 300 }).svg, 'gauge-word'), 'critical')
  assert.equal(textOf(gauge({ value: 3, max: 300, status: 'serious', statusWord: 'hot' }).svg, 'gauge-word'), 'hot')
})

test('a hostile label or word is escaped', () => {
  const p = gauge({ value: 1, max: 2, threshold: 1, thresholdLabel: HOSTILE, statusWord: HOSTILE, label: HOSTILE })
  assertEscaped(p.svg)
})
