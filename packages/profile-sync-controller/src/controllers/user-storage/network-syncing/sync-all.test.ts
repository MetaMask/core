import {
  createMockNetworkConfiguration,
  createMockRemoteNetworkConfiguration,
} from './__fixtures__/mockNetwork';
import {
  checkWhichNetworkIsLatest,
  getDataStructures,
  getMissingNetworkLists,
  getUpdatedNetworkLists,
  findNetworksToUpdate,
} from './sync-all';
import type { NetworkConfiguration, RemoteNetworkConfiguration } from './types';

/**
 * This is not used externally, but meant to check logic is consistent
 */
describe('getDataStructures()', () => {
  it('should return list of underlying data structures for main sync', () => {
    const localNetworks = arrangeLocalNetworks(['1', '2', '3']);
    const remoteNetworks = arrangeRemoteNetworks(['3', '4', '5']);
    remoteNetworks[1].d = true; // test that a network was deleted

    const result = getDataStructures(localNetworks, remoteNetworks);

    expect(result.localMap.size).toBe(3);
    expect(result.remoteMap.size).toBe(3);
    expect(result.localKeySet.size).toBe(3);
    expect(result.remoteMap.size).toBe(3);
    expect(result.existingRemoteKeySet.size).toBe(2); // a remote network was marked as deleted
  });
});

/**
 * This is not used externally, but meant to check logic is consistent
 */
describe('getMissingNetworkLists()', () => {
  it('should return the difference/missing lists from local and remote', () => {
    const localNetworks = arrangeLocalNetworks(['1', '2', '3']);
    const remoteNetworks = arrangeRemoteNetworks(['3', '4', '5']);
    remoteNetworks[1].d = true; // test that a network was deleted

    const ds = getDataStructures(localNetworks, remoteNetworks);
    const result = getMissingNetworkLists(ds);

    expect(result.missingRemoteNetworks.map((n) => n.chainId)).toStrictEqual([
      '0x1',
      '0x2',
    ]);
    expect(result.missingLocalNetworks.map((n) => n.chainId)).toStrictEqual([
      '0x5', // 0x4 was deleted, so is not a missing local network
    ]);
  });
});

const date1 = Date.now();
const date2 = date1 - 1000 * 60 * 2;
const testMatrix = [
  {
    test: `both don't have updatedAt property`,
    dates: [null, null] as const,
    actual: 'Do Nothing' as const,
  },
  {
    test: 'local has updatedAt property',
    dates: [date1, null] as const,
    actual: 'Local Wins' as const,
  },
  {
    test: 'remote has updatedAt property',
    dates: [null, date1] as const,
    actual: 'Remote Wins' as const,
  },
  {
    test: 'both have equal updateAt properties',
    dates: [date1, date1] as const,
    actual: 'Do Nothing' as const,
  },
  {
    test: 'both have field and local is newer',
    dates: [date1, date2] as const,
    actual: 'Local Wins' as const,
  },
  {
    test: 'both have field and remote is newer',
    dates: [date2, date1] as const,
    actual: 'Remote Wins' as const,
  },
];

/**
 * This is not used externally, but meant to check logic is consistent
 */
describe('checkWhichNetworkIsLatest()', () => {
  it.each(testMatrix)(
    'should test when [$test] and the result would be: [$actual]',
    ({ dates, actual }) => {
      const localNetwork = createMockNetworkConfiguration({
        lastUpdatedAt: dates[0] ?? undefined,
      });
      const remoteNetwork = createMockRemoteNetworkConfiguration({
        lastUpdatedAt: dates[1] ?? undefined,
      });
      const result = checkWhichNetworkIsLatest(localNetwork, remoteNetwork);
      expect(result).toBe(actual);
    },
  );
});

/**
 * This is not used externally, but meant to check logic is consistent
 */
describe('getUpdatedNetworkLists()', () => {
  it('should take intersecting networks and determine which needs updating', () => {
    // Arrange
    const localNetworks: NetworkConfiguration[] = [];
    const remoteNetworks: RemoteNetworkConfiguration[] = [];

    // Test Matrix combinations
    testMatrix.forEach(({ dates }, idx) => {
      localNetworks.push(
        createMockNetworkConfiguration({
          chainId: `0x${idx}`,
          lastUpdatedAt: dates[0] ?? undefined,
        }),
      );
      remoteNetworks.push(
        createMockRemoteNetworkConfiguration({
          chainId: `0x${idx}`,
          lastUpdatedAt: dates[1] ?? undefined,
        }),
      );
    });

    // Test isDeleted on remote check
    localNetworks.push(
      createMockNetworkConfiguration({
        chainId: '0xTestRemoteWinIsDeleted',
        lastUpdatedAt: date2,
      }),
    );
    remoteNetworks.push(
      createMockRemoteNetworkConfiguration({
        chainId: '0xTestRemoteWinIsDeleted',
        lastUpdatedAt: date1,
        d: true,
      }),
    );

    // Test make sure these don't appear in lists
    localNetworks.push(
      createMockNetworkConfiguration({ chainId: '0xNotIntersecting1' }),
    );
    remoteNetworks.push(
      createMockRemoteNetworkConfiguration({ chainId: '0xNotIntersecting2' }),
    );

    // Act
    const ds = getDataStructures(localNetworks, remoteNetworks);
    const result = getUpdatedNetworkLists(ds);
    const localIdsUpdated = result.localNetworksToUpdate.map((n) => n.chainId);
    const localIdsRemoved = result.localNetworksToRemove.map((n) => n.chainId);
    const remoteIdsUpdated = result.remoteNetworksToUpdate.map(
      (n) => n.chainId,
    );

    // Assert - Test Matrix combinations were all tested
    let testCount = 0;
    testMatrix.forEach(({ actual }, idx) => {
      const chainId = `0x${idx}` as const;
      if (actual === 'Do Nothing') {
        testCount += 1;
        // eslint-disable-next-line jest/no-conditional-expect
        expect([
          localIdsUpdated.includes(chainId),
          localIdsRemoved.includes(chainId),
          remoteIdsUpdated.includes(chainId),
        ]).toStrictEqual([false, false, false]);
      } else if (actual === 'Local Wins') {
        testCount += 1;
        // eslint-disable-next-line jest/no-conditional-expect
        expect(remoteIdsUpdated).toContain(chainId);
      } else if (actual === 'Remote Wins') {
        testCount += 1;
        // eslint-disable-next-line jest/no-conditional-expect
        expect(localIdsUpdated).toContain(chainId);
      }
    });
    expect(testCount).toBe(testMatrix.length); // Matrix Combinations were all tested

    // Assert - check isDeleted item
    expect(localIdsRemoved).toStrictEqual(['0xTestRemoteWinIsDeleted']);

    // Assert - check non-intersecting items are not in lists
    expect([
      localIdsUpdated.includes('0xNotIntersecting1'),
      localIdsRemoved.includes('0xNotIntersecting1'),
      remoteIdsUpdated.includes('0xNotIntersecting1'),
    ]).toStrictEqual([false, false, false]);
    expect([
      localIdsUpdated.includes('0xNotIntersecting2'),
      localIdsRemoved.includes('0xNotIntersecting2'),
      remoteIdsUpdated.includes('0xNotIntersecting2'),
    ]).toStrictEqual([false, false, false]);
  });
});

describe('findNetworksToUpdate()', () => {
  it('should add missing networks to remote and local', () => {
    const localNetworks = arrangeLocalNetworks(['1']);
    const remoteNetworks = arrangeRemoteNetworks(['2']);

    const result = findNetworksToUpdate({ localNetworks, remoteNetworks });

    // Only 1 network needs to be added to local
    expect(result?.missingLocalNetworks).toHaveLength(1);
    expect(result?.missingLocalNetworks?.[0]?.chainId).toBe('0x2');

    // No networks are to be removed locally
    expect(result?.localNetworksToRemove).toStrictEqual([]);

    // No networks are to be updated locally
    expect(result?.localNetworksToUpdate).toStrictEqual([]);

    // Only 1 network needs to be updated
    expect(result?.remoteNetworksToUpdate).toHaveLength(1);
    expect(result?.remoteNetworksToUpdate?.[0]?.chainId).toBe('0x1');
  });

  it('should update intersecting networks', () => {
    // We will test against the intersecting test matrix
    const localNetworks: NetworkConfiguration[] = [];
    const remoteNetworks: RemoteNetworkConfiguration[] = [];

    // Test Matrix combinations
    testMatrix.forEach(({ dates }, idx) => {
      localNetworks.push(
        createMockNetworkConfiguration({
          chainId: `0x${idx}`,
          lastUpdatedAt: dates[0] ?? undefined,
        }),
      );
      remoteNetworks.push(
        createMockRemoteNetworkConfiguration({
          chainId: `0x${idx}`,
          lastUpdatedAt: dates[1] ?? undefined,
        }),
      );
    });

    const result = findNetworksToUpdate({ localNetworks, remoteNetworks });

    // Assert - No local networks to add or remove
    expect(result?.missingLocalNetworks).toStrictEqual([]);
    expect(result?.localNetworksToRemove).toStrictEqual([]);

    // Assert - Local and Remote networks to update
    const updateLocalIds =
      result?.localNetworksToUpdate?.map((n) => n.chainId) ?? [];
    const updateRemoteIds =
      result?.remoteNetworksToUpdate?.map((n) => n.chainId) ?? [];

    // Check Test Matrix combinations were all tested
    let testCount = 0;
    testMatrix.forEach(({ actual }, idx) => {
      const chainId = `0x${idx}` as const;
      if (actual === 'Do Nothing') {
        testCount += 1;
        // No lists are updated if nothing changes
        // eslint-disable-next-line jest/no-conditional-expect
        expect([
          updateLocalIds.includes(chainId),
          updateRemoteIds.includes(chainId),
        ]).toStrictEqual([false, false]);
      } else if (actual === 'Local Wins') {
        testCount += 1;
        // Only remote is updated if local wins
        // eslint-disable-next-line jest/no-conditional-expect
        expect([
          updateLocalIds.includes(chainId),
          updateRemoteIds.includes(chainId),
        ]).toStrictEqual([false, true]);
      } else if (actual === 'Remote Wins') {
        testCount += 1;
        // Only local is updated if remote wins
        // eslint-disable-next-line jest/no-conditional-expect
        expect([
          updateLocalIds.includes(chainId),
          updateRemoteIds.includes(chainId),
        ]).toStrictEqual([true, false]);
      }
    });
    expect(testCount).toBe(testMatrix.length); // Matrix Combinations were all tested
  });

  it('should remove deleted networks', () => {
    const localNetworks = arrangeLocalNetworks(['1', '2']);
    const remoteNetworks = arrangeRemoteNetworks(['1', '2']);
    localNetworks[1].lastUpdatedAt = date2;
    remoteNetworks[1].lastUpdatedAt = date1;
    remoteNetworks[1].d = true;

    const result = findNetworksToUpdate({ localNetworks, remoteNetworks });

    // Assert no remote networks need updating
    expect(result?.remoteNetworksToUpdate).toStrictEqual([]);

    // Assert no local networks need to be updated or added
    expect(result?.localNetworksToUpdate).toStrictEqual([]);
    expect(result?.missingLocalNetworks).toStrictEqual([]);

    // Assert that a network needs to be removed locally (network 0x2)
    expect(result?.localNetworksToRemove).toHaveLength(1);
    expect(result?.localNetworksToRemove?.[0]?.chainId).toBe('0x2');

    // Remote List does not have any networks that need updating
    expect(result?.remoteNetworksToUpdate).toHaveLength(0);
  });
});

/**
 * Test Utility - Create a list of mock local network configurations
 * @param ids - list of chains to support
 * @returns list of local networks
 */
function arrangeLocalNetworks(ids: string[]) {
  return ids.map((id) =>
    createMockNetworkConfiguration({ chainId: `0x${id}` }),
  );
}

/**
 * Test Utility - Create a list of mock remote network configurations
 * @param ids - list of chains to support
 * @returns list of local networks
 */
function arrangeRemoteNetworks(ids: string[]) {
  return ids.map((id) =>
    createMockRemoteNetworkConfiguration({ chainId: `0x${id}` }),
  );
}
