import { DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS } from './constants';
import {
  selectSmartTransactionsFeatureFlags,
  selectSmartTransactionsFeatureFlagsForChain,
} from './selectors';
import type { SmartTransactionsFeatureFlagsState } from './selectors';

describe('selectors', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const createMockState = (
    smartTransactionsNetworks?: unknown,
  ): SmartTransactionsFeatureFlagsState => ({
    remoteFeatureFlags:
      smartTransactionsNetworks === undefined
        ? undefined
        : { smartTransactionsNetworks },
  });

  describe('selectSmartTransactionsFeatureFlags', () => {
    it('should return default flags when state is empty', () => {
      const state = createMockState();
      const result = selectSmartTransactionsFeatureFlags(state);
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should return default flags when smartTransactionsNetworks is invalid', () => {
      const state = createMockState('invalid');
      const result = selectSmartTransactionsFeatureFlags(state);
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should return valid flags from state', () => {
      const validFlags = {
        default: {
          extensionActive: true,
          mobileActive: true,
        },
        '0x1': {
          extensionActive: true,
        },
      };
      const state = createMockState(validFlags);
      const result = selectSmartTransactionsFeatureFlags(state);
      expect(result).toStrictEqual(validFlags);
    });
  });

  describe('selectSmartTransactionsFeatureFlagsForChain', () => {
    const validFlags = {
      default: {
        extensionActive: true,
        mobileActive: false,
        expectedDeadline: 45,
        maxDeadline: 150,
      },
      '0x1': {
        extensionActive: true,
        expectedDeadline: 30,
      },
      '0x38': {
        extensionActive: false,
        mobileActive: true,
      },
    };

    it('should return merged config for known chain', () => {
      const state = createMockState(validFlags);
      const result = selectSmartTransactionsFeatureFlagsForChain(state, '0x1');
      expect(result).toStrictEqual({
        extensionActive: true,
        mobileActive: false,
        expectedDeadline: 30,
        maxDeadline: 150,
      });
    });

    it('should return hardcoded disabled defaults for unknown chain', () => {
      const state = createMockState(validFlags);
      const result = selectSmartTransactionsFeatureFlagsForChain(
        state,
        '0x999',
      );
      // Unknown chains get hardcoded disabled defaults, not remote default
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS.default,
      );
    });

    it('should allow chain-specific values to override defaults', () => {
      const state = createMockState(validFlags);
      const result = selectSmartTransactionsFeatureFlagsForChain(state, '0x38');
      expect(result.extensionActive).toBe(false);
      expect(result.mobileActive).toBe(true);
    });
  });
});
