import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import type { CaipChainId, Hex } from '@metamask/utils';
import {
  isCaipChainId,
  KnownCaipNamespace,
  numberToHex,
  parseCaipChainId,
} from '@metamask/utils';

import { DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS } from '../constants';
import type {
  SmartTransactionsFeatureFlagsConfig,
  SmartTransactionsNetworkConfig,
} from '../types';
import { validateSmartTransactionsFeatureFlags } from './validators';

/**
 * Normalizes a chain ID to hex format for EVM chains.
 * - CAIP-2 EVM format (eip155:X) is converted to hex (0xY)
 * - Hex format is returned as-is
 * - Non-EVM CAIP-2 formats are returned as-is (exact match)
 * - Invalid eip155 formats (non-numeric reference) are returned as-is
 * - This is used because the current STX chains are EVM and declared as hex chain IDs in the existing flag.
 *
 * @param chainId - The chain ID in any supported format
 * @returns Normalized chain ID (hex for EVM, original for non-EVM)
 * @example
 * ```ts
 * normalizeChainId('0x1')           // → '0x1'
 * normalizeChainId('eip155:1')      // → '0x1'
 * normalizeChainId('eip155:137')    // → '0x89'
 * normalizeChainId('solana:...')    // → 'solana:...' (unchanged)
 * normalizeChainId('eip155:abc')    // → 'eip155:abc' (invalid, unchanged)
 * ```
 */
export function normalizeChainId(
  chainId: Hex | CaipChainId,
): Hex | CaipChainId {
  // If it's already hex or not a valid CAIP chain ID, return as-is
  if (!isCaipChainId(chainId)) {
    return chainId;
  }

  const { namespace, reference } = parseCaipChainId(chainId);

  // Only normalize EVM CAIP-2 chains with valid numeric references to hex
  if (namespace === KnownCaipNamespace.Eip155) {
    const decimal = parseInt(reference, 10);
    // If reference is not a valid number, return as-is
    if (Number.isNaN(decimal)) {
      return chainId;
    }
    return numberToHex(decimal);
  }

  // Non-EVM CAIP chains remain unchanged
  return chainId;
}

/**
 * Processes raw feature flags data and returns a validated configuration.
 * Invalid chain configs are silently removed. Error reporting is handled by
 * the SmartTransactionsController via ErrorReportingService.
 *
 * @param rawFeatureFlags - The raw feature flags data from the remote feature flag controller
 * @returns The validated feature flags configuration (partial if some chains were invalid)
 */
export function processSmartTransactionsFeatureFlags(
  rawFeatureFlags: unknown,
): SmartTransactionsFeatureFlagsConfig {
  const { config } = validateSmartTransactionsFeatureFlags(rawFeatureFlags);

  // Return config if it has any valid data, otherwise return defaults
  if (Object.keys(config).length > 0) {
    return config;
  }

  return DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS;
}

/**
 * Gets the smart transactions feature flags from the remote feature flag controller.
 *
 * @param messenger - Any messenger with access to RemoteFeatureFlagController:getState
 * @returns The smart transactions feature flags configuration
 * @example
 * ```ts
 * const featureFlags = getSmartTransactionsFeatureFlags(messenger);
 * const chainConfig = featureFlags['0x1'] ?? featureFlags.default;
 * ```
 */
export function getSmartTransactionsFeatureFlags<
  T extends {
    call(
      action: 'RemoteFeatureFlagController:getState',
    ): RemoteFeatureFlagControllerState;
  },
>(messenger: T): SmartTransactionsFeatureFlagsConfig {
  const remoteFeatureFlagControllerState = messenger.call(
    'RemoteFeatureFlagController:getState',
  );

  const rawSmartTransactionsNetworks =
    remoteFeatureFlagControllerState?.remoteFeatureFlags
      ?.smartTransactionsNetworks;

  return processSmartTransactionsFeatureFlags(rawSmartTransactionsNetworks);
}

/**
 * Gets the merged feature flags configuration for a specific chain.
 * Chain-specific configuration takes precedence over default configuration.
 *
 * For EVM chains, the chain ID is normalized to hex format before lookup.
 * This means both '0x1' and 'eip155:1' will resolve to the same configuration.
 * Non-EVM chains (e.g., Solana, Bitcoin) use exact match.
 *
 * @param featureFlags - The full feature flags configuration
 * @param chainId - The chain ID to get configuration for.
 * Supports both hex (e.g., "0x1") and CAIP-2 format (e.g., "eip155:1", "solana:...")
 * @returns The merged configuration for the specified chain
 * @example
 * ```ts
 * const featureFlags = getSmartTransactionsFeatureFlags(messenger);
 *
 * // Both resolve to the same config (normalized to 0x1)
 * const chainConfig = getSmartTransactionsFeatureFlagsForChain(featureFlags, '0x1');
 * const sameConfig = getSmartTransactionsFeatureFlagsForChain(featureFlags, 'eip155:1');
 *
 * // Non-EVM uses exact match
 * const solanaConfig = getSmartTransactionsFeatureFlagsForChain(featureFlags, 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp');
 *
 * if (chainConfig.extensionActive) {
 *   // Smart transactions are enabled for this chain
 * }
 * ```
 */
export function getSmartTransactionsFeatureFlagsForChain(
  featureFlags: SmartTransactionsFeatureFlagsConfig,
  chainId: Hex | CaipChainId,
): SmartTransactionsNetworkConfig {
  const normalizedChainId = normalizeChainId(chainId);
  const defaultRemoteConfig = featureFlags.default ?? {};
  const chainRemoteConfig = featureFlags[normalizedChainId];

  if (chainRemoteConfig === undefined) {
    return DEFAULT_DISABLED_SMART_TRANSACTIONS_FEATURE_FLAGS.default;
  }

  return {
    ...defaultRemoteConfig,
    ...chainRemoteConfig,
  };
}
