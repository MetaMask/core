import { normalizeGasValue } from './utils';

describe('normalizeGasValue', () => {
  it('should return a hex string when given a number', () => {
    const gasValue = 1000;
    const expectedHex = '0x3e8'; // 1000 in hexadecimal
    const normalizedValue = normalizeGasValue(gasValue);
    expect(normalizedValue).toBe(expectedHex);
  });

  it('should return the same string when given a string', () => {
    const gasValue = '0x3e8';
    const normalizedValue = normalizeGasValue(gasValue);
    expect(normalizedValue).toBe(gasValue);
  });
});
