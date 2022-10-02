import {
  isNonEmptyArray,
  isNullOrUndefined,
  isObject,
  hasProperty,
  RuntimeObject,
  isPlainObject,
  calculateNumberSize,
  isASCII,
  calculateStringSize,
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
      (
        [
          [{ a: 1 }, 'a'],
          [{ [symbol]: 1 }, symbol],
          [{ 2: 'b' }, 2],
          [{ a: 1, 2: 'b', c: 'x' }, 'c'],
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
          // Object.hasOwnProperty does not work for arrays
          // [['foo'], 0],
          // [['foo'], '0'],
        ] as any[]
      ).forEach(([objectValue, property]) => {
        expect(hasProperty(objectValue, property)).toBe(false);
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
      const someFunction = (someArg: string) => {
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
      const someObject = { something: 'anything' };
      jest.spyOn(Object, 'getPrototypeOf').mockImplementationOnce(() => {
        throw new Error();
      });

      expect(isPlainObject(someObject)).toBe(false);
    });
  });

  describe('isASCII', () => {
    it('should return true for "A" which is the ASCII character', () => {
      expect(isASCII('A')).toBe(true);
    });

    it('should return false for "Š" which is not the ASCII character', () => {
      expect(isASCII('Š')).toBe(false);
    });
  });

  describe('calculateStringSize', () => {
    it('should return 96 for a size of ASCII string', () => {
      const str =
        '!"#$%&\'()*+,-./0123456789:;<=>?' +
        '@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]' +
        '^_`abcdefghijklmnopqrstuvwxyz{|}~';
      expect(calculateStringSize(str)).toBe(96);
    });

    it('should return 10 for a size of UTF8 string', () => {
      const str = 'šđćčž';
      expect(calculateStringSize(str)).toBe(10);
    });

    it('should return 15 for a size of mixed, ASCII and UTF8 string', () => {
      const str = 'ašbđcćdčež';
      expect(calculateStringSize(str)).toBe(15);
    });

    it('should return 10 for a size of special characters', () => {
      const str = '"\\\n\r\t';
      expect(calculateStringSize(str)).toBe(10);
    });
  });

  describe('calculateNumberSize', () => {
    it('should return 3 for a "100" number size', () => {
      expect(calculateNumberSize(100)).toBe(3);
    });

    it('should return 4 for a "-100" number size', () => {
      expect(calculateNumberSize(-100)).toBe(4);
    });

    it('should return 4 for a "-0.3" number size', () => {
      expect(calculateNumberSize(-0.3)).toBe(4);
    });

    it('should return 7 for a "-123.45" number size', () => {
      expect(calculateNumberSize(-123.45)).toBe(7);
    });

    it('should return 5 for a "0.0000000005" number size', () => {
      // Because the number provided here will be changed to exponential notation
      // 5e-10 by default
      expect(calculateNumberSize(0.0000000005)).toBe(5);
    });

    it('should return 16 for a "9007199254740991" number size', () => {
      expect(calculateNumberSize(9007199254740991)).toBe(16);
    });

    it('should return 17 for a "-9007199254740991" number size', () => {
      expect(calculateNumberSize(-9007199254740991)).toBe(17);
    });

    it('should return 1 for a "0" number size', () => {
      expect(calculateNumberSize(0)).toBe(1);
    });

    it('should return 15 for a "100000.00000008" number size', () => {
      expect(calculateNumberSize(100000.00000008)).toBe(15);
    });
  });
});
