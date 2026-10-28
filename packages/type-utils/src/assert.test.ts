import { describe, expect, it } from 'vitest';

import { assert, assertExhaustive, AssertionError } from './assert.js';

describe('assert', () => {
  it('succeeds', () => {
    expect(() => assert(true)).not.toThrow();
  });

  it('narrows type scope', () => {
    const item: { foo: 1 } | undefined = { foo: 1 };

    assert(item !== undefined);

    // This will fail to compile otherwise
    expect(item.foo).toBe(1);
  });

  it('throws', () => {
    expect(() => assert(false, 'Thrown')).toThrow(AssertionError);
  });

  it('throws with default message', () => {
    expect(() => assert(false)).toThrow('Assertion failed.');
  });

  it('throws a custom error', () => {
    class MyError extends Error {}
    expect(() => assert(false, new MyError('Thrown'))).toThrow(MyError);
  });

  it('throws a constructable error', () => {
    class MyError extends AssertionError {}
    expect(() => assert(false, 'foo', MyError)).toThrow(MyError);
  });

  it('throws an error created by a factory function', () => {
    const createError = ({ message }: { message: string }): Error =>
      new RangeError(message);

    expect(() => assert(false, 'foo', createError)).toThrow(
      new RangeError('foo'),
    );
  });
});

describe('assertExhaustive', () => {
  it('throws', () => {
    expect(() => assertExhaustive('foo' as never)).toThrow(
      'Invalid branch reached. Should be detected during compilation.',
    );
  });
});
