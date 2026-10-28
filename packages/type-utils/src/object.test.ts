import { describe, expect, it } from 'vitest';

import {
  getKnownPropertyNames,
  hasProperty,
  isNullOrUndefined,
  isObject,
  isPlainObject,
  RuntimeObject,
} from './object.js';

describe('isNullOrUndefined', () => {
  it('identifies null and undefined', () => {
    expect(isNullOrUndefined(null)).toBe(true);
    expect(isNullOrUndefined(undefined)).toBe(true);
  });

  it('identifies non-nullish values', () => {
    [false, 1, 0, -1, '', [], (): undefined => undefined].forEach(
      (nonNullOrUndefinedValue) => {
        expect(isNullOrUndefined(nonNullOrUndefinedValue)).toBe(false);
      },
    );
  });
});

describe('isObject', () => {
  class Foo {}

  it('identifies object values', () => {
    [new Foo(), {}, Promise.resolve(), new Error()].forEach((objectValue) => {
      expect(isObject(objectValue)).toBe(true);
    });
  });

  it('identifies non-object values', () => {
    [
      Symbol('foo'),
      [],
      (): undefined => undefined,
      Promise.resolve.bind(Promise),
      1,
      null,
      undefined,
      'a',
    ].forEach((nonObjectValue) => {
      expect(isObject(nonObjectValue)).toBe(false);
    });
  });
});

describe('isPlainObject', () => {
  it('should return true for a plain object', () => {
    const somePlainObject = {
      someKey: 'someValue',
    };

    expect(isPlainObject(somePlainObject)).toBe(true);
  });

  it('should return false if function is passed', () => {
    const someFunction = (someArg: string): string => {
      return someArg;
    };

    expect(isPlainObject(someFunction)).toBe(false);
  });

  it('should return false if Set object is passed', () => {
    const someSet = new Set();
    someSet.add('something');

    expect(isPlainObject(someSet)).toBe(false);
  });

  it('should return false if an exception is thrown', () => {
    const someObject = new Proxy(
      { something: 'anything' },
      {
        getPrototypeOf(): never {
          throw new Error();
        },
      },
    );

    expect(isPlainObject(someObject)).toBe(false);
  });
});

describe('hasProperty', () => {
  const symbol = Symbol('bar');

  const getNonEnumerable = (
    key: string | number | symbol,
    value: unknown = 'foo',
  ): RuntimeObject => {
    const obj = {};
    Object.defineProperty(obj, key, {
      value,
      enumerable: false,
    });

    return obj;
  };

  it('returns `true` for enumerable properties', () => {
    (
      [
        [{ a: 1 }, 'a'],
        [{ [symbol]: 1 }, symbol],
        [{ two: 'b' }, 'two'],
        [{ a: 1, two: 'b', c: 'x' }, 'c'],
      ] as const
    ).forEach(([objectValue, property]) => {
      expect(hasProperty(objectValue, property)).toBe(true);
    });
  });

  it('returns `true` for non-enumerable properties', () => {
    (
      [
        [getNonEnumerable('a'), 'a'],
        [getNonEnumerable(symbol), symbol],
        [getNonEnumerable(2), 2],
      ] as const
    ).forEach(([objectValue, property]) => {
      expect(hasProperty(objectValue, property)).toBe(true);
    });
  });

  it('returns `false` for missing properties', () => {
    (
      [
        [{}, 'a'],
        [{ a: 1 }, 'b'],
      ] as const
    ).forEach(([objectValue, property]) => {
      expect(hasProperty(objectValue, property)).toBe(false);
    });
  });
});

describe('getKnownPropertyNames', () => {
  it('returns the own property names of the object', () => {
    const object = { foo: 'bar', baz: 'qux' };

    expect(getKnownPropertyNames(object)).toStrictEqual(['foo', 'baz']);
  });

  it('does not return inherited properties', () => {
    const superObject = { foo: 'bar' };
    const object = Object.create(superObject) as Record<string, never>;

    expect(getKnownPropertyNames(object)).toStrictEqual([]);
  });
});
