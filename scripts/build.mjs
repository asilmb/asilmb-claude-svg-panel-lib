// Builds what is generated from src/, with no packages:
//   examples/demo-mod/vendor/svg-panel/  a copy of src/ a mod imports, with the LICENSE
//   dist/svg-panel.js                    one ES module, types stripped, with the LICENSE beside it
//   demo/index.html                      demo/page.html with the library and the scene inlined
// Run it after changing src/ or the demo's scene; `npm run check` does.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

process.removeAllListeners('warning')
const root = fileURLToPath(new URL('..', import.meta.url))
const src = `${root}src/`
const vendor = `${root}examples/demo-mod/vendor/svg-panel/`
const scene = `${root}examples/demo-mod/hooks/scene.ts`

const files = readdirSync(src).filter(f => f.endsWith('.ts')).sort()

// 1. The vendored copy.
rmSync(vendor, { recursive: true, force: true })
mkdirSync(vendor, { recursive: true })
for (const file of files) {
  const header = `// Copied from svg-panel's src/${file} by scripts/build.mjs: edit src/, then rebuild.\n\n`
  writeFileSync(vendor + file, header + readFileSync(src + file, 'utf8'))
}
// MIT asks that the notice travel with every copy; a mod copies this folder.
copyFileSync(`${root}LICENSE`, `${vendor}LICENSE`)

// 2. One module: each file's types stripped and its imports dropped, in
// dependency order, so the files' top-level names share one scope.
const IMPORT = /^import\b[^;']*?\bfrom\s+'([^']+)'\s*;?[ \t]*$/gm
function deps(code) {
  return [...code.matchAll(IMPORT)].map(m => m[1]).filter(p => p.startsWith('./')).map(p => p.slice(2))
}
const order = []
function visit(file, seen = new Set()) {
  if (order.includes(file)) return
  if (seen.has(file)) throw new Error(`import cycle at ${file}`)
  seen.add(file)
  for (const dep of deps(readFileSync(src + file, 'utf8'))) visit(dep, seen)
  order.push(file)
}
for (const file of files) if (file !== 'index.ts') visit(file)

function strip(code, name) {
  const js = stripTypeScriptTypes(code, { mode: 'strip' })
  const left = js.replace(IMPORT, '')
  if (/^\s*import\s/m.test(left)) throw new Error(`${name}: an import the build cannot drop (an import with a side effect only?)`)
  return left.replace(/^[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}
const modules = order.map(file => `// ---- src/${file}\n${strip(readFileSync(src + file, 'utf8'), file)}`)
const banner = '// svg-panel, built from src/ by scripts/build.mjs. Do not edit.\n'
mkdirSync(`${root}dist`, { recursive: true })
writeFileSync(`${root}dist/svg-panel.js`, `${banner}\n${modules.join('\n\n')}\n`)
copyFileSync(`${root}LICENSE`, `${root}dist/LICENSE`)

// 3. The demo page: the library and the scene as one classic script, no
// imports, so it opens from a double click (file:// loads no modules).
const unexport = code => code.replace(/^export (?=(async )?function |const |let |class )/gm, '')
const library = unexport(modules.join('\n\n'))
const sceneJs = `// ---- examples/demo-mod/hooks/scene.ts\n${unexport(strip(readFileSync(scene, 'utf8'), 'scene.ts'))}`
const page = readFileSync(`${root}demo/page.html`, 'utf8')
const marker = '/* svg-panel and scene inlined here by scripts/build.mjs */'
if (!page.includes(marker)) throw new Error('demo/page.html lost its marker')
const script = `${banner}${library}\n\n${sceneJs}`.replace(/<\/script/gi, '<\\/script')
writeFileSync(`${root}demo/index.html`, page.replace(marker, () => script))

console.log(`vendored ${files.length} files; dist/svg-panel.js and demo/index.html built from ${order.length} modules`)
