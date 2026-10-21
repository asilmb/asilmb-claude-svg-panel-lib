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
  ['raster hairline', 'src/readSvg.ts', 'export const MIN_STROKE = 1', 'export const MIN_STROKE = 0.25'],
  ['raster rect snap', 'src/readSvg.ts', 'const y = Math.round(Y(number(attrs.y)))', 'const y = Y(number(attrs.y))'],
  ['raster soft edge', 'src/dots.ts', 'return clamp(0.5 - sd, 0, 1)', 'return sd < 0 ? 1 : 0'],
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
