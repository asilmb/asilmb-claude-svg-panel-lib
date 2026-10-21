// What the component tests read pictures with: a well-formedness check and
// lookups by class, with no DOM.

import assert from 'node:assert/strict'

import { SVG_BUDGET, type Picture } from '../src/index.ts'

const TAG = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>/y

/**
 * Throws unless `svg` is one well-formed `<svg>` element: every tag closed in
 * order, every attribute quoted, no raw `<` or bare `&` in text.
 */
export function assertWellFormed(svg: string): void {
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, 'starts with an <svg> root')
  const stack: string[] = []
  let i = 0
  while (i < svg.length) {
    const lt = svg.indexOf('<', i)
    const between = svg.slice(i, lt === -1 ? svg.length : lt)
    assert.doesNotMatch(between, /&(?!amp;|lt;|gt;|quot;|#\d+;)/, `bare & in text near ${JSON.stringify(between.slice(0, 40))}`)
    assert.doesNotMatch(between, />/, `raw > in text near ${JSON.stringify(between.slice(0, 40))}`)
    if (lt === -1) break
    TAG.lastIndex = lt
    const m = TAG.exec(svg)
    assert.ok(m, `malformed tag at ${lt}: ${JSON.stringify(svg.slice(lt, lt + 60))}`)
    const [whole, closing, name, , selfClosing] = m
    if (closing) {
      assert.equal(stack.pop(), name, `</${name}> closes the wrong element`)
    } else if (!selfClosing) {
      stack.push(name!)
    }
    if (stack.length === 0) assert.equal(lt + whole.length, svg.length, 'nothing after the root closes')
    i = lt + whole.length
  }
  assert.equal(stack.length, 0, `unclosed: ${stack.join(' > ')}`)
}

/** Every check a picture must pass whatever it draws. */
export function assertPicture(p: Picture): void {
  assertWellFormed(p.svg)
  assert.ok(p.svg.length <= SVG_BUDGET, 'inside the size budget')
  assert.ok(p.alt.length > 0, 'has alt text')
  assert.equal(typeof p.twin, 'string')
  assert.equal(typeof p.isInteractive, 'boolean')
}

/** The opening tag of the first element carrying `cls`. */
export function tagOf(svg: string, cls: string): string {
  const m = new RegExp(`<[a-z]+ [^>]*class="${cls}"[^>]*>`).exec(svg)
  assert.ok(m, `an element with class ${cls}`)
  return m[0]
}

export function attrOf(svg: string, cls: string, name: string): string {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tagOf(svg, cls))
  assert.ok(m, `${cls} has ${name}`)
  return m[1]!
}

export function numAttr(svg: string, cls: string, name: string): number {
  return Number(attrOf(svg, cls, name))
}

/** The numbers of a path's `d`, in order. */
export function pathNumbers(d: string): number[] {
  return (d.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
}

/** Where a path ends: its last two numbers. */
export function pathEnd(d: string): { x: number; y: number } {
  const n = pathNumbers(d)
  return { x: n[n.length - 2]!, y: n[n.length - 1]! }
}

/** The text of the first `<text>` carrying `cls`. */
export function textOf(svg: string, cls: string): string {
  const m = new RegExp(`<text [^>]*class="${cls}"[^>]*>([^<]*)</text>`).exec(svg)
  assert.ok(m, `a text with class ${cls}`)
  return m[1]!
}

export function near(actual: number, expected: number, message?: string, tolerance = 0.02): void {
  assert.ok(Math.abs(actual - expected) <= tolerance, `${message ?? 'value'}: ${actual} is not ${expected}`)
}

export const HOSTILE = '<script>alert("x")</script> & </text><svg onload="y">'

/** A hostile label reaches the markup escaped, and only escaped. */
export function assertEscaped(svg: string): void {
  assertWellFormed(svg)
  assert.doesNotMatch(svg, /<script/i)
  assert.doesNotMatch(svg, /<svg onload/)
  assert.match(svg, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt; &amp; &lt;\/text&gt;/)
}
