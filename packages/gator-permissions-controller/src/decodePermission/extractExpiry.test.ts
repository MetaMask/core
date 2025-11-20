import {
  createNativeTokenStreamingTerms,
  createTimestampTerms,
  encodeDelegations,
  ROOT_AUTHORITY,
} from '@metamask/delegation-core';
import {
  CHAIN_ID,
  DELEGATOR_CONTRACTS,
} from '@metamask/delegation-deployments';
import { numberToHex, type Hex } from '@metamask/utils';

import {
  extractExpiryFromCaveatTerms,
  extractExpiryFromPermissionContext,
} from './decodePermission';
import { DELEGATION_FRAMEWORK_VERSION } from '../constants';

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

  describe('extractExpiryFromPermissionContext', () => {
    const chainId = CHAIN_ID.sepolia;
    const chainIdHex = numberToHex(chainId);
    const contracts =
      DELEGATOR_CONTRACTS[DELEGATION_FRAMEWORK_VERSION][chainId];

    const delegator = '0x1111111111111111111111111111111111111111' as Hex;
    const delegate = '0x2222222222222222222222222222222222222222' as Hex;

    it('extracts expiry from valid permission context with timestamp caveat', () => {
      const expiryTimestamp = 1767225600; // January 1, 2026

      const delegations = [
        {
          delegate,
          delegator,
          authority: ROOT_AUTHORITY as Hex,
          caveats: [
            {
              enforcer: contracts.TimestampEnforcer,
              terms: createTimestampTerms({
                timestampAfterThreshold: 0,
                timestampBeforeThreshold: expiryTimestamp,
              }),
              args: '0x' as Hex,
            },
            {
              enforcer: contracts.NativeTokenStreamingEnforcer,
              terms: createNativeTokenStreamingTerms(
                {
                  initialAmount: 100n,
                  maxAmount: 1000n,
                  amountPerSecond: 1n,
                  startTime: 1640995200,
                },
                { out: 'hex' },
              ),
              args: '0x' as Hex,
            },
          ],
          salt: 0n,
          signature: '0x' as Hex,
        },
      ];

      const permissionContext = encodeDelegations(delegations);
      const result = extractExpiryFromPermissionContext(
        permissionContext,
        chainIdHex,
      );

      expect(result).toBe(expiryTimestamp);
    });

    it('returns null when permission context has no timestamp caveat', () => {
      const delegations = [
        {
          delegate,
          delegator,
          authority: ROOT_AUTHORITY as Hex,
          caveats: [
            {
              enforcer: contracts.NativeTokenStreamingEnforcer,
              terms: createNativeTokenStreamingTerms(
                {
                  initialAmount: 100n,
                  maxAmount: 1000n,
                  amountPerSecond: 1n,
                  startTime: 1640995200,
                },
                { out: 'hex' },
              ),
              args: '0x' as Hex,
            },
          ],
          salt: 0n,
          signature: '0x' as Hex,
        },
      ];

      const permissionContext = encodeDelegations(delegations);
      const result = extractExpiryFromPermissionContext(
        permissionContext,
        chainIdHex,
      );

      expect(result).toBeNull();
    });

    it('returns null when expiry timestamp is 0', () => {
      const delegations = [
        {
          delegate,
          delegator,
          authority: ROOT_AUTHORITY as Hex,
          caveats: [
            {
              enforcer: contracts.TimestampEnforcer,
              terms: createTimestampTerms({
                timestampAfterThreshold: 0,
                timestampBeforeThreshold: 0,
              }),
              args: '0x' as Hex,
            },
          ],
          salt: 0n,
          signature: '0x' as Hex,
        },
      ];

      const permissionContext = encodeDelegations(delegations);
      const result = extractExpiryFromPermissionContext(
        permissionContext,
        chainIdHex,
      );

      expect(result).toBeNull();
    });

    it('returns null when context contains multiple delegations', () => {
      const delegations = [
        {
          delegate,
          delegator,
          authority: ROOT_AUTHORITY as Hex,
          caveats: [],
          salt: 0n,
          signature: '0x' as Hex,
        },
        {
          delegate,
          delegator,
          authority: ROOT_AUTHORITY as Hex,
          caveats: [],
          salt: 1n,
          signature: '0x' as Hex,
        },
      ];

      const permissionContext = encodeDelegations(delegations);
      const result = extractExpiryFromPermissionContext(
        permissionContext,
        chainIdHex,
      );

      expect(result).toBeNull();
    });

    it('returns null for invalid permission context', () => {
      const invalidContext = '0x00' as Hex;

      const result = extractExpiryFromPermissionContext(
        invalidContext,
        chainIdHex,
      );

      expect(result).toBeNull();
    });

    it('returns null for unsupported chain', () => {
      const delegations = [
        {
          delegate,
          delegator,
          authority: ROOT_AUTHORITY as Hex,
          caveats: [],
          salt: 0n,
          signature: '0x' as Hex,
        },
      ];

      const permissionContext = encodeDelegations(delegations);
      const unsupportedChainId = '0x999999' as Hex;

      const result = extractExpiryFromPermissionContext(
        permissionContext,
        unsupportedChainId,
      );

      expect(result).toBeNull();
    });

    it('returns null for malformed permission context', () => {
      const malformedContext = '0xdeadbeef' as Hex;

      const result = extractExpiryFromPermissionContext(
        malformedContext,
        chainIdHex,
      );

      expect(result).toBeNull();
    });

    it('returns null for empty hex string', () => {
      const emptyContext = '0x' as Hex;

      const result = extractExpiryFromPermissionContext(
        emptyContext,
        chainIdHex,
      );

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
