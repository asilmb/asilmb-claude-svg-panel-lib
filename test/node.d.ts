// The few Node test APIs these tests use, so `tsc` needs no @types package.

declare module 'node:test' {
  export function test(name: string, body: () => void | Promise<void>): void
  export function describe(name: string, body: () => void): void
}

declare module 'node:assert/strict' {
  type Assert = {
    (value: unknown, message?: string): asserts value
    equal(actual: unknown, expected: unknown, message?: string): void
    notEqual(actual: unknown, expected: unknown, message?: string): void
    deepEqual(actual: unknown, expected: unknown, message?: string): void
    match(value: string, pattern: RegExp, message?: string): void
    doesNotMatch(value: string, pattern: RegExp, message?: string): void
    ok(value: unknown, message?: string): asserts value
    throws(fn: () => unknown, expected?: RegExp | (new (...args: never[]) => Error), message?: string): void
  }
  const assert: Assert
  export default assert
}
