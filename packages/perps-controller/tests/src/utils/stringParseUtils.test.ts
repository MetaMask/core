/* eslint-disable */
import {
  parseBoundedNonNegativeDecimal,
  stripQuotes,
  parseCommaSeparatedString,
} from '../../../src/utils/stringParseUtils.js';

describe('stripQuotes', () => {
  it('removes single layer of double quotes', () => {
    expect(stripQuotes('"hello"')).toBe('hello');
  });

  it('removes single layer of single quotes', () => {
    expect(stripQuotes("'hello'")).toBe('hello');
  });

  it('removes nested quotes (single wrapping double)', () => {
    // Simulates LaunchDarkly returning '"xyz:TSLA"' (single quotes wrapping double quotes)
    expect(stripQuotes(`'"xyz:TSLA"'`)).toBe('xyz:TSLA');
  });

  it('removes multiple layers of double quotes', () => {
    expect(stripQuotes('""xyz""')).toBe('xyz');
  });

  it('removes mixed nested quotes (double wrapping single)', () => {
    expect(stripQuotes(`"'xyz'"`)).toBe('xyz');
  });

  it('returns string unchanged when no wrapping quotes', () => {
    expect(stripQuotes('hello')).toBe('hello');
  });

  it('returns empty string unchanged', () => {
    expect(stripQuotes('')).toBe('');
  });

  it('does not remove mismatched quotes', () => {
    expect(stripQuotes(`"hello'`)).toBe(`"hello'`);
  });

  it('does not remove quotes in the middle', () => {
    expect(stripQuotes('hel"lo')).toBe('hel"lo');
  });

  it('handles deeply nested single quotes', () => {
    expect(stripQuotes(`'''xyz'''`)).toBe('xyz');
  });

  it('handles real LaunchDarkly pattern with nested quotes', () => {
    // The actual problematic value: single-quote wrapped double-quoted string
    expect(stripQuotes(`'"xyz:TSLA"'`)).toBe('xyz:TSLA');
  });
});

describe('parseCommaSeparatedString', () => {
  it('parses comma-separated values', () => {
    expect(parseCommaSeparatedString('BTC,ETH,SOL')).toEqual([
      'BTC',
      'ETH',
      'SOL',
    ]);
  });

  it('trims whitespace', () => {
    expect(parseCommaSeparatedString(' BTC , ETH , SOL ')).toEqual([
      'BTC',
      'ETH',
      'SOL',
    ]);
  });

  it('filters empty values', () => {
    expect(parseCommaSeparatedString('BTC,,SOL')).toEqual(['BTC', 'SOL']);
  });

  it('returns empty array for empty string', () => {
    expect(parseCommaSeparatedString('')).toEqual([]);
  });
});

describe('bounded decimal parsing', () => {
  it.each([
    ['0', 0],
    ['0.5', 0.5],
    ['100', 100],
  ])('parses non-negative decimal %p', (value, expected) => {
    expect(parseBoundedNonNegativeDecimal(value)).toBe(expected);
  });

  it.each(['', '-1', '.5', '1.', '1e5', ' 1', '1 ', '0x10', 'Infinity'])(
    'rejects malformed decimal %p',
    (value) => {
      expect(parseBoundedNonNegativeDecimal(value)).toBeNull();
    },
  );

  it.each([1, null, undefined])('rejects non-string value %p', (value) => {
    expect(parseBoundedNonNegativeDecimal(value)).toBeNull();
  });

  it('rejects values above the supplied bound', () => {
    expect(parseBoundedNonNegativeDecimal('1.1', 1)).toBeNull();
  });
});
