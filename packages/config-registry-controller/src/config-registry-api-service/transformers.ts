import type { NetworkConfig } from './types';

export type NetworkFilterOptions = {
  isFeatured?: boolean;
  isTestnet?: boolean;
  isActive?: boolean;
  isDeprecated?: boolean;
  isDefault?: boolean;
};

/**
 * @param networks - Array of network configurations to filter.
 * @param options - Filter options.
 * @returns Filtered array of network configurations.
 */
export function filterNetworks(
  networks: NetworkConfig[],
  options: NetworkFilterOptions = {},
): NetworkConfig[] {
  if (!Array.isArray(networks)) {
    return [];
  }

  return networks.filter((network) => {
    if (!network || typeof network !== 'object') {
      return false;
    }

    if (options.isFeatured !== undefined) {
      if (network.isFeatured !== options.isFeatured) {
        return false;
      }
    }

    if (options.isTestnet !== undefined) {
      if (network.isTestnet !== options.isTestnet) {
        return false;
      }
    }

    if (options.isActive !== undefined) {
      if (network.isActive !== options.isActive) {
        return false;
      }
    }

    if (options.isDeprecated !== undefined) {
      if (network.isDeprecated !== options.isDeprecated) {
        return false;
      }
    }

    if (options.isDefault !== undefined) {
      if (network.isDefault !== options.isDefault) {
        return false;
      }
    }

    return true;
  });
}
