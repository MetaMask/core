import type { NetworkConfiguration } from '@metamask/network-controller';

export const MAX_NETWORKS_SIZE = 50;

/**
 * Calculates the available space to add new networks
 * exported for testability.
 * @param originalListSize - size of original list
 * @param maxSize - max size
 * @returns a positive number on the available space
 */
export const calculateAvailableSpaceToAdd = (
  originalListSize: number,
  maxSize: number,
) => {
  return Math.max(0, maxSize - originalListSize);
};

/**
 * Returns a bounded number of networks to add (set by a max bound)
 * The items will be ordered to give determinism on items to append (not random)
 *
 * @param originalNetworks - The original list of network configurations.
 * @param networksToAdd - The list of network configurations to add.
 * @param maxSize - The maximum allowed size of the list. Defaults to MAX_NETWORKS_SIZE.
 * @returns The networks to add, sorted by chainId.
 */
export const getBoundedNetworksToAdd = (
  originalNetworks: NetworkConfiguration[],
  networksToAdd: NetworkConfiguration[],
  maxSize = MAX_NETWORKS_SIZE,
) => {
  const availableSpace = calculateAvailableSpaceToAdd(
    originalNetworks.length,
    maxSize,
  );
  const numberOfNetworksToAppend = Math.min(
    availableSpace,
    networksToAdd.length,
  );

  // Order and slice the networks to append
  // Ordering so we have some determinism on the order of items
  return networksToAdd
    .sort((a, b) => a.chainId.localeCompare(b.chainId))
    .slice(0, numberOfNetworksToAppend);
};
