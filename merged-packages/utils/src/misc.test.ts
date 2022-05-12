import {
  isNonEmptyArray,
  isNullOrUndefined,
  isObject,
  hasProperty,
  RuntimeObject,
} from '.';

describe('miscellaneous', () => {
  describe('isNonEmptyArray', () => {
    it('identifies non-empty arrays', () => {
      [[1], [1, 2], [1, 2, 3, 4, 5]].forEach((nonEmptyArray) => {
        expect(isNonEmptyArray<unknown>(nonEmptyArray)).toBe(true);
      });
    });

    it('identifies empty arrays', () => {
      expect(isNonEmptyArray<unknown>([])).toBe(false);
    });
  });

  describe('isNullOrUndefined', () => {
    it('identifies null and undefined', () => {
      expect(isNullOrUndefined(null)).toBe(true);
      expect(isNullOrUndefined(undefined)).toBe(true);
    });

    it('identifies non-nullish values', () => {
      [false, 1, 0, -1, '', [], () => undefined].forEach(
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
        () => undefined,
        Promise.resolve,
        1,
        null,
        undefined,
        'a',
      ].forEach((nonObjectValue) => {
        expect(isObject(nonObjectValue)).toBe(false);
      });
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
      ([
        [{ a: 1 }, 'a'],
        [{ [symbol]: 1 }, symbol],
        [{ 2: 'b' }, 2],
        [{ a: 1, 2: 'b', c: 'x' }, 'c'],
      ] as const).forEach(([objectValue, property]) => {
        expect(hasProperty(objectValue, property)).toBe(true);
      });
    });

    it('returns `true` for non-enumerable properties', () => {
      ([
        [getNonEnumerable('a'), 'a'],
        [getNonEnumerable(symbol), symbol],
        [getNonEnumerable(2), 2],
      ] as const).forEach(([objectValue, property]) => {
        expect(hasProperty(objectValue, property)).toBe(true);
      });
    });

    it('returns `false` for missing properties', () => {
      ([
        [{}, 'a'],
        [{ a: 1 }, 'b'],
        // Object.hasOwnProperty does not work for arrays
        // [['foo'], 0],
        // [['foo'], '0'],
      ] as any[]).forEach(([objectValue, property]) => {
        expect(hasProperty(objectValue, property)).toBe(false);
      });
    });
  });
});
