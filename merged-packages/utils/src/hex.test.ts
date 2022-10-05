import {
  add0x,
  assertIsHexString,
  assertIsStrictHexString,
  isHexString,
  isStrictHexString,
  remove0x,
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
