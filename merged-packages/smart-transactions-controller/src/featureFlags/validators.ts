import {
  boolean,
  number,
  optional,
  string,
  type,
  is,
  validate,
} from '@metamask/superstruct';
import type { Infer } from '@metamask/superstruct';
import { isCaipChainId, isStrictHexString } from '@metamask/utils';

/**
 * Validates that a key is a valid chain ID (hex or CAIP-2 format).
 * Supports both EVM hex chain IDs and chain-agnostic CAIP-2 identifiers.
 *
 * @param key - The key to validate
 * @returns True if the key is a valid chain ID format
 */
function isValidChainIdKey(key: string): boolean {
  return isStrictHexString(key) || isCaipChainId(key);
}

/**
 * Schema for validating per-network smart transactions configuration.
 * All fields are optional to allow partial configuration and merging with defaults.
 */
export const SmartTransactionsNetworkConfigSchema = type({
  /** Whether smart transactions are active for the extension client */
  extensionActive: optional(boolean()),
  /** Whether smart transactions are active for mobile clients (generic) */
  mobileActive: optional(boolean()),
  /** Whether smart transactions are active for iOS specifically */
  mobileActiveIOS: optional(boolean()),
  /** Whether smart transactions are active for Android specifically */
  mobileActiveAndroid: optional(boolean()),
  /** Expected time in seconds for a smart transaction to be mined */
  expectedDeadline: optional(number()),
  /** Maximum time in seconds before a smart transaction is considered failed */
  maxDeadline: optional(number()),
  /** Whether extension should return tx hash immediately without waiting for confirmation */
  extensionReturnTxHashAsap: optional(boolean()),
  /** Whether extension should return tx hash immediately for batch transactions */
  extensionReturnTxHashAsapBatch: optional(boolean()),
  /** Whether mobile should return tx hash immediately without waiting for confirmation */
  mobileReturnTxHashAsap: optional(boolean()),
  /** Whether extension should skip the smart transaction status page */
  extensionSkipSmartTransactionStatusPage: optional(boolean()),
  /** Polling interval in milliseconds for batch status updates */
  batchStatusPollingInterval: optional(number()),
  /** Custom sentinel URL for the network */
  sentinelUrl: optional(string()),
});

/**
 * Schema for validating the complete smart transactions feature flags configuration.
 * This includes a default configuration and optional chain-specific overrides.
 */
export const SmartTransactionsFeatureFlagsConfigSchema = type({
  /** Default configuration applied to all chains unless overridden */
  default: optional(SmartTransactionsNetworkConfigSchema),
});

/**
 * Type inferred from the SmartTransactionsNetworkConfigSchema
 */
export type SmartTransactionsNetworkConfigFromSchema = Infer<
  typeof SmartTransactionsNetworkConfigSchema
>;

/**
 * Type inferred from the SmartTransactionsFeatureFlagsConfigSchema
 */
export type SmartTransactionsFeatureFlagsConfigFromSchema = Infer<
  typeof SmartTransactionsFeatureFlagsConfigSchema
>;

/**
 * Result of processing feature flags with collected validation errors.
 * Uses per-chain validation: invalid chains are removed, valid ones are kept.
 */
export type FeatureFlagsProcessResult = {
  /** The validated configuration (may be partial if some chains were invalid) */
  config: SmartTransactionsFeatureFlagsConfigFromSchema &
    Record<string, SmartTransactionsNetworkConfigFromSchema | undefined>;
  /** Validation errors for invalid parts of the configuration */
  errors: Error[];
};

/**
 * Validates smart transactions feature flags with per-chain validation.
 * - If the input is not an object, returns empty config with error
 * - If `default` is present and invalid, returns empty config with error
 * - For each chain: if invalid, removes it and collects error; if valid, includes it
 *
 * @param data - The data to validate
 * @returns The validated config and any validation errors
 */
export function validateSmartTransactionsFeatureFlags(
  data: unknown,
): FeatureFlagsProcessResult {
  const errors: Error[] = [];

  // Step 1: Check if it's a valid object
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    const typeDescription = data === null ? 'null' : typeof data;
    const arraySuffix = Array.isArray(data) ? ' (array)' : '';
    return {
      config: {},
      errors: [
        new Error(
          `Expected an object, received ${typeDescription}${arraySuffix}`,
        ),
      ],
    };
  }

  const dataRecord = data as Record<string, unknown>;
  const validConfig: FeatureFlagsProcessResult['config'] = {};

  // Step 2: Validate 'default' - if present and invalid, reject everything
  if (dataRecord.default !== undefined) {
    const [defaultError, validatedDefault] = validate(
      dataRecord.default,
      SmartTransactionsNetworkConfigSchema,
    );
    if (defaultError) {
      return {
        config: {},
        errors: [
          new Error(`Invalid 'default' config: ${defaultError.message}`),
        ],
      };
    }
    // validatedDefault is properly typed from superstruct
    validConfig.default = validatedDefault;
  }

  // Step 3: Validate chain-specific configs, keeping valid ones
  for (const [key, value] of Object.entries(dataRecord)) {
    if (key === 'default') {
      continue;
    }

    // Check chain ID format
    if (!isValidChainIdKey(key)) {
      errors.push(
        new Error(
          `Invalid chain ID key "${key}". Expected hex string (e.g., "0x1") or CAIP-2 format (e.g., "eip155:1", "solana:...")`,
        ),
      );
      continue; // Skip this chain, don't add to result
    }

    // Validate chain config
    if (value !== undefined) {
      const [chainError, validatedChain] = validate(
        value,
        SmartTransactionsNetworkConfigSchema,
      );
      if (chainError) {
        errors.push(new Error(`Chain "${key}": ${chainError.message}`));
        continue; // Skip this chain, don't add to result
      }
      // validatedChain is properly typed from superstruct
      validConfig[key] = validatedChain;
    }
  }

  return { config: validConfig, errors };
}

/**
 * Validates that the given data conforms to the SmartTransactionsNetworkConfig schema.
 *
 * @param data - The data to validate
 * @returns True if the data is valid, false otherwise
 */
export function validateSmartTransactionsNetworkConfig(
  data: unknown,
): data is SmartTransactionsNetworkConfigFromSchema {
  return is(data, SmartTransactionsNetworkConfigSchema);
}
