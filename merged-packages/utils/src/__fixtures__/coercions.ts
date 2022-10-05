import type { Hex } from '../hex';

export const POSITIVE_INTEGERS = [0, 1, 10, 100, 1000, 123456789, 2147483647];
export const NEGATIVE_INTEGERS = [
  -1, -10, -100, -1000, -123456789, -2147483647,
];
export const DECIMAL_NUMBERS = [
  1.1, 1.123456789, 1.123456789123456789, -1.1, -1.123456789,
  -1.123456789123456789,
];

export const HEX_STRINGS: Hex[] = [
  '0x',
  '0x00',
  '0x1a',
  '0x2b',
  '0x3c',
  '0xff',
  '0xff00ff',
  '0x1234567890abcdef',
  '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
];
