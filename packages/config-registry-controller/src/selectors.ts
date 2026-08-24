import { createSelector } from 'reselect';

import { filterNetworks } from './config-registry-api-service/filters.js';
import type { RegistryNetworkConfig } from './config-registry-api-service/types.js';
import type { ConfigRegistryControllerState } from './ConfigRegistryController.js';
import { CaipChainId, KnownCaipNamespace } from '@metamask/utils';

/**
 * Base selector to get all networks from the controller state.
 *
 * @param state - The ConfigRegistryController state
 * @returns All network configurations keyed by chain ID
 */
export const selectNetworks = (
  state: ConfigRegistryControllerState,
): Record<string, RegistryNetworkConfig> => state.configs.networks;

/**
 * Selector to get featured, active, non-testnet networks.
 * Use this for the default network list (e.g. main network picker).
 *
 * @param state - The ConfigRegistryController state
 * @returns Filtered network configurations keyed by chain ID
 */
export const selectFeaturedNetworks = createSelector(
  selectNetworks,
  (networks): Record<string, RegistryNetworkConfig> => {
    const networkArray = Object.values(networks);
    const filtered = filterNetworks(networkArray, {
      isFeatured: true,
      isActive: true,
      isTestnet: false,
    });
    const result: Record<string, RegistryNetworkConfig> = {};
    filtered.forEach((config) => {
      result[config.chainId] = config;
    });
    return result;
  },
);

/**
 * Returns the list of CAIP-2 chain IDs for networks that are auto-enabled in the
 * config registry.
 *
 * @param state - The config registry controller state.
 * @returns The list of CAIP-2 chain IDs for auto-enabled networks.
 */
export function selectEvmAutoEnabledNetworksChainIds(
  state: ConfigRegistryControllerState,
): CaipChainId[] {
  return Object.values(state.configs.networks)
    .filter(
      ({ chainId, config }) =>
        chainId.startsWith(KnownCaipNamespace.Eip155) &&
        config.isAutoEnabled &&
        config.isActive &&
        !config.isDeprecated,
    )
    .map((config) => config.chainId);
}
