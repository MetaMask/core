import type { CaipChainId, Hex } from '@metamask/utils';

import { DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS } from '../constants';
import {
  processSmartTransactionsFeatureFlags,
  getSmartTransactionsFeatureFlags,
  getSmartTransactionsFeatureFlagsForChain,
  normalizeChainId,
} from './feature-flags';

describe('feature-flags', () => {
  describe('processSmartTransactionsFeatureFlags', () => {
    it('should return default flags for null input', () => {
      const result = processSmartTransactionsFeatureFlags(null);
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should return default flags for undefined input', () => {
      const result = processSmartTransactionsFeatureFlags(undefined);
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should return default flags for invalid input', () => {
      const result = processSmartTransactionsFeatureFlags('invalid');
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should keep valid chains and remove invalid chain ID', () => {
      const result = processSmartTransactionsFeatureFlags({
        default: { extensionActive: true },
        '0x1': { extensionActive: true },
        invalidChainId: { extensionActive: false },
      });
      // Valid chains are preserved, invalid chain is removed
      expect(result).toStrictEqual({
        default: { extensionActive: true },
        '0x1': { extensionActive: true },
      });
    });

    it('should return valid flags when input is valid', () => {
      const validFlags = {
        default: {
          extensionActive: true,
          mobileActive: false,
        },
        '0x1': {
          extensionActive: true,
          expectedDeadline: 30,
        },
      };
      const result = processSmartTransactionsFeatureFlags(validFlags);
      expect(result).toStrictEqual(validFlags);
    });

    it('should return default flags for empty input', () => {
      const result = processSmartTransactionsFeatureFlags({});
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should silently return defaults without logging for invalid input', () => {
      // Error reporting is handled by SmartTransactionsController, not here
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      processSmartTransactionsFeatureFlags(null);

      expect(consoleErrorSpy).not.toHaveBeenCalled();
      consoleErrorSpy.mockRestore();
    });

    it('should preserve unknown properties in the output (forward compatibility)', () => {
      const flagsWithUnknownProps = {
        default: {
          extensionActive: true,
          futureFlag: 'new-value', // Unknown property
          anotherNewFlag: 42, // Unknown property
        },
        '0x1': {
          extensionActive: true,
          experimentalFeature: true, // Unknown property
        },
      };

      const result = processSmartTransactionsFeatureFlags(
        flagsWithUnknownProps,
      );

      // Unknown properties should be preserved
      expect((result.default as Record<string, unknown>).futureFlag).toBe(
        'new-value',
      );
      expect((result.default as Record<string, unknown>).anotherNewFlag).toBe(
        42,
      );
      expect(
        (result['0x1'] as Record<string, unknown>).experimentalFeature,
      ).toBe(true);
    });
  });

  describe('getSmartTransactionsFeatureFlags', () => {
    it('should return processed flags from messenger', () => {
      const mockFlags = {
        default: {
          extensionActive: true,
          mobileActive: true,
        },
        '0x1': {
          extensionActive: true,
        },
      };

      const mockMessenger = {
        call: jest.fn().mockReturnValue({
          remoteFeatureFlags: {
            smartTransactionsNetworks: mockFlags,
          },
        }),
      };

      const result = getSmartTransactionsFeatureFlags(mockMessenger);

      expect(mockMessenger.call).toHaveBeenCalledWith(
        'RemoteFeatureFlagController:getState',
      );
      expect(result).toStrictEqual(mockFlags);
    });

    it('should return default flags when remoteFeatureFlags is undefined', () => {
      const mockMessenger = {
        call: jest.fn().mockReturnValue({}),
      };

      const result = getSmartTransactionsFeatureFlags(mockMessenger);

      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should return default flags when smartTransactionsNetworks is undefined', () => {
      const mockMessenger = {
        call: jest.fn().mockReturnValue({
          remoteFeatureFlags: {},
        }),
      };

      const result = getSmartTransactionsFeatureFlags(mockMessenger);

      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });

    it('should return default flags when state is null', () => {
      const mockMessenger = {
        call: jest.fn().mockReturnValue(null),
      };

      const result = getSmartTransactionsFeatureFlags(mockMessenger);

      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS,
      );
    });
  });

  describe('getSmartTransactionsFeatureFlagsForChain', () => {
    const baseFlags = {
      default: {
        extensionActive: true,
        mobileActive: false,
        expectedDeadline: 45,
        maxDeadline: 150,
        extensionReturnTxHashAsap: false,
      },
      '0x1': {
        extensionActive: true,
        expectedDeadline: 30,
        extensionReturnTxHashAsap: true,
      },
      '0x38': {
        extensionActive: false,
        mobileActive: true,
      },
    };

    it('should return hardcoded disabled defaults for unknown chain', () => {
      const result = getSmartTransactionsFeatureFlagsForChain(
        baseFlags,
        '0x999' as Hex,
      );
      // Unknown chains get hardcoded disabled defaults, not remote default
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS.default,
      );
    });

    it('should merge chain-specific config with default', () => {
      const result = getSmartTransactionsFeatureFlagsForChain(
        baseFlags,
        '0x1' as Hex,
      );
      expect(result).toStrictEqual({
        extensionActive: true,
        mobileActive: false,
        expectedDeadline: 30, // overridden by chain-specific
        maxDeadline: 150, // from default
        extensionReturnTxHashAsap: true, // overridden by chain-specific
      });
    });

    it('should allow chain-specific config to override default values', () => {
      const result = getSmartTransactionsFeatureFlagsForChain(
        baseFlags,
        '0x38' as Hex,
      );
      expect(result).toStrictEqual({
        extensionActive: false, // overridden to false
        mobileActive: true, // overridden to true
        expectedDeadline: 45, // from default
        maxDeadline: 150, // from default
        extensionReturnTxHashAsap: false, // from default
      });
    });

    it('should handle empty default config', () => {
      const flagsWithoutDefault = {
        '0x1': {
          extensionActive: true,
        },
      };
      const result = getSmartTransactionsFeatureFlagsForChain(
        flagsWithoutDefault,
        '0x1' as Hex,
      );
      expect(result).toStrictEqual({
        extensionActive: true,
      });
    });

    it('should return hardcoded disabled defaults when no default and chain not found', () => {
      const flagsWithoutDefault = {
        '0x1': {
          extensionActive: true,
        },
      };
      const result = getSmartTransactionsFeatureFlagsForChain(
        flagsWithoutDefault,
        '0x999' as Hex,
      );
      // Unknown chains get hardcoded disabled defaults
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS.default,
      );
    });

    it('should return hardcoded disabled defaults for undefined chain config', () => {
      const flagsWithUndefinedChain = {
        default: {
          extensionActive: true,
        },
        '0x1': undefined,
      };
      const result = getSmartTransactionsFeatureFlagsForChain(
        flagsWithUndefinedChain,
        '0x1' as Hex,
      );
      // Undefined chain config means unknown chain, returns hardcoded defaults
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS.default,
      );
    });

    it('should normalize eip155:X to 0xY and find matching config', () => {
      const flags = {
        default: { extensionActive: false },
        '0x1': { extensionActive: true, mobileActive: true },
      };
      // Query with CAIP-2 format, should find config keyed by hex
      const result = getSmartTransactionsFeatureFlagsForChain(
        flags,
        'eip155:1' as CaipChainId,
      );
      expect(result).toStrictEqual({
        extensionActive: true,
        mobileActive: true,
      });
    });

    it('should normalize eip155:137 to 0x89', () => {
      const flags = {
        default: { extensionActive: false },
        '0x89': { extensionActive: true, mobileActive: true },
      };
      const result = getSmartTransactionsFeatureFlagsForChain(
        flags,
        'eip155:137' as CaipChainId,
      );
      expect(result).toStrictEqual({
        extensionActive: true,
        mobileActive: true,
      });
    });

    it('should not normalize non-EVM CAIP-2 chain IDs (exact match)', () => {
      const flags = {
        default: { extensionActive: false },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
          extensionActive: true,
          mobileActive: true,
        },
      };
      const result = getSmartTransactionsFeatureFlagsForChain(
        flags,
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp' as CaipChainId,
      );
      expect(result).toStrictEqual({
        extensionActive: true,
        mobileActive: true,
      });
    });

    it('should return hardcoded disabled defaults for non-matching non-EVM chain', () => {
      const flags = {
        default: { extensionActive: false },
        '0x1': { extensionActive: true },
      };
      const result = getSmartTransactionsFeatureFlagsForChain(
        flags,
        'solana:unknown' as CaipChainId,
      );
      // Unknown chains get hardcoded disabled defaults, not remote default
      expect(result).toStrictEqual(
        DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS.default,
      );
    });
  });

  describe('normalizeChainId', () => {
    it('should return hex chain IDs unchanged', () => {
      expect(normalizeChainId('0x1')).toBe('0x1');
      expect(normalizeChainId('0x89')).toBe('0x89');
      expect(normalizeChainId('0x38')).toBe('0x38');
    });

    it('should convert eip155:1 to 0x1', () => {
      expect(normalizeChainId('eip155:1')).toBe('0x1');
    });

    it('should convert eip155:137 to 0x89', () => {
      expect(normalizeChainId('eip155:137')).toBe('0x89');
    });

    it('should convert eip155:56 to 0x38', () => {
      expect(normalizeChainId('eip155:56')).toBe('0x38');
    });

    it('should convert eip155:42161 to 0xa4b1 (Arbitrum)', () => {
      expect(normalizeChainId('eip155:42161')).toBe('0xa4b1');
    });

    it('should not normalize non-EVM CAIP-2 chain IDs', () => {
      expect(normalizeChainId('solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')).toBe(
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
      );
      expect(normalizeChainId('bip122:000000000019d6689c085ae165831e93')).toBe(
        'bip122:000000000019d6689c085ae165831e93',
      );
    });

    it('should not normalize invalid eip155 formats', () => {
      // Missing number
      expect(normalizeChainId('eip155:' as CaipChainId)).toBe('eip155:');
      // Non-numeric
      expect(normalizeChainId('eip155:abc' as CaipChainId)).toBe('eip155:abc');
    });
  });
});
