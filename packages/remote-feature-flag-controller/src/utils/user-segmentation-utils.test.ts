import { v4 as uuidV4 } from 'uuid';

import {
  calculateThresholdForFlag,
  generateDeterministicRandomNumber,
  isFeatureFlagWithScopeValue,
} from './user-segmentation-utils';

const MOCK_METRICS_IDS = {
  MOBILE_VALID: '123e4567-e89b-4456-a456-426614174000',
  EXTENSION_VALID:
    '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d136420',
  MOBILE_MIN: '00000000-0000-4000-8000-000000000000',
  MOBILE_MAX: 'ffffffff-ffff-4fff-bfff-ffffffffffff',
  EXTENSION_MIN: `0x${'0'.repeat(64)}`,
  EXTENSION_MAX: `0x${'f'.repeat(64)}`,
  UUID_V3: '00000000-0000-3000-8000-000000000000',
  INVALID_HEX_NO_PREFIX:
    '86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d136420',
  INVALID_HEX_SHORT:
    '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d13642',
  INVALID_HEX_LONG:
    '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d1364200',
  INVALID_HEX_INVALID_CHARS:
    '0x86bacb9b2bf9a7e8d2b147eadb95ac9aaa26842327cd24afc8bd4b3c1d13642g',
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
  describe('calculateThresholdForFlag', () => {
    it('generates deterministic threshold from same input', async () => {
      // Arrange
      const metaMetricsId = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
      const flagName = 'testFlag';

      // Act
      const threshold1 = await calculateThresholdForFlag(
        metaMetricsId,
        flagName,
      );
      const threshold2 = await calculateThresholdForFlag(
        metaMetricsId,
        flagName,
      );

      // Assert
      expect(threshold1).toBe(threshold2);
      expect(threshold1).toBeGreaterThanOrEqual(0);
      expect(threshold1).toBeLessThanOrEqual(1);
    });

    it('generates different thresholds for different inputs', async () => {
      // Arrange
      const metaMetricsId1 = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
      const metaMetricsId2 = '123e4567-e89b-12d3-a456-426614174000';
      const flagName = 'testFlag';

      // Act
      const threshold1 = await calculateThresholdForFlag(
        metaMetricsId1,
        flagName,
      );
      const threshold2 = await calculateThresholdForFlag(
        metaMetricsId2,
        flagName,
      );

      // Assert
      expect(threshold1).not.toBe(threshold2);
    });

    it('generates different thresholds for different flag names', async () => {
      // Arrange
      const metaMetricsId = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
      const flagName1 = 'featureA';
      const flagName2 = 'featureB';

      // Act
      const threshold1 = await calculateThresholdForFlag(
        metaMetricsId,
        flagName1,
      );
      const threshold2 = await calculateThresholdForFlag(
        metaMetricsId,
        flagName2,
      );

      // Assert
      expect(threshold1).not.toBe(threshold2);
      expect(threshold1).toBeGreaterThanOrEqual(0);
      expect(threshold1).toBeLessThanOrEqual(1);
      expect(threshold2).toBeGreaterThanOrEqual(0);
      expect(threshold2).toBeLessThanOrEqual(1);
    });

    it('returns a valid threshold value between 0 and 1', async () => {
      // Arrange
      const metaMetricsId = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
      const flagName = 'anyFlagName123';

      // Act
      const threshold = await calculateThresholdForFlag(
        metaMetricsId,
        flagName,
      );

      // Assert
      expect(threshold).toBeGreaterThanOrEqual(0);
      expect(threshold).toBeLessThanOrEqual(1);
    });

    it('throws error when metaMetricsId is empty', async () => {
      // Arrange
      const emptyMetaMetricsId = '';
      const flagName = 'testFlag';

      // Act & Assert
      await expect(
        calculateThresholdForFlag(emptyMetaMetricsId, flagName),
      ).rejects.toThrow('MetaMetrics ID cannot be empty');
    });

    it('throws error when featureFlagName is empty', async () => {
      // Arrange
      const metaMetricsId = 'f9e8d7c6-b5a4-4210-9876-543210fedcba';
      const emptyFlagName = '';

      // Act & Assert
      await expect(
        calculateThresholdForFlag(metaMetricsId, emptyFlagName),
      ).rejects.toThrow('Feature flag name cannot be empty');
    });
  });

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
      it('produces roughly uniform distribution', () => {
        const samples = 1000;
        const ranges = Array.from({ length: 10 }, (_, index) => ({
          min: index * 0.1,
          max: (index + 1) * 0.1,
        }));
        const distribution = new Array(ranges.length).fill(0);
        let minValue = 1;
        let maxValue = 0;

        // Generate samples
        Array.from({ length: samples }).forEach(() => {
          const uuid = uuidV4();
          const value = generateDeterministicRandomNumber(uuid);

          // Track min/max values while generating samples
          minValue = Math.min(minValue, value);
          maxValue = Math.max(maxValue, value);

          // Track distribution
          const distributionIndex = Math.floor(value * 10);
          // Use array bounds instead of conditional
          distribution[Math.min(distributionIndex, 9)] += 1;
        });

        // Each range should have roughly 10% of the values and 40% deviation
        const expectedPerRange = samples / ranges.length;
        const allowedDeviation = expectedPerRange * 0.4;

        // Check distribution
        distribution.forEach((count) => {
          const min = Math.floor(expectedPerRange - allowedDeviation);
          const max = Math.ceil(expectedPerRange + allowedDeviation);
          expect(count).toBeGreaterThanOrEqual(min);
          expect(count).toBeLessThanOrEqual(max);
        });

        // Check range coverage
        expect(minValue).toBeLessThan(0.1);
        expect(maxValue).toBeGreaterThan(0.9);
      });
    });

    describe('MetaMetrics ID validation', () => {
      it('throws an error if the MetaMetrics ID is empty', () => {
        expect(() => generateDeterministicRandomNumber('')).toThrow(
          'MetaMetrics ID cannot be empty',
        );
      });

      it('throws an error if the MetaMetrics ID is not a valid UUIDv4', () => {
        expect(() =>
          generateDeterministicRandomNumber(MOCK_METRICS_IDS.UUID_V3),
        ).toThrow('Invalid UUID version. Expected v4, got v3');
      });

      it('throws an error if the MetaMetrics ID is not a valid hex string', () => {
        expect(() =>
          generateDeterministicRandomNumber(
            MOCK_METRICS_IDS.INVALID_HEX_NO_PREFIX,
          ),
        ).toThrow('Hex ID must start with 0x prefix');
      });

      it('throws an error if the MetaMetrics ID is a short hex string', () => {
        expect(() =>
          generateDeterministicRandomNumber(MOCK_METRICS_IDS.INVALID_HEX_SHORT),
        ).toThrow('Invalid hex ID length. Expected 64 characters, got 63');
      });

      it('throws an error if the MetaMetrics ID is a long hex string', () => {
        expect(() =>
          generateDeterministicRandomNumber(MOCK_METRICS_IDS.INVALID_HEX_LONG),
        ).toThrow('Invalid hex ID length. Expected 64 characters, got 65');
      });

      it('throws an error if the MetaMetrics ID contains invalid hex characters', () => {
        expect(() =>
          generateDeterministicRandomNumber(
            MOCK_METRICS_IDS.INVALID_HEX_INVALID_CHARS,
          ),
        ).toThrow('Hex ID contains invalid characters');
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
