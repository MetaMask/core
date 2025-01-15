import { createMockNetworkConfiguration } from './__fixtures__/mockNetwork';
import {
  calculateAvailableSpaceToAdd,
  getBoundedNetworksToAdd,
} from './add-network-utils';

describe('calculateAvailableSpaceToAdd()', () => {
  it('returns available space to add', () => {
    expect(calculateAvailableSpaceToAdd(5, 10)).toBe(5);
    expect(calculateAvailableSpaceToAdd(9, 10)).toBe(1);
  });
  it('returns 0 if there is no available space to add', () => {
    expect(calculateAvailableSpaceToAdd(5, 5)).toBe(0);
    expect(calculateAvailableSpaceToAdd(10, 5)).toBe(0);
  });
});

describe('getBoundedNetworksToAdd()', () => {
  it('returns networks to add if within bounds', () => {
    const originalNetworks = arrangeTestNetworks(['0x1', '0x2']);
    const networksToAdd = arrangeTestNetworks(['0x3', '0x4']);
    const result = getBoundedNetworksToAdd(originalNetworks, networksToAdd);
    expect(result).toHaveLength(2); // we can all networks
  });

  it('returns a max size of networks to add if larger than max bounds', () => {
    const originalNetworks = arrangeTestNetworks(['0x1', '0x2']);
    const networksToAdd = arrangeTestNetworks(['0x3', '0x4']);
    const result = getBoundedNetworksToAdd(originalNetworks, networksToAdd, 3); // max size set to 3
    expect(result).toHaveLength(1); // we can only add 1 network
  });

  it('returns an empty array if there is not available space to add networks', () => {
    const originalNetworks = arrangeTestNetworks(['0x1', '0x2']);
    const networksToAdd = arrangeTestNetworks(['0x3', '0x4']);

    const result2 = getBoundedNetworksToAdd(originalNetworks, networksToAdd, 2); // max size is set to 2
    expect(result2).toHaveLength(0); // we've used up all the available space, so no networks can be added

    const result3 = getBoundedNetworksToAdd(originalNetworks, networksToAdd, 1); // max size is set to 1
    expect(result3).toHaveLength(0); // we've used up all the available space, so no networks can be added
  });

  it('returns a list of networks ordered by chainId to add', () => {
    const originalNetworks = arrangeTestNetworks(['0x1', '0x2']);
    const networksToAdd = arrangeTestNetworks(['0x3', '0x4', '0x33']);

    const result = getBoundedNetworksToAdd(originalNetworks, networksToAdd, 4); // Max size is set to 4
    expect(result).toHaveLength(2); // We can only add 2 of the 3 networks to add

    // we are only adding 0x3 and 0x33 since the list was ordered
    // 0x4 was dropped as we ran out of available space
    expect(result.map((n) => n.chainId)).toStrictEqual(['0x3', '0x33']);
  });

  /**
   * Test Utility - creates an array of network configurations
   * @param chains - list of chains to create
   * @returns array of mock network configurations
   */
  function arrangeTestNetworks(chains: `0x${string}`[]) {
    return chains.map((chainId) => {
      const n = createMockNetworkConfiguration();
      n.chainId = chainId;
      return n;
    });
  }
});
