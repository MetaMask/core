import { createSelector } from 'reselect';

import { filterNetworks } from './config-registry-api-service/filters';
import type { RegistryNetworkConfig } from './config-registry-api-service/types';
import type { ConfigRegistryControllerState } from './ConfigRegistryController';

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
