import assert from 'node:assert/strict'
import { test } from 'node:test'

import { dark, icon, ICON_NAMES, iconMark, light } from '../src/index.ts'
import { assertEscaped, assertPicture, attrOf, HOSTILE, pathNumbers } from './helpers.ts'

test('the set, each with its one-column glyph', () => {
  assert.deepEqual(
    Object.fromEntries(ICON_NAMES.map(n => [n, icon(n).twin])),
    { online: '●', idle: '◐', offline: '○', rising: '▲', falling: '▼', alert: '⚑', failed: '✕' },
  )
  for (const name of ICON_NAMES) {
    const p = icon(name)
    assertPicture(p)
    assert.equal([...p.glyph].length, 1, `${name} is one character`)
    assert.equal(p.glyph, p.twin)
  }
})

test('an icon scales with its radius and stays centred', () => {
  const small = icon('failed', { r: 8 }).svg
  assert.match(small, /width="20" height="20"/)
  // ✕ runs corner to corner at 0.6 r around the centre (10, 10).
  assert.deepEqual(pathNumbers(attrOf(small, 'icon-failed', 'd')), [5.2, 5.2, 14.8, 14.8, 14.8, 5.2, 5.2, 14.8])
  const big = icon('failed', { r: 20 }).svg
  assert.match(big, /width="44" height="44"/)
  assert.deepEqual(pathNumbers(attrOf(big, 'icon-failed', 'd')).slice(0, 2), [10, 10])
})

test('iconMark draws at any centre', () => {
  assert.match(iconMark('offline', 50, 60, 10, dark), /cx="50" cy="60" r="7"/)
  assert.deepEqual(pathNumbers(/d="([^"]*)"/.exec(iconMark('rising', 0, 0, 10, dark))![1]!), [0, -7.5, 8, 6, -8, 6])
  assert.deepEqual(pathNumbers(/d="([^"]*)"/.exec(iconMark('falling', 0, 0, 10, dark))![1]!), [0, 7.5, 8, -6, -8, -6])
  // ◐: the left half filled, from the top of the ring to its bottom.
  assert.match(iconMark('idle', 20, 20, 10, dark), /<path d="M20 13A7 7 0 0 0 20 27Z"/)
})

test('each icon has a colour for the picture and a theme key for Text', () => {
  const online = icon('online', { theme: light })
  assert.equal(online.color, light.status.good)
  assert.equal(online.textColor, 'success')
  assert.match(online.svg, new RegExp(`fill="${light.status.good}"`))
  assert.equal(attrOf(icon('failed').svg, 'icon-failed', 'stroke'), dark.status.critical)
  assert.equal(icon('failed').textColor, 'error')
  assert.equal(icon('alert').color, dark.status.warning)
  assert.equal(icon('idle').color, dark.series.violet)
})

test('the label is the alt and the tooltip, escaped', () => {
  const p = icon('idle', { label: 'paused by the operator' })
  assert.equal(p.alt, 'paused by the operator')
  assert.match(p.svg, /<title>paused by the operator<\/title>/)
  assertEscaped(icon('alert', { label: HOSTILE }).svg)
})
