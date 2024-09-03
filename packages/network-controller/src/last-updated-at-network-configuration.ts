import type { NetworkConfiguration } from './NetworkController';

/**
 * Adds or updates the NetworkConfiguration `lastUpdatedAt` property.
 * Keeping this property updated on network changes allows us to compare remote vs local NetworkConfiguration
 * for network syncing.
 *
 * @param configuration - NetworkConfiguration that is being updated
 * @returns the NetworkConfiguration with the lastUpdatedAt property updated.
 */
export function updateNetworkConfigurationLastUpdatedAt(
  configuration: NetworkConfiguration,
) {
  configuration.lastUpdatedAt = Date.now();
  return configuration;
}
