import {
  generateDeterministicRandomNumber,
  isFeatureFlagWithScopeValue,
} from './user-segmentation-utils';

const MOCK_METRICS_IDS = [
  '0x1234567890abcdef',
  '0xdeadbeefdeadbeef',
  '0xabcdef0123456789',
  '0xfedcba9876543210',
];

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
  INVALID_VALUES: ['string', 123, true, undefined, []],
};

describe('user-segmentation-utils', () => {
  describe('generateDeterministicRandomNumber', () => {
    it('generates consistent numbers for the same input', () => {
      const result1 = generateDeterministicRandomNumber(MOCK_METRICS_IDS[0]);
      const result2 = generateDeterministicRandomNumber(MOCK_METRICS_IDS[0]);

      expect(result1).toBe(result2);
    });

    it('generates numbers between 0 and 1', () => {
      MOCK_METRICS_IDS.forEach((id) => {
        const result = generateDeterministicRandomNumber(id);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(1);
      });
    });

    it('generates different numbers for different inputs', () => {
      const result1 = generateDeterministicRandomNumber(MOCK_METRICS_IDS[0]);
      const result2 = generateDeterministicRandomNumber(MOCK_METRICS_IDS[1]);

      expect(result1).not.toBe(result2);
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
