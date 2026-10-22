// Breaks each component on purpose, one change at a time, and checks that the
// tests notice. Every file is put back as it was, whatever happens.
//   node scripts/mutate.mjs

import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))

const MUTANTS = [
  ['gauge geometry', 'src/gauge.ts', 'export const GAUGE_SWEEP = 240', 'export const GAUGE_SWEEP = 220'],
  ['gauge tick', 'src/gauge.ts', 'const inner = polar(cx, cy, r - 9, a)', 'const inner = polar(cx, cy, r - 9, a + 3)'],
  ['gauge twin', 'src/gauge.ts', 'bar(value, max, { min, tick: data.threshold })', 'bar(value, max, { min })'],
  ['meter fill', 'src/meter.ts', 'const fillW = at(value)', 'const fillW = at(value) * 0.9'],
  ['meter zone', 'src/meter.ts', 'zones.find(z => value <= z.upTo)', 'zones.find(z => value < z.upTo - 5)'],
  ['meter twin', 'src/meter.ts', 'bar(value, max, { min, tick: data.tick })', 'bar(value, max, { min })'],
  ['sparkline geometry', 'src/sparkline.ts', 'right: 6,', 'right: 8,'],
  ['sparkline twin', 'src/sparkline.ts', '{ width: 24, min: options.min, max: options.max }', '{ width: 24, min: 0, max: options.max }'],
  ['timeline geometry', 'src/timeline.ts', 'const right = width - 52', 'const right = width - 50'],
  ['timeline hover', 'src/timeline.ts', '.tl-pt:hover .tl-tip{visibility:visible}', '.tl-pt:hover .tl-tip{opacity:1}'],
  ['timeline twin', 'src/timeline.ts', '${spec.label} ×${steps.length}', '${spec.label}'],
  ['timeline budget', 'src/timeline.ts', 'if (svg.length <= SVG_BUDGET || maxPoints <= 2) {', 'if (true) {'],
  ['statTile geometry', 'src/statTile.ts', 'const BODY_TOP = 64', 'const BODY_TOP = 60'],
  ['statTile twin', 'src/statTile.ts', '`${lead}  ${bodyPicture.twin}`', 'lead'],
  ['icon geometry', 'src/icon.ts', 'd="M${p(0, -0.75)}L${p(0.8, 0.6)}', 'd="M${p(0, -0.7)}L${p(0.8, 0.6)}'],
  ['icon twin', 'src/icon.ts', "online: { glyph: '●'", "online: { glyph: '•'"],
  ['legend geometry', 'src/legend.ts', 'const ROW = 18', 'const ROW = 20'],
  ['legend twin', 'src/legend.ts', "if (mark === 'line') return '─'", "if (mark === 'line') return '-'"],
  ['esc', 'src/core.ts', "'<': '&lt;'", "'<': '<'"],
  ['text escaping', 'src/core.ts', '>${esc(words)}</text>', '>${words}</text>'],
  ['size budget', 'src/core.ts', 'if (svg.length > SVG_BUDGET) {', 'if (svg.length > SVG_BUDGET + 10) {'],
  ['bar tick', 'src/twin.ts', 'Math.round(at(tick) * cells)', 'Math.floor(at(tick) * cells)'],
  ['blocks', 'src/twin.ts', 'Math.round(clamp((v - lo) / (hi - lo), 0, 1) * top)', 'Math.floor(clamp((v - lo) / (hi - lo), 0, 1) * top)'],
  ['bars geometry', 'src/bars.ts', 'const bar = Math.max(1, slot * 0.64)', 'const bar = Math.max(1, slot * 0.6)'],
  ['bars threshold', 'src/bars.ts', 'v >= threshold ?', 'v > threshold + 1 ?'],
  ['bars twin', 'src/bars.ts', 'blocks(values, { min: 0, max: top })', 'blocks(values, { max: top })'],
  ['donut gap', 'src/donut.ts', 'export const DONUT_GAP = 2', 'export const DONUT_GAP = 3'],
  ['donut other', 'src/donut.ts', 'byValue.slice(0, limit - 1)', 'byValue.slice(0, limit)'],
  ['heatmap step', 'src/heatmap.ts', 'Math.floor(((value - lo) / (hi - lo)) * HEAT_STEPS)', 'Math.round(((value - lo) / (hi - lo)) * HEAT_STEPS)'],
  ['heatmap twin', 'src/heatmap.ts', "export const HEAT_SHADES = ' ·░▒▓█'", "export const HEAT_SHADES = ' ░▒▓█'"],
  ['statusGrid wrap', 'src/statusGrid.ts', 'Math.min(6, fit)', 'Math.min(7, fit)'],
  ['statusGrid twin', 'src/statusGrid.ts', "warning: '▲'", "warning: '●'"],
  ['raster half block', 'src/raster.ts', "0x0f: '▀',", "0x0f: '▄',"],
  ['raster braille order', 'src/raster.ts', 'const BRAILLE_BIT = [0x01, 0x08, 0x02, 0x10', 'const BRAILLE_BIT = [0x01, 0x02, 0x08, 0x10'],
  ['raster braille edge', 'src/raster.ts', 'const BRAILLE_EDGE = { ratio: 0.8, least: 64 }', 'const BRAILLE_EDGE = { ratio: 0, least: 64 }'],
  ['raster surface behind', 'src/raster.ts', 'distance2(IN, backdrop) < distance2(OUT, backdrop)', 'distance2(IN, backdrop) > distance2(OUT, backdrop)'],
  ['raster label anchor', 'src/raster.ts', "label.anchor === 'middle' ? Math.round(at - chars.length / 2)", "label.anchor === 'middle' ? Math.round(at)"],
  ['raster wide chars', 'src/raster.ts', 'else if (cp > 0xffff || within(cp, WIDE)) out.push(0x3f)', 'else if (cp > 0xffff) out.push(0x3f)'],
  ['raster bare cells', 'src/raster.ts', 'if (most < 0.02) {', 'if (most < -1) {'],
  ['raster encoding', 'src/raster.ts', 'bytes[o] = word & 255', 'bytes[o] = (word >>> 24) & 255'],
  ['raster hidden css', 'src/readSvg.ts', 'if (m) out.add(m[1]!)', 'if (m) out.add(`.${m[1]!}`)'],
  ['raster arc sweep', 'src/readSvg.ts', 'if (sweep && delta < 0) delta += 2 * Math.PI', 'if (sweep && delta < 0) delta -= 0'],
  ['raster unknown command', 'src/readSvg.ts', "d.match(/[A-Za-z]|", "d.match(/[MmLlHhVvAaZz]|"],
  ['raster cubic', 'src/readSvg.ts', '3 * u * u * t * c1.x + 3 * u * t * t * c2.x', '3 * u * u * t * c2.x + 3 * u * t * t * c1.x'],
  ['raster curve mirror', 'src/readSvg.ts', '{ x: 2 * x - c.x, y: 2 * y - c.y }', '{ x: c.x, y: c.y }'],
  ['raster ellipse', 'src/readSvg.ts', 'ring.push({ x: X(cx + rx * Math.cos(t)), y: Y(cy + ry * Math.sin(t)) })', 'ring.push({ x: X(cx + ry * Math.cos(t)), y: Y(cy + ry * Math.sin(t)) })'],
  ['raster gradient', 'src/readSvg.ts', 'add(tail.color, 1 - tail.at)', 'add(tail.color, 2 - tail.at)'],
  ['raster defs', 'src/readSvg.ts', "'defs', 'clippath',", "'clippath',"],
  ['raster hairline', 'src/readSvg.ts', 'export const MIN_STROKE = 1', 'export const MIN_STROKE = 0.25'],
  ['raster rect snap', 'src/readSvg.ts', 'const y = Math.round(Y(number(attrs.y)))', 'const y = Y(number(attrs.y))'],
  ['raster soft edge', 'src/dots.ts', 'return clamp(0.5 - sd, 0, 1)', 'return sd < 0 ? 1 : 0'],
  ['pixels unpremultiply', 'src/pixels.ts', 'painted.data[i + c]! / a', 'painted.data[i + c]!'],
  ['pixels cell aspect', 'src/pixels.ts', 'height: rows * 2 * px,', 'height: rows * px,'],
  ['pixels byte limit', 'src/pixels.ts', 'Math.min(options.maxBytes ?? PIXELS_MAX.bytes, PIXELS_MAX.bytes)', '(options.maxBytes ?? PIXELS_MAX.bytes)'],
  ['drivers tmux', 'src/drivers.ts', 'env.TMUX === undefined &&', ''],
  ['drivers prefer', 'src/drivers.ts', "const named = byId(prefer ?? '') ?? byId(env.SVG_PANEL_DRIVER ?? '')", "const named = byId(prefer ?? '')"],
  ['drivers rank', 'src/drivers.ts', 'sort((a, b) => b.rank - a.rank)', 'sort((a, b) => a.rank - b.rank)'],
  ['drivers immutable', 'src/drivers.ts', 'return drivers(...ranked, driver)', 'ranked.push(driver); return drivers(...ranked)'],
  ['kitty chunk', 'src/kitty.ts', 'export const KITTY_CHUNK = 4096', 'export const KITTY_CHUNK = 4100'],
  ['kitty last chunk', 'src/kitty.ts', 'at + KITTY_CHUNK < payload.length ? 1 : 0', '1'],
]

const survivors = []
for (const [name, file, from, to] of MUTANTS) {
  const path = root + file
  const original = readFileSync(path, 'utf8')
  if (original.split(from).length !== 2) {
    console.error(`✖ ${name}: "${from}" is not in ${file} exactly once`)
    survivors.push(name)
    continue
  }
  try {
    writeFileSync(path, original.replace(from, to))
    const run = spawnSync(process.execPath, ['--test', '--test-reporter=dot', ...testFiles()], { cwd: root, encoding: 'utf8' })
    const caught = run.status !== 0
    console.log(`${caught ? '✓ caught ' : '✖ MISSED '} ${name}`)
    if (!caught) survivors.push(name)
  } finally {
    writeFileSync(path, original)
  }
}

function testFiles() {
  return spawnSync('sh', ['-c', 'ls test/*.test.ts'], { cwd: root, encoding: 'utf8' }).stdout.trim().split('\n')
}

console.log(survivors.length === 0 ? `\nall ${MUTANTS.length} mutants caught` : `\n${survivors.length} survived: ${survivors.join(', ')}`)
process.exit(survivors.length === 0 ? 0 : 1)
