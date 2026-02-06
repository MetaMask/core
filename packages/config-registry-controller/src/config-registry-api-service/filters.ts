import type { RegistryNetworkConfig } from './types';

export type NetworkFilterOptions = {
  isFeatured?: boolean;
  isTestnet?: boolean;
  isActive?: boolean;
  isDeprecated?: boolean;
  isDefault?: boolean;
};

const FILTER_KEYS: (keyof NetworkFilterOptions)[] = [
  'isFeatured',
  'isTestnet',
  'isActive',
  'isDeprecated',
  'isDefault',
];

/**
 * @param networks - Array of network configurations to filter.
 * @param options - Filter options.
 * @returns Filtered array of network configurations.
 */
export function filterNetworks(
  networks: RegistryNetworkConfig[],
  options: NetworkFilterOptions = {},
): RegistryNetworkConfig[] {
  return networks.filter((network) => {
    for (const key of FILTER_KEYS) {
      const optionValue = options[key];
      if (
        optionValue !== undefined &&
        network[key as keyof RegistryNetworkConfig] !== optionValue
      ) {
        return false;
      }
    }
    return true;
  });
}
