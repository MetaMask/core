import type { Hex } from './hex';
import {
  add0x,
  assertIsHexString,
  assertIsStrictHexString,
  isValidChecksumAddress,
  isHexString,
  isStrictHexString,
  isValidHexAddress,
  remove0x,
  getChecksumAddress,
} from './hex';

describe('isHexString', () => {
  it.each([
    '0x12345',
    '0x1234567890abcdef',
    '0x1234567890ABCDEF',
    '0x1234567890abcdefABCDEF',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEF',
    '12345',
    '1234567890abcdef',
    '1234567890ABCDEF',
    '1234567890abcdefABCDEF',
    '1234567890abcdefABCDEF1234567890abcdefABCDEF',
  ])('returns true for a valid hex string', (hexString) => {
    expect(isHexString(hexString)).toBe(true);
  });

  it.each([
    true,
    false,
    null,
    undefined,
    0,
    1,
    {},
    [],
    '0x12345g',
    '0x1234567890abcdefg',
    '0x1234567890abcdefG',
    '0x1234567890abcdefABCDEFg',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEFg',
  ])('returns false for an invalid hex string', (hexString) => {
    expect(isHexString(hexString)).toBe(false);
  });
});

describe('isStrictHexString', () => {
  it.each([
    '0x12345',
    '0x1234567890abcdef',
    '0x1234567890ABCDEF',
    '0x1234567890abcdefABCDEF',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEF',
  ])('returns true for a valid hex string', (hexString) => {
    expect(isStrictHexString(hexString)).toBe(true);
  });

  it.each([
    true,
    false,
    null,
    undefined,
    0,
    1,
    {},
    [],
    '0x12345g',
    '0x1234567890abcdefg',
    '0x1234567890abcdefG',
    '0x1234567890abcdefABCDEFg',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEFg',
    '12345',
    '1234567890abcdef',
    '1234567890ABCDEF',
    '1234567890abcdefABCDEF',
    '1234567890abcdefABCDEF1234567890abcdefABCDEF',
  ])('returns false for an invalid hex string', (hexString) => {
    expect(isStrictHexString(hexString)).toBe(false);
  });
});

describe('assertIsHexString', () => {
  it.each([
    '0x12345',
    '0x1234567890abcdef',
    '0x1234567890ABCDEF',
    '0x1234567890abcdefABCDEF',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEF',
    '12345',
    '1234567890abcdef',
    '1234567890ABCDEF',
    '1234567890abcdefABCDEF',
    '1234567890abcdefABCDEF1234567890abcdefABCDEF',
  ])('does not throw for a valid hex string', (hexString) => {
    expect(() => assertIsHexString(hexString)).not.toThrow();
  });

  it.each([
    true,
    false,
    null,
    undefined,
    0,
    1,
    {},
    [],
    '0x12345g',
    '0x1234567890abcdefg',
    '0x1234567890abcdefG',
    '0x1234567890abcdefABCDEFg',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEFg',
  ])('throws for an invalid hex string', (hexString) => {
    expect(() => assertIsHexString(hexString)).toThrow(
      'Value must be a hexadecimal string.',
    );
  });
});

describe('assertIsStrictHexString', () => {
  it.each([
    '0x12345',
    '0x1234567890abcdef',
    '0x1234567890ABCDEF',
    '0x1234567890abcdefABCDEF',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEF',
  ])('does not throw for a valid hex string', (hexString) => {
    expect(() => assertIsStrictHexString(hexString)).not.toThrow();
  });

  it.each([
    true,
    false,
    null,
    undefined,
    0,
    1,
    {},
    [],
    '0x12345g',
    '0x1234567890abcdefg',
    '0x1234567890abcdefG',
    '0x1234567890abcdefABCDEFg',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEFg',
    '12345',
    '1234567890abcdef',
    '1234567890ABCDEF',
    '1234567890abcdefABCDEF',
    '1234567890abcdefABCDEF1234567890abcdefABCDEF',
  ])('throws for an invalid hex string', (hexString) => {
    expect(() => assertIsStrictHexString(hexString)).toThrow(
      'Value must be a hexadecimal string, starting with "0x".',
    );
  });
});

describe('isValidHexAddress', () => {
  it.each([
    '0x0000000000000000000000000000000000000000' as Hex,
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Hex,
  ])('returns true for a valid prefixed hex address', (hexString) => {
    expect(isValidHexAddress(hexString)).toBe(true);
  });

  it.each([
    '0000000000000000000000000000000000000000',
    'd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  ])('returns false for a valid non-prefixed hex address', (hexString) => {
    // @ts-expect-error - testing invalid input
    expect(isValidHexAddress(hexString)).toBe(false);
  });

  it.each([
    '12345g',
    '1234567890abcdefg',
    '1234567890abcdefG',
    '1234567890abcdefABCDEFg',
    '1234567890abcdefABCDEF1234567890abcdefABCDEFg',
    '0x',
    '0x0',
    '0x12345g',
    '0x1234567890abcdefg',
    '0x1234567890abcdefG',
    '0x1234567890abcdefABCDEFg',
    '0x1234567890abcdefABCDEF1234567890abcdefABCDEFg',
    '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045',
    '0xCF5609B003B2776699EEA1233F7C82D5695CC9AA',
    '0Xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
  ])('returns false for an invalid hex address', (hexString) => {
    // @ts-expect-error - testing invalid input
    expect(isValidHexAddress(hexString)).toBe(false);
  });
});

describe('getChecksumAddress', () => {
  it('returns the checksum address for a valid hex address', () => {
    expect(
      getChecksumAddress('0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed'),
    ).toBe('0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed');

    expect(
      getChecksumAddress('0xfb6916095ca1df60bb79ce92ce3ea74c37c5d359'),
    ).toBe('0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359');

    expect(
      getChecksumAddress('0x52908400098527886e0f7030069857d2e4169ee7'),
    ).toBe('0x52908400098527886E0F7030069857D2E4169EE7');

    expect(
      getChecksumAddress('0xde709f2102306220921060314715629080e2fb77'),
    ).toBe('0xde709f2102306220921060314715629080e2fb77');

    expect(
      getChecksumAddress('0x0000000000000000000000000000000000000000'),
    ).toBe('0x0000000000000000000000000000000000000000');
  });

  it('throws for an invalid hex address', () => {
    expect(() => getChecksumAddress('0x')).toThrow('Invalid hex address.');
  });
});

describe('isValidChecksumAddress', () => {
  it.each([
    '0x0000000000000000000000000000000000000000' as Hex,
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Hex,
    '0xCf5609B003B2776699eEA1233F7C82D5695cC9AA' as Hex,
    '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045' as Hex,
    '0x8617E340B3D01FA5F11F306F4090FD50E238070D' as Hex,
  ])('returns true for a valid checksum address', (hexString) => {
    expect(isValidChecksumAddress(hexString)).toBe(true);
  });

  it.each([
    '0xz' as Hex,
    '0xD8DA6BF26964AF9D7EED9E03E53415D37AA96045' as Hex,
    '0xCF5609B003B2776699EEA1233F7C82D5695CC9AA' as Hex,
  ])('returns false for an invalid checksum address', (hexString) => {
    expect(isValidChecksumAddress(hexString)).toBe(false);
  });
});

describe('add0x', () => {
  it('adds a 0x-prefix to a string', () => {
    expect(add0x('12345')).toBe('0x12345');
  });

  it('does not add a 0x-prefix if it is already present', () => {
    expect(add0x('0x12345')).toBe('0x12345');
    expect(add0x('0X12345')).toBe('0x12345');
  });
});

describe('remove0x', () => {
  it('removes a 0x-prefix from a string', () => {
    expect(remove0x('0x12345')).toBe('12345');
    expect(remove0x('0X12345')).toBe('12345');
  });

  it('does not remove a 0x-prefix if it is not present', () => {
    expect(remove0x('12345')).toBe('12345');
  });
});
