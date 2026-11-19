import { string, assert as superstructAssert } from '@metamask/superstruct';
import type { MockedFunction } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertStruct } from './assert.js';

vi.mock(import('@metamask/superstruct'), async (importOriginal) => ({
  ...(await importOriginal()),
  assert: vi.fn(),
}));

describe('assertStruct', () => {
  beforeEach(async () => {
    const actual = await vi.importActual<
      typeof import('@metamask/superstruct')
    >('@metamask/superstruct');
    (
      superstructAssert as MockedFunction<typeof superstructAssert>
    ).mockImplementation(actual.assert);
  });

  it('does not throw for a valid value', () => {
    expect(() => assertStruct('foo', string())).not.toThrow();
  });

  it('throws meaningful error messages for an invalid value', () => {
    expect(() => assertStruct(undefined, string())).toThrow(
      'Assertion failed: Expected a string, but received: undefined.',
    );

    expect(() => assertStruct(1, string())).toThrow(
      'Assertion failed: Expected a string, but received: 1.',
    );
  });

  it('throws with a custom error prefix', () => {
    expect(() => assertStruct(null, string(), 'Invalid string')).toThrow(
      'Invalid string: Expected a string, but received: null.',
    );
  });

  it('throws with a custom error class', () => {
    class CustomError extends Error {
      constructor({ message }: { message: string }) {
        super(message);
        this.name = 'CustomError';
      }
    }

    expect(() =>
      assertStruct({ data: 'foo' }, string(), 'Invalid string', CustomError),
    ).toThrow(
      new CustomError({
        message:
          'Invalid string: Expected a string, but received: [object Object].',
      }),
    );
  });

  it('throws with a custom error function', () => {
    const CustomError = ({ message }: { message: string }): Error =>
      new Error(message);

    expect(() =>
      assertStruct({ data: 'foo' }, string(), 'Invalid string', CustomError),
    ).toThrow(
      CustomError({
        message:
          'Invalid string: Expected a string, but received: [object Object].',
      }),
    );
  });

  it('includes the value thrown in the message if it is not an error', () => {
    (
      superstructAssert as MockedFunction<typeof superstructAssert>
    ).mockImplementation(() => {
      // oxlint-disable-next-line no-throw-literal, typescript/only-throw-error
      throw 'foo.';
    });

    expect(() => assertStruct(true, string())).toThrow(
      'Assertion failed: foo.',
    );
  });
});
