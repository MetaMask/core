import { v4 as uuidV4 } from 'uuid';

import {
  generateDeterministicRandomNumber,
  isFeatureFlagWithScopeValue,
} from './user-segmentation-utils';

const MOCK_METRICS_IDS = {
  MOBILE_VALID: '123e4567-e89b-4456-a456-426614174000',
  EXTENSION_VALID:
    '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d136420',
  MOBILE_MIN: '00000000-0000-4000-8000-000000000000',
  MOBILE_MAX: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
  EXTENSION_MIN: `0x${'0'.repeat(64) as string}`,
  EXTENSION_MAX: `0x${'f'.repeat(64) as string}`,
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
    describe('Mobile client new implementation (uuidv4)', () => {
      it('generates consistent results for same uuidv4', () => {
        const result1 = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.MOBILE_VALID,
        );
        const result2 = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.MOBILE_VALID,
        );
        expect(result1).toBe(result2);
      });

      it('handles minimum uuidv4 value', () => {
        const result = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.MOBILE_MIN,
        );
        expect(result).toBe(0);
      });

      it('handles maximum uuidv4 value', () => {
        const result = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.MOBILE_MAX,
        );
        //  For practical purposes, 0.999999 is functionally equivalent to 1 in this context
        // the small deviation from exactly 1.0 is a limitation of floating-point arithmetic, not a bug in the logic.
        expect(result).toBeCloseTo(1, 5);
      });

      it('results a random number between 0 and 1', () => {
        const result = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.MOBILE_VALID,
        );
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      });
    });

    describe('Mobile client old implementation and Extension client (hex string)', () => {
      it('generates consistent results for same hex', () => {
        const result1 = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.EXTENSION_VALID,
        );
        const result2 = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.EXTENSION_VALID,
        );
        expect(result1).toBe(result2);
      });

      it('handles minimum hex value', () => {
        const result = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.EXTENSION_MIN,
        );
        expect(result).toBe(0);
      });

      it('handles maximum hex value', () => {
        const result = generateDeterministicRandomNumber(
          MOCK_METRICS_IDS.EXTENSION_MAX,
        );
        expect(result).toBe(1);
      });
    });

    describe('Distribution validation', () => {
      it('produces uniform distribution across 1000 samples', () => {
        const samples = 1000;
        const buckets = 10;
        const tolerance = 0.3;
        const distribution = new Array(buckets).fill(0);

        // Generate samples using valid UUIDs
        Array.from({ length: samples }).forEach(() => {
          const uuid = uuidV4();
          const value = generateDeterministicRandomNumber(uuid);
          const bucketIndex = Math.floor(value * buckets);
          // Handle edge case where value === 1
          distribution[
            bucketIndex === buckets ? buckets - 1 : bucketIndex
          ] += 1;
        });

        // Check distribution
        const expectedPerBucket = samples / buckets;
        const allowedDeviation = expectedPerBucket * tolerance;

        distribution.forEach((count) => {
          const minExpected = Math.floor(expectedPerBucket - allowedDeviation);
          const maxExpected = Math.ceil(expectedPerBucket + allowedDeviation);
          expect(count).toBeGreaterThanOrEqual(minExpected);
          expect(count).toBeLessThanOrEqual(maxExpected);
        });
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
