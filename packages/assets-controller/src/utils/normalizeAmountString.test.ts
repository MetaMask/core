import { normalizeAmountString } from './normalizeAmountString';

describe('normalizeAmountString', () => {
  it('passes plain decimal strings through unchanged', () => {
    expect(normalizeAmountString('1.5')).toBe('1.5');
    expect(normalizeAmountString('0')).toBe('0');
    expect(normalizeAmountString('1000000000')).toBe('1000000000');
    expect(normalizeAmountString('0.000000000000000001')).toBe(
      '0.000000000000000001',
    );
  });

  it('converts lowercase-e scientific notation to plain decimal', () => {
    expect(normalizeAmountString('1e-18')).toBe('0.000000000000000001');
    expect(normalizeAmountString('1e-6')).toBe('0.000001');
  });

  it('converts uppercase-E scientific notation to plain decimal', () => {
    expect(normalizeAmountString('1E+5')).toBe('100000');
    expect(normalizeAmountString('2.5E2')).toBe('250');
  });

  it('preserves the sign of negative exponent-form values', () => {
    expect(normalizeAmountString('-1e-10')).toBe('-0.0000000001');
  });

  it('returns "0" for non-finite values to keep state JSON-safe', () => {
    expect(normalizeAmountString('NaN')).toBe('0');
    expect(normalizeAmountString('Infinity')).toBe('0');
    expect(normalizeAmountString('-Infinity')).toBe('0');
  });

  it('returns "0" for non-string and empty input', () => {
    expect(normalizeAmountString(undefined)).toBe('0');
    expect(normalizeAmountString(null)).toBe('0');
    expect(normalizeAmountString(1)).toBe('0');
    expect(normalizeAmountString('')).toBe('0');
  });
});
