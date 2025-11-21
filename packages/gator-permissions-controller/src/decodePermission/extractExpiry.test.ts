import { createTimestampTerms } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import { extractExpiryFromCaveatTerms } from './decodePermission';

describe('Expiry Extraction Functions', () => {
  describe('extractExpiryFromCaveatTerms', () => {
    it('extracts valid expiry timestamp', () => {
      const mockExpiryTimestamp = 1767225600; // January 1, 2026
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: mockExpiryTimestamp,
      });

      const result = extractExpiryFromCaveatTerms(terms);

      expect(result).toBe(mockExpiryTimestamp);
    });

    it('returns null when expiry is 0', () => {
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: 0,
      });

      const result = extractExpiryFromCaveatTerms(terms);

      expect(result).toBeNull();
    });

    it('throws error when timestampAfterThreshold is non-zero', () => {
      const terms = createTimestampTerms({
        timestampAfterThreshold: 1,
        timestampBeforeThreshold: 1767225600,
      });

      expect(() => extractExpiryFromCaveatTerms(terms)).toThrow(
        'Invalid expiry: timestampAfterThreshold must be 0',
      );
    });

    it('handles large valid expiry timestamp', () => {
      // Use a large but valid timestamp (year 9999: 253402300799)
      const largeTimestamp = 253402300799;
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: largeTimestamp,
      });

      const result = extractExpiryFromCaveatTerms(terms);

      expect(result).toBe(largeTimestamp);
    });

    it('extracts expiry from realistic timestamp enforcer terms', () => {
      const timestampBeforeThreshold = 1735689600; // Jan 1, 2025
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold,
      });

      const result = extractExpiryFromCaveatTerms(terms);

      expect(result).toBe(timestampBeforeThreshold);
    });

    it('properly handles terms with only before threshold set', () => {
      const expiryTimestamp = 1640995200; // Jan 1, 2022
      const terms = createTimestampTerms({
        timestampAfterThreshold: 0,
        timestampBeforeThreshold: expiryTimestamp,
      });

      const result = extractExpiryFromCaveatTerms(terms);

      expect(result).toBe(expiryTimestamp);
    });

    it('throws error for terms that are too short', () => {
      const shortTerms = '0x1234' as Hex;

      expect(() => extractExpiryFromCaveatTerms(shortTerms)).toThrow(
        'Invalid TimestampEnforcer terms length: expected 66 characters (0x + 64 hex), got 6',
      );
    });

    it('throws error for terms that are too long', () => {
      const longTerms = `0x${'0'.repeat(68)}` as Hex;

      expect(() => extractExpiryFromCaveatTerms(longTerms)).toThrow(
        'Invalid TimestampEnforcer terms length: expected 66 characters (0x + 64 hex), got 70',
      );
    });

    it('throws error for terms missing 0x prefix', () => {
      const termsWithoutPrefix = '0'.repeat(64) as Hex;

      expect(() => extractExpiryFromCaveatTerms(termsWithoutPrefix)).toThrow(
        'Invalid TimestampEnforcer terms length',
      );
    });

    it('throws error when expiry timestamp is not a safe integer', () => {
      // hexToNumber from @metamask/utils validates safe integers automatically
      // Use maximum uint128 value which exceeds Number.MAX_SAFE_INTEGER
      const maxUint128 = 'f'.repeat(32);
      const termsHex = `0x${'0'.repeat(32)}${maxUint128}` as Hex;

      expect(() => extractExpiryFromCaveatTerms(termsHex)).toThrow(
        'Value is not a safe integer',
      );
    });
  });
});
