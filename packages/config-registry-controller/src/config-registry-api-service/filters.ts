import type { RegistryNetworkConfig } from './types';

export type NetworkFilterOptions = {
  isFeatured?: boolean;
  isTestnet?: boolean;
  isActive?: boolean;
  isDeprecated?: boolean;
  isDefault?: boolean;
};

const FILTER_KEYS = [
  'isFeatured',
  'isTestnet',
  'isActive',
  'isDeprecated',
  'isDefault',
] as const satisfies (keyof NetworkFilterOptions)[];

/**
 * @param networks - Array of chain configurations to filter.
 * @param options - Filter options (matched against config.*).
 * @returns Filtered array of chain configurations.
 */
export function filterNetworks(
  networks: RegistryNetworkConfig[],
  options: NetworkFilterOptions = {},
): RegistryNetworkConfig[] {
  return networks.filter((network) => {
    const { config } = network;
    for (const key of FILTER_KEYS) {
      const optionValue = options[key];
      if (
        optionValue !== undefined &&
        config[key as keyof typeof config] !== optionValue
      ) {
        return false;
      }
    }
    return true;
  });
}
