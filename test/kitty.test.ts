import assert from 'node:assert/strict'
import { test } from 'node:test'

import { fromBase64, gauge, kittyDelete, kittyImage, printDrivers, printView, type PixelPicture } from '../src/index.ts'

const ESC = '\x1b'

/** One red pixel over one cell. */
const RED: PixelPicture = { width: 1, height: 1, data: new Uint8Array([255, 0, 0, 255]), columns: 1, rows: 1 }

/** The escape's commands: each `ESC _G<keys>;<payload> ESC \`. */
function commands(escape: string): { keys: string; payload: string }[] {
  const out: { keys: string; payload: string }[] = []
  const re = /\x1b_G([^;\x1b]*);?([^\x1b]*)\x1b\\/g
  let m: RegExpExecArray | null
  let end = 0
  while ((m = re.exec(escape))) {
    assert.equal(m.index, end, 'nothing between commands')
    out.push({ keys: m[1]!, payload: m[2]! })
    end = re.lastIndex
  }
  assert.equal(end, escape.length, 'nothing after the last command')
  return out
}

test('a small picture is one command: raw RGBA, its size in pixels and cells, no reply asked', () => {
  assert.equal(kittyImage(RED), `${ESC}_Ga=T,f=32,s=1,v=1,c=1,r=1,q=2;/wAA/w==${ESC}\\`)
  assert.equal(kittyImage(RED, { id: 7 }), `${ESC}_Ga=T,f=32,s=1,v=1,c=1,r=1,i=7,q=2;/wAA/w==${ESC}\\`)
})

test('a bigger one goes in chunks of at most 4096 base64 bytes, the keys on the first, m=1 until the last', () => {
  // 40 by 40 pixels: 6400 bytes, 8536 in base64, so three chunks.
  const data = new Uint8Array(40 * 40 * 4).map((_, i) => (i * 7) & 255)
  const escape = kittyImage({ width: 40, height: 40, data, columns: 4, rows: 4 })
  const parts = commands(escape)
  assert.deepEqual(parts.map(p => p.keys), ['a=T,f=32,s=40,v=40,c=4,r=4,q=2,m=1', 'm=1,q=2', 'm=0,q=2'])
  assert.deepEqual(parts.map(p => p.payload.length), [4096, 4096, 344])
  assert.deepEqual(fromBase64(parts.map(p => p.payload).join('')), data)
})

test('an image is deleted by its id, its data freed', () => {
  assert.equal(kittyDelete(7), `${ESC}_Ga=d,d=I,i=7,q=2${ESC}\\`)
})

test('a plain program prints kitty pixels in kitty and Ghostty, coloured blocks elsewhere', () => {
  const picture = gauge({ label: 'CPU', value: 42, max: 100 })
  const kitty = printView(picture, { env: { TERM: 'xterm-kitty' }, columns: 20 })
  assert.match(kitty, /^\x1b_Ga=T,f=32,s=320,/)
  const blocks = printView(picture, { env: { TERM: 'xterm-256color' }, columns: 20 })
  assert.match(blocks, /^\x1b\[(38|39)/)
  assert.doesNotMatch(blocks, /\x1b_G/)
  // tmux eats the kitty escape unless it is wrapped, so it gets the blocks.
  assert.equal(printView(picture, { env: { TERM: 'xterm-kitty', TMUX: '/tmp/t,1,0' }, columns: 20 }), blocks)
  assert.deepEqual(printDrivers.list.map(d => d.id), ['kitty', 'ansi'])
})
