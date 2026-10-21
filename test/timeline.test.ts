import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dark, SVG_BUDGET, timeline } from '../src/index.ts'
import { assertEscaped, assertPicture, attrOf, HOSTILE, near, pathEnd, pathNumbers, tagOf } from './helpers.ts'

const KINDS = {
  deploy: { label: 'deploy' },
  incident: { label: 'incident' },
}

test('the line ends at the latest value, on a tidy axis', () => {
  // [0, 100] tops the axis at 200; no legend for one series, so the plot runs
  // from y 14 to y 126 and x ends at 480 - 52.
  const svg = timeline({ values: [0, 100] }, { width: 480 }).svg
  assert.deepEqual(pathEnd(attrOf(svg, 'tl-line', 'd')), { x: 428, y: 70 })
  assert.equal(pathNumbers(attrOf(svg, 'tl-line', 'd'))[1], 126)
  assert.equal(pathNumbers(attrOf(svg, 'tl-baseline', 'd'))[1], 126)
  assert.match(svg, /<text [^>]*>200<\/text>/)
})

test('the dashed threshold rule sits at its value', () => {
  const svg = timeline({ values: [0, 100], threshold: 150 }, { width: 480 }).svg
  const n = pathNumbers(attrOf(svg, 'tl-threshold', 'd'))
  assert.equal(n[1], 42)
  assert.equal(n[2], 428)
  assert.equal(attrOf(svg, 'tl-threshold', 'stroke-dasharray'), '5 4')
  assert.equal(attrOf(svg, 'tl-threshold', 'stroke'), dark.status.warning)
})

test('each event kind has its own shape and colour, at its step on the line', () => {
  const values = [10, 20, 30, 40, 50]
  const p = timeline({ values, events: [{ step: 1, kind: 'deploy' }, { step: 3, kind: 'incident' }] }, { kinds: KINDS })
  const groups = p.svg.split('<g class="tl-pt"').slice(1)
  assert.equal(groups.length, 5, 'one hover group per step')
  const step1 = groups[1]!
  const step3 = groups[3]!
  assert.match(step1, /<title>deploy at step 2<\/title><path d="M/, 'deploy is a diamond path')
  assert.match(step1, new RegExp(`fill="${dark.series.orange}"`))
  assert.match(step3, /<title>incident at step 4<\/title><rect /, 'incident is a square')
  assert.match(step3, new RegExp(`fill="${dark.series.aqua}"`))
  // The step's dot and its marker share a centre.
  const dot = /<circle class="tl-dot" cx="([\d.]+)" cy="([\d.]+)"/.exec(step1)!
  const diamond = /<path d="M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)/.exec(step1.split('tl-event')[1]!)!
  near(Number(diamond[1]), Number(dot[1]), 'marker x')
  near(Number(diamond[4]), Number(dot[2]), 'marker y')
})

test('a legend appears once two or more series or kinds do', () => {
  assert.doesNotMatch(timeline({ values: [1, 2] }).svg, /class="legend"/)
  const svg = timeline({ values: [1, 2, 3], events: [{ step: 1, kind: 'deploy' }] }, { kinds: KINDS, seriesLabel: 'requests' }).svg
  assert.match(svg, /class="legend"/)
  assert.match(svg, />requests<\/text>/)
  assert.match(svg, />deploy<\/text>/)
})

test('hover works without script: hidden parts shown on :hover, a wide hit rect, a title per mark', () => {
  const p = timeline({ values: [1, 2, 3], events: [{ step: 2, kind: 'deploy' }] }, { kinds: KINDS })
  assert.equal(p.isInteractive, true)
  assert.match(p.svg, /<style>[^<]*\.tl-pt:hover \.tl-tip[^<]*visibility:visible/)
  assert.doesNotMatch(p.svg, /<script|\son[a-z]+=/i)
  const hit = tagOf(p.svg, 'tl-hit')
  assert.match(hit, /fill="transparent"/)
  assert.ok(Number(/width="([\d.]+)"/.exec(hit)![1]) > 100, 'the first step owns half the gap to the next')
  assert.equal((p.svg.match(/<title>/g) ?? []).length, 4, 'three steps and one event')
})

test('the flag labels the latest value only', () => {
  const svg = timeline({ values: [1000, 236000] }).svg
  assert.match(svg, /class="tl-flag-label"[^>]*>236k</)
  assert.equal((svg.match(/tl-flag-label/g) ?? []).length, 1)
})

test('the twin is the sparkline twin and a line naming the events', () => {
  const p = timeline(
    { values: [1, 2, 3, 5, 8], events: [{ step: 1, kind: 'deploy' }, { step: 4, kind: 'deploy' }, { step: 2, kind: 'incident' }] },
    { kinds: KINDS },
  )
  assertPicture(p)
  assert.equal(p.twin, '▁▂▃▅█ 8\n◆ deploy ×2 (step 2, step 5) · ■ incident ×1 (step 3)')
  assert.equal(timeline({ values: [4, 4] }).twin, '▄▄ 4\nno events')
})

test('a long timeline thins its points to stay inside the budget', () => {
  const values = Array.from({ length: 50000 }, (_, i) => 1000 + ((i * 7919) % 300000))
  const events = Array.from({ length: 4000 }, (_, i) => ({ step: i * 12, kind: i % 2 ? 'deploy' : 'incident' }))
  const p = timeline({ values, events, threshold: 270000 }, { kinds: KINDS })
  assert.ok(p.svg.length <= SVG_BUDGET, `${p.svg.length} characters`)
  assertPicture(p)
  const kept = (p.svg.match(/class="tl-pt"/g) ?? []).length
  assert.ok(kept >= 32 && kept < 50000, `${kept} hover steps`)
  assert.match(p.svg, /data-step="49999"/, 'the latest step is always kept')
})

test('hostile labels are escaped', () => {
  const p = timeline(
    { values: [1, 2], events: [{ step: 1, kind: 'x' }], threshold: 1, thresholdLabel: HOSTILE },
    { kinds: { x: { label: HOSTILE } }, seriesLabel: HOSTILE, stepName: () => HOSTILE },
  )
  assertEscaped(p.svg)
})
