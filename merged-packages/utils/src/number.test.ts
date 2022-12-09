import { NUMBER_VALUES } from './__fixtures__';
import { bigIntToHex, hexToBigInt, hexToNumber, numberToHex } from './number';

describe('numberToHex', () => {
  it.each(NUMBER_VALUES)(
    'converts a number to a hex string',
    ({ number, hexadecimal }) => {
      expect(numberToHex(number)).toBe(hexadecimal);
    },
  );

  it.each([true, false, null, undefined, {}, [], '', '0x', '0x0', BigInt(1)])(
    'throws if the value is not a number',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => numberToHex(value)).toThrow('Value must be a number.');
    },
  );

  it.each([-1, -1e100, -Infinity, NaN])(
    'throws if the value is negative',
    (value) => {
      expect(() => numberToHex(value)).toThrow(
        'Value must be a non-negative number.',
      );
    },
  );

  it.each([1.1, 1e100, Infinity])(
    'throws if the value is not a safe integer',
    (value) => {
      expect(() => numberToHex(value)).toThrow(
        'Value is not a safe integer. Use `bigIntToHex` instead.',
      );
    },
  );
});

describe('bigIntToHex', () => {
  it.each(NUMBER_VALUES)(
    'converts a bigint to a hex string',
    ({ bigint, hexadecimal }) => {
      expect(bigIntToHex(bigint)).toBe(hexadecimal);
    },
  );

  it.each([true, false, null, undefined, {}, [], '', '0x', '0x0', 1])(
    'throws if the value is not a bigint',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => bigIntToHex(value)).toThrow('Value must be a bigint.');
    },
  );

  it.each([BigInt(-1), BigInt('-100')])(
    'throws if the value is negative',
    (value) => {
      expect(() => bigIntToHex(value)).toThrow(
        'Value must be a non-negative bigint.',
      );
    },
  );
});

describe('hexToNumber', () => {
  it.each(NUMBER_VALUES)(
    'converts a hex string to a number',
    ({ number, hexadecimal }) => {
      expect(hexToNumber(hexadecimal)).toBe(number);
    },
  );

  it.each([true, false, null, undefined, 0, 1, '', [], {}, BigInt(1)])(
    'throws if the value is not a hexadecimal string',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => hexToNumber(value)).toThrow(
        'Value must be a hexadecimal string.',
      );
    },
  );
});

describe('hexToBigInt', () => {
  it.each(NUMBER_VALUES)(
    'converts a hex string to a bigint',
    ({ bigint, hexadecimal }) => {
      expect(hexToBigInt(hexadecimal)).toBe(bigint);
    },
  );

  it.each([true, false, null, undefined, 0, 1, '', [], {}, BigInt(1)])(
    'throws if the value is not a hexadecimal string',
    (value) => {
      // @ts-expect-error Invalid type.
      expect(() => hexToBigInt(value)).toThrow(
        'Value must be a hexadecimal string.',
      );
    },
  );
});
