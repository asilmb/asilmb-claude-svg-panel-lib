import assert from 'node:assert/strict'
import { test } from 'node:test'

import { bars, donut, donutShares, gridText, heatmap, heatStep, light, rasterGrid, statusGrid, dark } from '../src/index.ts'
import { assertEscaped, assertPicture, attrOf, HOSTILE, near, numAttr, pathEnd, pathNumbers, textOf } from './helpers.ts'

const WEEK = [
  { label: 'mon', value: 42 }, { label: 'tue', value: 65 }, { label: 'wed', value: 30 }, { label: 'thu', value: 88 },
  { label: 'fri', value: 54 }, { label: 'sat', value: 71 }, { label: 'sun', value: 20 },
]

/** Every opening tag carrying `cls`, in order. */
function tags(svg: string, cls: string): string[] {
  return svg.match(new RegExp(`<[a-z]+ [^>]*class="${cls}"[^>]*>`, 'g')) ?? []
}

const attr = (tag: string, name: string) => Number(new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1])

test('bars: each column stands in its slot, as tall as its value on a tidy scale', () => {
  const p = bars(WEEK)
  assertPicture(p)
  const cols = tags(p.svg, 'bar')
  assert.equal(cols.length, 7)
  // 224px of plot in 7 slots of 32; columns 64% of a slot, centred: the first at 8 + 5.76.
  near(attr(cols[0]!, 'x'), 13.76, 'first column x')
  near(attr(cols[0]!, 'width'), 20.48, 'column width')
  // The scale tops out at 100 (niceMax of 88); the baseline is at 118 and the top at 20.
  near(attr(cols[3]!, 'y'), 118 - 0.88 * 98, 'thursday top')
  near(attr(cols[3]!, 'y') + attr(cols[3]!, 'height'), 118, 'down to the baseline')
  assert.equal(textOf(p.svg, 'bar-figure'), '42')
  assert.equal(textOf(p.svg, 'bar-label'), 'mon')
})

test('bars: the threshold rule, and the columns past it turn warning', () => {
  const p = bars(WEEK, { threshold: 80, label: 'Deploys', theme: light })
  const ty = pathNumbers(attrOf(p.svg, 'bars-threshold', 'd'))[1]!
  near(ty, 118 - 0.8 * 98, 'rule at 80')
  const fills = tags(p.svg, 'bar').map(t => /fill="([^"]+)"/.exec(t)![1])
  assert.deepEqual(fills.map(f => f === light.status.warning), [false, false, false, true, false, false, false])
  assert.equal(fills[0], light.series.blue)
  assert.equal(p.twin, 'Deploys ▄▆▃▇▅▆▂ high thu 88')
  assert.equal(p.alt, 'Deploys: mon 42, tue 65, wed 30, thu 88, fri 54, sat 71, sun 20; threshold 80')
  // A column exactly at the threshold is past it.
  assert.match(bars([{ label: 'a', value: 80 }], { threshold: 80 }).svg, new RegExp(`class="bar"[^>]*fill="${dark.status.warning}"`))
  // A status wins over the threshold.
  assert.match(bars([{ label: 'a', value: 99, status: 'good' }], { threshold: 10 }).svg, new RegExp(`fill="${dark.status.good}"`))
})

test('bars: labels that do not fit their slot are left to the alt and the twin', () => {
  const many = Array.from({ length: 60 }, (_, i) => ({ label: `host-${i + 1}`, value: i }))
  const p = bars(many, { width: 240 })
  assertPicture(p)
  assert.doesNotMatch(p.svg, /class="bar-label"/)
  assert.match(p.alt, /host-12 11, and 48 more$/)
  assert.equal(bars([]).twin, 'no values')
})

test('donut: shares sweep in order with a gap, the total in the middle', () => {
  const p = donut([{ label: 'api', value: 50 }, { label: 'web', value: 25 }, { label: 'batch', value: 25 }], { label: 'Traffic' })
  assertPicture(p)
  const arcs = tags(p.svg, 'donut-slice').map(t => /\sd="([^"]+)"/.exec(t)![1]!)
  assert.equal(arcs.length, 3)
  // The first half ends at 180° less the 2° gap: on the ring of r 50 around (72, 72).
  const end = pathEnd(arcs[0]!)
  const angle = (Math.atan2(end.x - 72, 72 - end.y) * 180) / Math.PI
  near(angle, 178, 'first share ends at 178°', 0.05)
  near(Math.hypot(end.x - 72, end.y - 72), 50, 'on the ring', 0.05)
  assert.equal(textOf(p.svg, 'donut-center'), '100')
  assert.equal(textOf(p.svg, 'donut-row'), 'api 50%')
  assert.equal(p.twin, 'Traffic 100: api 50% · web 25% · batch 25%')
  assert.equal(p.alt, 'Traffic: total 100; api 50% (50), web 25% (25), batch 25% (25)')
})

test('donut: past maxSlices the smallest fold into other; nothing at all is an empty track', () => {
  const shares = donutShares([1, 2, 3, 4, 5, 6, 7].map(i => ({ label: `h${i}`, value: i * 10 })), 5, dark)
  assert.deepEqual(shares.map(s => [s.label, s.value]), [['h4', 40], ['h5', 50], ['h6', 60], ['h7', 70], ['other', 60]])
  assert.equal(shares[4]!.color, dark.muted)
  const empty = donut([{ label: 'a', value: 0 }])
  assert.match(empty.svg, /class="donut-track"/)
  assert.equal(empty.twin, 'nothing yet')
  // One share is a whole ring.
  assert.match(donut([{ label: 'all', value: 3 }]).svg, /<circle class="donut-slice"/)
})

test('heatmap: cells on a pitch, five steps from faint to full, missing cells outlined', () => {
  const p = heatmap({ values: [[0, 1, 2, 3, 4], [null, 4, 4, 4, 4]], rowLabels: ['web', 'api'], colLabels: ['0h', '1h', '2h', '3h', '4h'] }, { label: 'Load' })
  assertPicture(p)
  assert.deepEqual([0, 1, 2, 3, 4].map(v => heatStep(v, 0, 4)), [0, 1, 2, 3, 4])
  const cells = tags(p.svg, 'heat-cell')
  assert.equal(cells.length, 9)
  // Row labels push the grid right; a cell is 14 on a 16 pitch.
  const x0 = attr(cells[0]!, 'x')
  near(attr(cells[1]!, 'x') - x0, 16, 'pitch')
  near(attr(cells[0]!, 'width'), 14, 'cell')
  const fill = (t: string) => /fill="([^"]+)"/.exec(t)![1]
  assert.notEqual(fill(cells[0]!), fill(cells[4]!))
  assert.equal(fill(cells[4]!), dark.series.blue)
  assert.equal(tags(p.svg, 'heat-empty').length, 1)
  assert.equal(p.twin, 'web ·░▒▓█\napi  ████')
  assert.equal(p.alt, 'Load: 2 rows by 5 columns, low 0, high 4 at web, 4h')
  assert.match(textOf(p.svg, 'heat-key'), /^less$/)
})

test('statusGrid: tiles wrap at six, a dot in the status colour, the word when there is no figure', () => {
  const items = ['web-1', 'web-2', 'api-1', 'api-2', 'batch', 'db', 'cache'].map((label, i) => ({
    label, status: (['good', 'good', 'warning', 'critical', 'good', 'serious', 'good'] as const)[i]!,
  }))
  const p = statusGrid([{ ...items[0]!, value: '312/s' }, ...items.slice(1)], { label: 'Hosts' })
  assertPicture(p)
  const dots = tags(p.svg, 'status-dot')
  assert.equal(dots.length, 7)
  // The seventh tile starts the second row.
  near(attr(dots[6]!, 'cx'), attr(dots[0]!, 'cx'), 'same column')
  near(attr(dots[6]!, 'cy') - attr(dots[0]!, 'cy'), 50, 'one row down')
  assert.equal(/fill="([^"]+)"/.exec(dots[3]!)![1], dark.status.critical)
  assert.equal(textOf(p.svg, 'status-value'), '312/s')
  assert.equal(p.twin, '● web-1  ● web-2  ▲ api-1  ✕ api-2  ● batch  ◆ db  ● cache')
  assert.equal(p.alt, 'Hosts: 7 items, 4 ok, 1 warning, 1 serious, 1 critical; critical: api-2')
  assert.equal(statusGrid([{ label: 'db', status: 'good' }]).alt, 'Status: 1 item, 1 ok')
  assert.equal(numAttr(statusGrid(items, { columns: 3 }).svg, 'status-dot', 'cx'), attr(dots[0]!, 'cx'))
  assert.match(statusGrid([{ label: 'a-very-long-host-name', status: 'good' }]).svg, />a-very-…</)
  // However wide the picture may be, six tiles a row at most.
  const wide = tags(statusGrid(items, { width: 2000 }).svg, 'status-dot')
  near(attr(wide[6]!, 'cy') - attr(wide[0]!, 'cy'), 50, 'the seventh still wraps')
})

test('the new pictures escape hostile labels', () => {
  assertEscaped(bars([{ label: HOSTILE, value: 1 }], { width: 4000 }).svg)
  assertEscaped(donut([{ label: HOSTILE, value: 1 }], { center: HOSTILE }).svg)
  assertEscaped(heatmap({ values: [[1]], rowLabels: [HOSTILE], colLabels: [HOSTILE] }).svg)
  assertEscaped(statusGrid([{ label: HOSTILE, status: 'good', value: HOSTILE }], { tile: { width: 2000, height: 44 } }).svg)
})

test('the new pictures stay inside the size budget, or say so', () => {
  assert.throws(() => heatmap({ values: Array.from({ length: 60 }, () => Array.from({ length: 60 }, (_, i) => i)) }), /over the 131072/)
  assertPicture(heatmap({ values: Array.from({ length: 7 }, () => Array.from({ length: 52 }, (_, i) => i)) }))
})

test('the new pictures come out readable on the terminal', () => {
  assert.match(gridText(rasterGrid(bars(WEEK))), /mon +tue +wed +thu/)
  assert.match(gridText(rasterGrid(donut([{ label: 'api', value: 3 }, { label: 'web', value: 1 }]))), /api 75%/)
  assert.match(gridText(rasterGrid(statusGrid([{ label: 'web-1', status: 'good', value: '312/s' }]))), /web-1[\s\S]*312\/s/)
})
