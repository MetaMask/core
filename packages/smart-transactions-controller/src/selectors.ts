import type { CaipChainId, Hex } from '@metamask/utils';
import { createSelector as createSelector_ } from 'reselect';

import {
  processSmartTransactionsFeatureFlags,
  getSmartTransactionsFeatureFlagsForChain,
} from './featureFlags/feature-flags';
import type {
  SmartTransactionsFeatureFlagsConfig,
  SmartTransactionsNetworkConfig,
} from './types';

/**
 * The state shape expected by the smart transactions feature flag selectors.
 * This represents the relevant portion of the remote feature flag controller state.
 */
export type SmartTransactionsFeatureFlagsState = {
  remoteFeatureFlags?: {
    smartTransactionsNetworks?: unknown;
  };
};

/**
 * Creates a typed selector for smart transactions feature flags
 */
const createSelector =
  createSelector_.withTypes<SmartTransactionsFeatureFlagsState>();

/**
 * Selects and validates the smart transactions feature flags from state.
 * Returns the validated configuration or defaults if invalid.
 * If you need to get the feature flags for a specific chain, use `selectSmartTransactionsFeatureFlagsForChain`.
 *
 * @param state - The state containing remoteFeatureFlags.smartTransactionsNetworks
 * @returns The validated smart transactions feature flags configuration
 * @example
 * ```ts
 * // In a React component
 * const featureFlags = useSelector(selectSmartTransactionsFeatureFlags);
 *
 * // Or with reselect composition
 * const selectIsExtensionActive = createSelector(
 *   selectSmartTransactionsFeatureFlags,
 *   (flags) => flags.default?.extensionActive ?? false
 * );
 * ```
 */
export const selectSmartTransactionsFeatureFlags = createSelector(
  [(state) => state.remoteFeatureFlags?.smartTransactionsNetworks],
  (rawFeatureFlags): SmartTransactionsFeatureFlagsConfig =>
    processSmartTransactionsFeatureFlags(rawFeatureFlags),
);

/**
 * Selects the merged feature flags configuration for a specific chain.
 * Chain-specific configuration takes precedence over default configuration.
 *
 * For EVM chains, the chain ID is normalized to hex format before lookup.
 * This means both '0x1' and 'eip155:1' will resolve to the same configuration.
 * Non-EVM chains (e.g., Solana, Bitcoin) use exact match.
 *
 * @param _state - The state containing remoteFeatureFlags.smartTransactionsNetworks
 * @param chainId - The chain ID to get configuration for.
 * Supports both hex (e.g., "0x1") and CAIP-2 format (e.g., "eip155:1", "solana:...")
 * @returns The merged configuration for the specified chain
 * @example
 * ```ts
 * // Both resolve to the same config (normalized to 0x1)
 * const chainConfig = useSelector((state) =>
 *   selectSmartTransactionsFeatureFlagsForChain(state, '0x1')
 * );
 * const sameConfig = useSelector((state) =>
 *   selectSmartTransactionsFeatureFlagsForChain(state, 'eip155:1')
 * );
 *
 * // Non-EVM uses exact match
 * const solanaConfig = useSelector((state) =>
 *   selectSmartTransactionsFeatureFlagsForChain(state, 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp')
 * );
 *
 * if (chainConfig.extensionActive) {
 *   // Smart transactions are enabled
 * }
 * ```
 */
export const selectSmartTransactionsFeatureFlagsForChain = createSelector(
  [
    selectSmartTransactionsFeatureFlags,
    (_state: SmartTransactionsFeatureFlagsState, chainId: Hex | CaipChainId) =>
      chainId,
  ],
  (featureFlags, chainId): SmartTransactionsNetworkConfig =>
    getSmartTransactionsFeatureFlagsForChain(featureFlags, chainId),
);
