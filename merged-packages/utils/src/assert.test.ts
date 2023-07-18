import { string, assert as superstructAssert } from 'superstruct';

import {
  assert,
  assertExhaustive,
  AssertionError,
  assertStruct,
} from './assert';

jest.mock('superstruct', () => ({
  ...jest.requireActual('superstruct'),
  assert: jest.fn(),
}));

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
});

describe('assertExhaustive', () => {
  it('throws', () => {
    expect(() => assertExhaustive('foo' as never)).toThrow(
      'Invalid branch reached. Should be detected during compilation.',
    );
  });
});

describe('assertStruct', () => {
  beforeEach(() => {
    const actual = jest.requireActual('superstruct');
    (
      superstructAssert as jest.MockedFunction<typeof superstructAssert>
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
    const CustomError = ({ message }: { message: string }) =>
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
      superstructAssert as jest.MockedFunction<typeof superstructAssert>
    ).mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literal
      throw 'foo.';
    });

    expect(() => assertStruct(true, string())).toThrow(
      'Assertion failed: foo.',
    );
  });
});
