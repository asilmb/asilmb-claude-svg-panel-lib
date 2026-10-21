import assert from 'node:assert/strict'
import { test } from 'node:test'

import * as src from '../src/index.ts'

// The demo page inlines the built bundle: it must draw what src/ draws.
// Stale after an edit to src/? Run `npm run build`.
const path = '../dist/svg-panel.js'
const dist = (await import(path)) as typeof src

test('dist/svg-panel.js draws what src/ draws', () => {
  const values = [40e3, 90e3, 150e3, 230e3, 275e3, 52e3]
  const cases: [string, (lib: typeof src) => src.Picture][] = [
    ['gauge', lib => lib.gauge({ value: 1240, max: 2000, threshold: 1600, label: 'Throughput' }, { theme: 'light' })],
    ['meter', lib => lib.meter({ value: 82, max: 100, tick: 90, zones: [{ upTo: 90, status: 'warning' }] })],
    ['sparkline', lib => lib.sparkline(values, { reference: 200e3 })],
    ['timeline', lib => lib.timeline({ values, events: [{ step: 4, kind: 'deploy' }], threshold: 270e3 })],
    ['statTile', lib => lib.statTile({ label: 'Hosts', value: '2/3', body: lib.dotRow(['online', 'online', 'offline']) })],
    ['icon', lib => lib.icon('idle', { r: 12 })],
    ['legend', lib => lib.legend([{ label: 'a' }, { label: 'b', mark: 'square' }])],
    ['bars', lib => lib.bars([{ label: 'a', value: 3 }, { label: 'b', value: 9 }], { threshold: 5 })],
    ['donut', lib => lib.donut([{ label: 'a', value: 3 }, { label: 'b', value: 1 }])],
    ['heatmap', lib => lib.heatmap({ values: [[1, 2], [3, null]], rowLabels: ['x', 'y'] })],
    ['statusGrid', lib => lib.statusGrid([{ label: 'a', status: 'good' }, { label: 'b', status: 'critical' }])],
    ['curve', lib => ({ svg: lib.svgDoc({ width: 80, height: 40, body: '<path d="M0 40C20 0 60 0 80 40" fill="none" stroke="#ffffff"/><ellipse cx="40" cy="20" rx="10" ry="5" fill="#ff0000"/>' }), alt: 'c', twin: '', isInteractive: false })],
  ]
  for (const [name, make] of cases) {
    const a = make(src)
    const b = make(dist)
    assert.equal(b.svg, a.svg, `${name} svg`)
    assert.equal(b.twin, a.twin, `${name} twin`)
    assert.equal(b.alt, a.alt, `${name} alt`)
    assert.equal(dist.toRaster(b, { key: name }).cells, src.toRaster(a, { key: name }).cells, `${name} raster`)
  }
})
