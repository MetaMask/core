import { v4 as uuidv4 } from 'uuid';

import { ClientType } from '../remote-feature-flag-controller-types';
import {
  generateDeterministicRandomNumber,
  isFeatureFlagWithScopeValue,
} from './user-segmentation-utils';

const MOCK_METRICS_IDS = {
  MOBILE_VALID: '123e4567-e89b-4456-a456-426614174000',
  EXTENSION_VALID:
    '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d136420',
  MOBILE_MIN: '00000000-0000-0000-0000-000000000000',
  MOBILE_MAX: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
  EXTENSION_MIN: `0x${'0'.repeat(64)}`,
  EXTENSION_MAX: `0x${'f'.repeat(64)}`,
};

const MOCK_FEATURE_FLAGS = {
  VALID: {
    name: 'test-flag',
    value: true,
    scope: {
      type: 'threshold',
      value: 0.5,
    },
  },
  INVALID_NO_SCOPE: {
    name: 'test-flag',
    value: true,
  },
  INVALID_VALUES: ['string', 123, true, null, []],
};

describe('user-segmentation-utils', () => {
  describe('generateDeterministicRandomNumber', () => {
    describe('Mobile client (uuidv4)', () => {
      it('generates consistent results for same uuidv4', () => {
        const result1 = generateDeterministicRandomNumber(
          ClientType.Mobile,
          MOCK_METRICS_IDS.MOBILE_VALID,
        );
        const result2 = generateDeterministicRandomNumber(
          ClientType.Mobile,
          MOCK_METRICS_IDS.MOBILE_VALID,
        );
        expect(result1).toBe(result2);
      });

      it('handles minimum uuidv4 value', () => {
        const result = generateDeterministicRandomNumber(
          ClientType.Mobile,
          MOCK_METRICS_IDS.MOBILE_MIN,
        );
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      });

      it('handles maximum uuidv4 value', () => {
        const result = generateDeterministicRandomNumber(
          ClientType.Mobile,
          MOCK_METRICS_IDS.MOBILE_MAX,
        );
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      });
    });

    describe('Extension client (hex string)', () => {
      it('generates consistent results for same hex', () => {
        const result1 = generateDeterministicRandomNumber(
          ClientType.Extension,
          MOCK_METRICS_IDS.EXTENSION_VALID,
        );
        const result2 = generateDeterministicRandomNumber(
          ClientType.Extension,
          MOCK_METRICS_IDS.EXTENSION_VALID,
        );
        expect(result1).toBe(result2);
      });

      it('handles minimum hex value', () => {
        const result = generateDeterministicRandomNumber(
          ClientType.Extension,
          MOCK_METRICS_IDS.EXTENSION_MIN,
        );
        expect(result).toBe(0);
      });

      it('handles maximum hex value', () => {
        const result = generateDeterministicRandomNumber(
          ClientType.Extension,
          MOCK_METRICS_IDS.EXTENSION_MAX,
        );
        expect(result).toBe(1);
      });
    });

    describe('Distribution validation', () => {
      it('produces uniform distribution', () => {
        const samples = 1000;
        const buckets = 10;
        const distribution = new Array(buckets).fill(0);

        // Generate samples using valid UUIDs
        Array.from({ length: samples }).forEach(() => {
          const randomUUID = uuidv4();
          const value = generateDeterministicRandomNumber(
            ClientType.Mobile,
            randomUUID,
          );
          const bucketIndex = Math.floor(value * buckets);
          distribution[bucketIndex] += 1;
        });

        // Check distribution
        const expectedPerBucket = samples / buckets;
        const tolerance = expectedPerBucket * 0.3; // 30% tolerance

        distribution.forEach((count) => {
          expect(count).toBeGreaterThanOrEqual(expectedPerBucket - tolerance);
          expect(count).toBeLessThanOrEqual(expectedPerBucket + tolerance);
        });
      });
    });

    describe('Client type handling', () => {
      it('defaults to Extension handling for undefined client type', () => {
        const undefinedClient = 'undefined' as unknown as ClientType;
        const result = generateDeterministicRandomNumber(
          undefinedClient,
          MOCK_METRICS_IDS.EXTENSION_VALID,
        );

        // Should match Extension result
        const extensionResult = generateDeterministicRandomNumber(
          ClientType.Extension,
          MOCK_METRICS_IDS.EXTENSION_VALID,
        );

        expect(result).toBe(extensionResult);
      });
    });
  });

  describe('isFeatureFlagWithScopeValue', () => {
    it('returns true for valid feature flag with scope', () => {
      expect(isFeatureFlagWithScopeValue(MOCK_FEATURE_FLAGS.VALID)).toBe(true);
    });

    it('returns false for null', () => {
      expect(isFeatureFlagWithScopeValue(null)).toBe(false);
    });

    it('returns false for non-objects', () => {
      MOCK_FEATURE_FLAGS.INVALID_VALUES.forEach((value) => {
        expect(isFeatureFlagWithScopeValue(value)).toBe(false);
      });
    });

    it('returns false for objects without scope', () => {
      expect(
        isFeatureFlagWithScopeValue(MOCK_FEATURE_FLAGS.INVALID_NO_SCOPE),
      ).toBe(false);
    });
  });
});
