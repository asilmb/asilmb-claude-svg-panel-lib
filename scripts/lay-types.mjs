// Lays this Claude Code build's API types where the demo mod's tsconfig reads
// them, for `tsc` outside a session. A session that loads the mod lays the
// same file itself, in the same place.
//   node scripts/lay-types.mjs [path/to/claude-code.d.ts]
// Without a path: $CLAUDE_CODE_TYPES, else the newest file the
// plugin-authoring skill wrote (run that skill once, by its slash command).

import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const target = `${root}examples/demo-mod/.claude-plugin/types/claude-code/index.d.ts`

function* skillTypes() {
  for (const base of new Set(['/tmp', tmpdir()])) {
    for (const top of safe(base).filter(d => d.startsWith('claude-'))) {
      const skills = `${base}/${top}/bundled-skills`
      for (const version of safe(skills)) {
        for (const hash of safe(`${skills}/${version}`)) {
          yield `${skills}/${version}/${hash}/plugin-authoring/types/claude-code.d.ts`
        }
      }
    }
  }
}

function safe(dir) {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

const found = [process.argv[2], process.env.CLAUDE_CODE_TYPES, ...skillTypes()]
  .filter(p => p && existsSync(p))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
const from = process.argv[2] ?? process.env.CLAUDE_CODE_TYPES ?? found[0]

if (from === undefined || !existsSync(from)) {
  if (existsSync(target)) {
    console.log(`types already laid at ${target}`)
    process.exit(0)
  }
  console.error('no claude-code.d.ts found: run the plugin-authoring skill once, or pass its path')
  process.exit(1)
}
mkdirSync(target.replace(/index\.d\.ts$/, ''), { recursive: true })
copyFileSync(from, target)
console.log(`laid ${from}\n  -> ${target}`)
