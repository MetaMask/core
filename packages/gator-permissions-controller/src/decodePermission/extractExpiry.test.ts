import { createTimestampTerms } from '@metamask/delegation-core';
import type { Hex } from '@metamask/utils';

import {
  extractExpiryFromCaveatTerms,
  extractExpiryFromPermissionContext,
} from './decodePermission';

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

    it('handles maximum uint128 expiry timestamp', () => {
      // Max uint128 would overflow, but test a large value
      const largeTimestamp = Number.MAX_SAFE_INTEGER;
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

    it('throws error when expiry timestamp exceeds Number.MAX_SAFE_INTEGER', () => {
      // Create a value larger than MAX_SAFE_INTEGER (2^53 - 1)
      // Use a value like 2^64 which is well within uint128 range but too large for JS number
      const largeValue = '0xffffffffffffffff'; // 2^64 - 1
      const termsHex = `0x${'0'.repeat(32)}${largeValue.slice(2)}` as Hex;

      expect(() => extractExpiryFromCaveatTerms(termsHex)).toThrow(
        'Invalid expiry: timestamp exceeds Number.MAX_SAFE_INTEGER',
      );
    });

    it('throws error when expiry would convert to Infinity', () => {
      // Use maximum uint128 value which would convert to Infinity
      const maxUint128 = 'f'.repeat(32);
      const termsHex = `0x${'0'.repeat(32)}${maxUint128}` as Hex;

      expect(() => extractExpiryFromCaveatTerms(termsHex)).toThrow(
        'Invalid expiry: timestamp exceeds Number.MAX_SAFE_INTEGER',
      );
    });

    it('accepts maximum safe integer timestamp', () => {
      // Number.MAX_SAFE_INTEGER = 9007199254740991 = 0x1FFFFFFFFFFFFF
      const maxSafeInt = Number.MAX_SAFE_INTEGER;
      const maxSafeHex = maxSafeInt.toString(16).padStart(32, '0');
      const termsHex = `0x${'0'.repeat(32)}${maxSafeHex}` as Hex;

      const result = extractExpiryFromCaveatTerms(termsHex);

      expect(result).toBe(maxSafeInt);
    });

    it('throws error for timestamp just above MAX_SAFE_INTEGER', () => {
      const aboveMax = Number.MAX_SAFE_INTEGER + 1;
      const aboveMaxHex = aboveMax.toString(16).padStart(32, '0');
      const termsHex = `0x${'0'.repeat(32)}${aboveMaxHex}` as Hex;

      expect(() => extractExpiryFromCaveatTerms(termsHex)).toThrow(
        'Invalid expiry: timestamp exceeds Number.MAX_SAFE_INTEGER',
      );
    });
  });

  describe('extractExpiryFromPermissionContext', () => {
    it('returns null for invalid permission context', () => {
      const invalidContext = '0x00' as Hex;
      const chainId = '0x1' as Hex;

      const result = extractExpiryFromPermissionContext(
        invalidContext,
        chainId,
      );

      expect(result).toBeNull();
    });

    it('returns null for unsupported chain', () => {
      const mockContext = '0x00000000' as Hex;
      const unsupportedChainId = '0x999999' as Hex;

      const result = extractExpiryFromPermissionContext(
        mockContext,
        unsupportedChainId,
      );

      expect(result).toBeNull();
    });

    it('returns null for malformed permission context', () => {
      const malformedContext = '0xdeadbeef' as Hex;
      const chainId = '0x1' as Hex;

      const result = extractExpiryFromPermissionContext(
        malformedContext,
        chainId,
      );

      expect(result).toBeNull();
    });

    it('returns null for empty hex string', () => {
      const emptyContext = '0x' as Hex;
      const chainId = '0x1' as Hex;

      const result = extractExpiryFromPermissionContext(emptyContext, chainId);

      expect(result).toBeNull();
    });

    it('handles errors gracefully and returns null', () => {
      // This should not throw, but return null
      const invalidChainId = 'invalid' as Hex;
      const context = '0x00' as Hex;

      const result = extractExpiryFromPermissionContext(
        context,
        invalidChainId,
      );

      expect(result).toBeNull();
    });
  });
});
