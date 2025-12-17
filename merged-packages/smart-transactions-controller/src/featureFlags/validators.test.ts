import {
  validateSmartTransactionsFeatureFlags,
  validateSmartTransactionsNetworkConfig,
} from './validators';

describe('validators', () => {
  describe('validateSmartTransactionsNetworkConfig', () => {
    it('should return true for a valid empty config', () => {
      expect(validateSmartTransactionsNetworkConfig({})).toBe(true);
    });

    it('should return true for a valid config with all fields', () => {
      const config = {
        extensionActive: true,
        mobileActive: true,
        mobileActiveIOS: true,
        mobileActiveAndroid: false,
        expectedDeadline: 45,
        maxDeadline: 150,
        extensionReturnTxHashAsap: true,
        extensionReturnTxHashAsapBatch: true,
        mobileReturnTxHashAsap: false,
        extensionSkipSmartTransactionStatusPage: false,
        batchStatusPollingInterval: 5000,
        sentinelUrl: 'https://example.com',
      };
      expect(validateSmartTransactionsNetworkConfig(config)).toBe(true);
    });

    it('should return true for a config with only some fields', () => {
      const config = {
        extensionActive: true,
        expectedDeadline: 60,
      };
      expect(validateSmartTransactionsNetworkConfig(config)).toBe(true);
    });

    it('should return false for null', () => {
      expect(validateSmartTransactionsNetworkConfig(null)).toBe(false);
    });

    it('should return false for a non-object', () => {
      expect(validateSmartTransactionsNetworkConfig('invalid')).toBe(false);
      expect(validateSmartTransactionsNetworkConfig(123)).toBe(false);
      expect(validateSmartTransactionsNetworkConfig(true)).toBe(false);
    });

    it('should return false for a config with invalid field types', () => {
      expect(
        validateSmartTransactionsNetworkConfig({
          extensionActive: 'true', // should be boolean
        }),
      ).toBe(false);

      expect(
        validateSmartTransactionsNetworkConfig({
          expectedDeadline: '45', // should be number
        }),
      ).toBe(false);
    });

    it('should return true for a config with unknown properties (forward compatibility)', () => {
      const config = {
        extensionActive: true,
        futureFlag: true, // Unknown property
        anotherNewFlag: 'value', // Unknown property
      };
      expect(validateSmartTransactionsNetworkConfig(config)).toBe(true);
    });
  });

  describe('validateSmartTransactionsFeatureFlags', () => {
    it('should return empty config and no errors for a valid empty config', () => {
      const result = validateSmartTransactionsFeatureFlags({});
      expect(result.config).toStrictEqual({});
      expect(result.errors).toHaveLength(0);
    });

    it('should return config with default and no errors', () => {
      const config = {
        default: {
          extensionActive: true,
          mobileActive: true,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should return full config with chain-specific overrides and no errors', () => {
      const config = {
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
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle config with undefined chain values', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        '0x1': undefined,
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config.default).toStrictEqual({ extensionActive: true });
      expect(result.errors).toHaveLength(0);
    });

    it('should return empty config and error for null', () => {
      const result = validateSmartTransactionsFeatureFlags(null);
      expect(result.config).toStrictEqual({});
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('null');
    });

    it('should return empty config and error for non-objects', () => {
      const stringResult = validateSmartTransactionsFeatureFlags('invalid');
      expect(stringResult.config).toStrictEqual({});
      expect(stringResult.errors).toHaveLength(1);

      const numberResult = validateSmartTransactionsFeatureFlags(123);
      expect(numberResult.config).toStrictEqual({});
      expect(numberResult.errors).toHaveLength(1);

      const arrayResult = validateSmartTransactionsFeatureFlags([]);
      expect(arrayResult.config).toStrictEqual({});
      expect(arrayResult.errors).toHaveLength(1);
      expect(arrayResult.errors[0].message).toContain('array');
    });

    it('should remove invalid chain ID and collect error, keeping valid chains', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        '0x1': {
          extensionActive: true,
        },
        invalidChainId: {
          // not a hex string or CAIP-2 format
          extensionActive: false,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      // Valid chains are preserved
      expect(result.config.default).toStrictEqual({ extensionActive: true });
      expect(result.config['0x1']).toStrictEqual({ extensionActive: true });
      // Invalid chain is removed
      expect(result.config).not.toHaveProperty('invalidChainId');
      // Error is collected
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('invalidChainId');
      expect(result.errors[0].message).toContain('hex string');
      expect(result.errors[0].message).toContain('CAIP-2');
    });

    it('should remove chain with invalid config values and collect error', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        '0x1': {
          extensionActive: 'true', // should be boolean
        },
        '0x89': {
          extensionActive: true,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      // Valid chains are preserved
      expect(result.config.default).toStrictEqual({ extensionActive: true });
      expect(result.config['0x89']).toStrictEqual({ extensionActive: true });
      // Invalid chain is removed
      expect(result.config).not.toHaveProperty('0x1');
      // Error is collected
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('0x1');
    });

    it('should return empty config and error for invalid default config', () => {
      const result = validateSmartTransactionsFeatureFlags({
        default: { extensionActive: 'not-a-boolean' },
      });
      expect(result.config).toStrictEqual({});
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('default');
    });

    it('should return full config for complex valid production-like config', () => {
      const config = {
        default: {
          batchStatusPollingInterval: 5000,
          extensionActive: true,
          mobileActive: true,
          extensionReturnTxHashAsap: true,
          extensionReturnTxHashAsapBatch: true,
          extensionSkipSmartTransactionStatusPage: false,
          expectedDeadline: 45,
          maxDeadline: 150,
        },
        '0x1': {
          extensionActive: true,
          mobileActive: true,
          mobileActiveIOS: true,
          mobileActiveAndroid: true,
        },
        '0x38': {
          extensionActive: true,
          mobileActive: false,
          expectedDeadline: 60,
          maxDeadline: 180,
        },
        '0x89': {
          extensionActive: true,
          mobileActive: true,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should preserve unknown properties in default (forward compatibility)', () => {
      const config = {
        default: {
          extensionActive: true,
          futureFlag: true, // Unknown property
          experimentalFeature: 42, // Unknown property
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should preserve unknown properties in chain config (forward compatibility)', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        '0x1': {
          extensionActive: true,
          newChainSpecificFlag: 'beta', // Unknown property
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CAIP-2 EVM chain IDs (multi-chain support)', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        'eip155:1': {
          extensionActive: true,
        },
        'eip155:137': {
          mobileActive: true,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle CAIP-2 non-EVM chain IDs (multi-chain support)', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
          mobileActive: true,
        },
        'bip122:000000000019d6689c085ae165831e93': {
          mobileActive: true,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed hex and CAIP-2 chain IDs', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        '0x1': {
          extensionActive: true,
        },
        'eip155:137': {
          mobileActive: true,
        },
        'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp': {
          mobileActive: true,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config).toStrictEqual(config);
      expect(result.errors).toHaveLength(0);
    });

    it('should remove invalid CAIP-2 format and collect error', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        invalid: {
          // Not a valid hex or CAIP-2 format
          extensionActive: false,
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      expect(result.config.default).toStrictEqual({ extensionActive: true });
      expect(result.config).not.toHaveProperty('invalid');
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('invalid');
      expect(result.errors[0].message).toContain('CAIP-2');
    });

    it('should collect multiple errors for multiple invalid chains', () => {
      const config = {
        default: {
          extensionActive: true,
        },
        '0x1': {
          extensionActive: true,
        },
        invalidChain1: {
          extensionActive: false,
        },
        invalidChain2: {
          mobileActive: true,
        },
        '0x89': {
          extensionActive: 'invalid', // Invalid value type
        },
      };
      const result = validateSmartTransactionsFeatureFlags(config);
      // Valid chains are preserved
      expect(result.config.default).toStrictEqual({ extensionActive: true });
      expect(result.config['0x1']).toStrictEqual({ extensionActive: true });
      // Invalid chains are removed
      expect(result.config).not.toHaveProperty('invalidChain1');
      expect(result.config).not.toHaveProperty('invalidChain2');
      expect(result.config).not.toHaveProperty('0x89');
      // All errors are collected
      expect(result.errors).toHaveLength(3);
    });
  });
});
