import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  ansi,
  arcPoints,
  BLOCK_GLYPHS,
  brailleOf,
  cellChars,
  dark,
  decodeCells,
  DEFAULT_COLOR,
  encodeCells,
  fitCell,
  gauge,
  gridText,
  hexRgb,
  hiddenClasses,
  light,
  meter,
  packRgb,
  pathPoints,
  rasterGrid,
  readSvg,
  snapLine,
  sparkline,
  statTile,
  svgDoc,
  timeline,
  toRaster,
  type Grid,
  type Rgb,
} from '../src/index.ts'
import { HOSTILE, near } from './helpers.ts'

const SURFACE = hexRgb(dark.surface)!
const BLUE = hexRgb(dark.series.blue)!

/** A cell of eight dots, row by row, inked where `mask` (bit `row * 2 + column`) is set. */
function cell(mask: number, ink: Rgb = BLUE, bare: Rgb = SURFACE): Rgb[] {
  return Array.from({ length: 8 }, (_, i) => ((mask >> i) & 1 ? ink : bare))
}

function row(grid: Grid, r: number): string {
  return gridText(grid).split('\n')[r] ?? ''
}

test('cells pack as a Raster takes them: little-endian u32 triplets in padded base64', () => {
  // The types file's own example: one orange full block on the terminal's background.
  const one: Grid = { columns: 1, rows: 1, cells: [{ ch: 0x2588, fg: 0xff8800, bg: DEFAULT_COLOR }] }
  assert.equal(encodeCells(one), 'iCUAAACI/wAAAAAB')
  const two: Grid = { columns: 2, rows: 1, cells: [{ ch: 0x41, fg: 0x123456, bg: 0xabcdef }, { ch: 0x2800, fg: 0, bg: 0xffffff }] }
  assert.deepEqual(decodeCells(encodeCells(two), 2, 1), two)
  assert.throws(() => decodeCells(encodeCells(two), 3, 1), /is not 3 × 1 cells/)
})

test('a cell takes the block that splits its dots, the colour nearer the surface behind', () => {
  assert.deepEqual(fitCell(cell(0x0f), SURFACE), { ch: '▀', fg: BLUE, bg: SURFACE, error: 0 })
  assert.equal(fitCell(cell(0xf0), SURFACE).ch, '▄')
  assert.equal(fitCell(cell(0x55), SURFACE).ch, '▌')
  assert.equal(fitCell(cell(0xa0), SURFACE).ch, '▗')
  assert.equal(fitCell(cell(0x5a), SURFACE).ch, '▞')
  // Inked but for its top-left quarter: the surface stays behind, so the glyph is the other three.
  const most = fitCell(cell(0xfa), SURFACE)
  assert.deepEqual([most.ch, most.fg, most.bg], ['▟', BLUE, SURFACE])
  // Inked over a light surface, the same split reads the other way round.
  const onLight = fitCell(cell(0x05), BLUE)
  assert.deepEqual([onLight.ch, onLight.fg, onLight.bg], ['▟', SURFACE, BLUE])
  const flat = fitCell(cell(0), SURFACE)
  assert.deepEqual([flat.ch, flat.bg], [' ', SURFACE])
  assert.equal(Object.keys(BLOCK_GLYPHS).length, 16)
})

test('a thin line no block can split takes braille, in the line\'s own colour', () => {
  // A zigzag one dot wide: down the cell from top left to bottom right and back.
  const zigzag = fitCell(cell(0b10011001), SURFACE)
  assert.equal(zigzag.ch, '⢕')
  assert.deepEqual([zigzag.fg, zigzag.bg], [BLUE, SURFACE])
  // A blend at the line's soft edge still draws in the shape's ink, as the canvas knows it.
  const soft: Rgb = [0, 1, 2].map(c => (SURFACE[c]! + BLUE[c]!) / 2) as unknown as Rgb
  const blended = fitCell(cell(0b10011001, soft), SURFACE, cell(0b10011001).map((c, i) => ((0b10011001 >> i) & 1 ? packRgb(BLUE) : -1)))
  assert.equal(blended.ch, '⢕')
  assert.deepEqual(blended.fg, BLUE)
})

test('braille dots go 1-2-3-7 down the left and 4-5-6-8 down the right', () => {
  assert.equal(brailleOf(0b00000001), '⠁')
  assert.equal(brailleOf(0b00000010), '⠈')
  assert.equal(brailleOf(0b00000100), '⠂')
  assert.equal(brailleOf(0b01000000), '⡀')
  assert.equal(brailleOf(0b10000000), '⢀')
  assert.equal(brailleOf(0xff), '⣿')
})

test('a gauge is 8 CSS pixels a cell, its figures in letters where the Svg sets them', () => {
  const g = rasterGrid(gauge({ value: 1240, max: 2000, threshold: 1600, label: 'Throughput' }))
  assert.equal(g.columns, 29)
  assert.equal(g.rows, 11)
  // The hero figure, centred on the arc's centre (column 14.5) in the row its middle is in.
  assert.equal(row(g, 5).indexOf('1.2k'), 13)
  assert.match(row(g, 7), /\s{4}of 2k\s{4}/)
  assert.match(row(g, 9), /^\s+0\s.*ok\s+2k\s+$/)
  assert.match(gridText(g), /1\.6k/)
  // The value arc in the status colour, the track in the grid colour, both drawn in blocks.
  const fgs = new Set(g.cells.map(c => c.fg))
  assert.ok(fgs.has(packRgb(hexRgb(dark.status.good)!)), 'the value arc is green')
  assert.ok(g.cells.some(c => c.bg === packRgb(hexRgb(dark.grid)!) || c.fg === packRgb(hexRgb(dark.grid)!)), 'the track shows')
  assert.ok(g.cells.every(c => c.bg !== DEFAULT_COLOR), 'the surface covers every cell')
  // Twice the columns, twice the rows.
  const big = rasterGrid(gauge({ value: 1, max: 2 }), { columns: 58 })
  assert.deepEqual([big.columns, big.rows], [58, 22])
})

test('the value arc ends where the value sits on the sweep', () => {
  // Half way is straight up: the arc's top is the cells at the centre column, its far side empty.
  const g = rasterGrid(gauge({ value: 150, max: 300 }, { background: false }))
  const green = packRgb(hexRgb(dark.status.good)!)
  const shows = (r: number, c: number) => {
    const cell = g.cells[r * g.columns + c]!
    return cell.ch !== 0x20 && (cell.fg === green || cell.bg === green)
  }
  assert.ok(shows(1, 13), 'up to twelve o\'clock')
  for (let r = 0; r < 5; r++) for (let c = 17; c < g.columns; c++) assert.ok(!shows(r, c), `nothing past it (${r}, ${c})`)
  assert.ok([5, 6, 7].some(r => [4, 5, 6].some(c => shows(r, c))), 'from the bottom left')
})

test('labels stay inside, wide characters become ?, hostile words come out as plain letters', () => {
  assert.deepEqual(cellChars('a\tb'), [0x61, 0x20, 0x62])
  assert.deepEqual(cellChars('日本'), [0x3f, 0x3f])
  assert.deepEqual(cellChars('ok😀'), [0x6f, 0x6b, 0x3f])
  assert.deepEqual(cellChars('é'), [0x65])
  const g = rasterGrid(gauge({ value: 1, max: 2, statusWord: HOSTILE, label: 'x' }))
  assert.ok(gridText(g).includes('<script>alert("x")</script> &'), 'the word, unescaped, cut to the width')
  for (const c of g.cells) assert.ok(c.ch >= 0x20 && c.ch <= 0xffff && !(c.ch >= 0x7f && c.ch < 0xa0), `printable: ${c.ch}`)
  // A label past the right edge is moved back in, not cut.
  const svg = svgDoc({ width: 80, height: 16, body: '<text x="78" y="12" font-size="11" fill="#ffffff">right</text>' })
  assert.equal(row(rasterGrid(svg), 0), '     right')
})

test('what the CSS hides stays hidden: the timeline\'s tooltips are not drawn', () => {
  assert.deepEqual([...hiddenClasses('.a,.b{visibility:hidden;x:y}.p:hover .a{visibility:visible}.c{display:none}')], ['a', 'b', 'c'])
  const t = timeline({ values: [820, 940, 1180, 1420], events: [{ step: 2, kind: 'deploy' }], threshold: 1600 }, { stepName: s => `#${s + 1}` })
  const text = gridText(rasterGrid(t))
  assert.match(text, /threshold 1\.6k/)
  assert.match(text, /deploy/)
  assert.match(text, /1\.4k/)
  assert.doesNotMatch(text, /#3 ·/)
})

test('a hairline is a solid row of dots: one dot wide at least, on whole dots', () => {
  assert.deepEqual(snapLine([{ x: 0, y: 10.3 }, { x: 8, y: 10.3 }], 0.5), [{ x: 0, y: 10.5 }, { x: 8, y: 10.5 }])
  assert.deepEqual(snapLine([{ x: 0, y: 0 }, { x: 4, y: 3 }], 0.5), [{ x: 0, y: 0 }, { x: 4, y: 3 }])
  // A 1px rule at y 41.2: a quarter dot wide, drawn as the one dot row it falls in, in its own colour.
  const svg = svgDoc({ width: 40, height: 64, body: '<path d="M0 41.2H40" stroke="#ff0000" stroke-width="1"/>' })
  const g = rasterGrid(svg)
  const lit = g.cells.filter(c => c.ch !== 0x20)
  assert.equal(lit.length, 5)
  assert.ok(lit.every(c => c.fg === 0xff0000 && c.ch === 0x2824), 'a braille row: dots 3 and 6')
})

test('a picture without its surface leaves the bare cells to the terminal', () => {
  const g = rasterGrid(meter({ value: 5, max: 10 }, { background: false, showText: false }))
  assert.ok(g.cells.some(c => c.fg === DEFAULT_COLOR && c.bg === DEFAULT_COLOR), 'bare cells are the terminal\'s')
  assert.ok(g.cells.some(c => c.fg === packRgb(hexRgb(dark.series.blue)!) || c.bg === packRgb(hexRgb(dark.series.blue)!)), 'the fill shows')
})

test('a tile draws its body\'s own svg inside it, scaled where it was placed', () => {
  const t = statTile({ label: 'Requests/s', value: 1290, body: sparkline([820, 940, 1180, 1420, 1290], { width: 176 }) })
  const g = rasterGrid(t)
  assert.match(row(g, 1), /^ {2}Requests\/s/)
  assert.match(row(g, 2), /^ {2}1\.3k/)
  const blue = packRgb(hexRgb(dark.series.blue)!)
  assert.ok(g.cells.slice(4 * g.columns).some(c => c.fg === blue), 'the sparkline is in the body')
  assert.ok(!g.cells.slice(0, 4 * g.columns).some(c => c.fg === blue), 'and only there')
})

test('the light theme mixes edges with its own surface', () => {
  const g = rasterGrid(gauge({ value: 1, max: 2 }, { theme: light }), { theme: 'light' })
  const surface = packRgb(hexRgb(light.surface)!)
  assert.equal(g.cells[0]!.bg, surface)
  assert.equal(g.cells[g.cells.length - 1]!.bg, surface)
})

test('paths: lines, closes and arcs, the SVG way', () => {
  const box = pathPoints('M0 0L10 0V10H0Z', 1)
  assert.equal(box.length, 1)
  assert.equal(box[0]!.closed, true)
  assert.deepEqual(box[0]!.points, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }])
  assert.deepEqual(pathPoints('m1 1l2 0', 1)[0]!.points, [{ x: 1, y: 1 }, { x: 3, y: 1 }])
  // A half circle clockwise from the left to the right of (10, 10) passes over the top.
  const top = arcPoints(0, 10, 10, 10, 0, false, true, 20, 10, 0.5)
  const mid = top[Math.floor(top.length / 2)]!
  near(mid.x, 10, 'over the centre', 0.6)
  near(mid.y, 0, 'at the top', 0.1)
  assert.deepEqual(top[top.length - 1], { x: 20, y: 10 })
  // The other sweep passes under.
  const bottom = arcPoints(0, 10, 10, 10, 0, false, false, 20, 10, 0.5)
  near(bottom[Math.floor(bottom.length / 2)]!.y, 20, 'at the bottom', 0.1)
  // The gauge's 240° track takes the large arc.
  const track = pathPoints('M53.65 132A72 72 0 1 1 178.35 132', 1)[0]!.points
  near(Math.min(...track.map(p => p.y)), 24, 'reaches the top', 0.1)
})

test('readSvg sizes the canvas in whole cells', () => {
  const painted = readSvg(svgDoc({ width: 100, height: 30, body: '' }), 0.25)
  assert.deepEqual([painted.columns, painted.rows, painted.dots.width, painted.dots.height], [13, 2, 26, 8])
})

test('a picture taller than a Raster may be is scaled to fit it', () => {
  const tall = svgDoc({ width: 40, height: 8000, body: '<rect width="40" height="8000" fill="#ffffff"/>' })
  const g = rasterGrid(tall)
  assert.ok(g.rows <= 256 && g.rows >= 255, `${g.rows} rows`)
})

test('toRaster gives a Raster its props, ready to spread', () => {
  const p = gauge({ value: 1, max: 2 })
  const r = toRaster(p, { key: 'g' })
  assert.deepEqual(Object.keys(r), ['key', 'columns', 'rows', 'cells'])
  assert.deepEqual(decodeCells(r.cells, r.columns, r.rows), rasterGrid(p))
  assert.match(ansi(rasterGrid(p)), /^\x1b\[38;2;26;26;25m\x1b\[48;2;26;26;25m /)
})
