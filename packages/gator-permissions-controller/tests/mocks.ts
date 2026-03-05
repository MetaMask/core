import type {
  Erc20TokenPeriodicPermission,
  Erc20TokenStreamPermission,
  NativeTokenPeriodicPermission,
  NativeTokenStreamPermission,
} from '@metamask/7715-permission-types';
import type { Hex } from '@metamask/utils';

import type { StoredGatorPermission } from '../src/types';

/**
 * Mock stored gator permission: native-token-stream (as returned by the Snap).
 *
 * @param chainId - The chain ID of the permission.
 * @returns Mock stored gator permission: native-token-stream.
 */
export const mockNativeTokenStreamStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<NativeTokenStreamPermission> => ({
  permissionResponse: {
    chainId,
    from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    to: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
    permission: {
      type: 'native-token-stream',
      isAdjustmentAllowed: true,
      data: {
        maxAmount: '0x22b1c8c1227a0000',
        initialAmount: '0x6f05b59d3b20000',
        amountPerSecond: '0x6f05b59d3b20000',
        startTime: 1747699200,
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
    },
    context: '0x00000000',
    dependencies: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
  },
  siteOrigin: 'http://localhost:8000',
});

/**
 * Mock stored gator permission: native-token-periodic (as returned by the Snap).
 *
 * @param chainId - The chain ID of the permission.
 * @returns Mock stored gator permission: native-token-periodic.
 */
export const mockNativeTokenPeriodicStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<NativeTokenPeriodicPermission> => ({
  permissionResponse: {
    chainId,
    from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    to: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
    permission: {
      type: 'native-token-periodic',
      isAdjustmentAllowed: true,
      data: {
        periodAmount: '0x22b1c8c1227a0000',
        periodDuration: 1747699200,
        startTime: 1747699200,
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
    },
    context: '0x00000000',
    dependencies: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
  },
  siteOrigin: 'http://localhost:8000',
});

/**
 * Mock stored gator permission: erc20-token-stream (as returned by the Snap).
 *
 * @param chainId - The chain ID of the permission.
 * @returns Mock stored gator permission: erc20-token-stream.
 */
export const mockErc20TokenStreamStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<Erc20TokenStreamPermission> => ({
  permissionResponse: {
    chainId,
    from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    to: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
    permission: {
      type: 'erc20-token-stream',
      isAdjustmentAllowed: true,
      data: {
        initialAmount: '0x22b1c8c1227a0000',
        maxAmount: '0x6f05b59d3b20000',
        amountPerSecond: '0x6f05b59d3b20000',
        startTime: 1747699200,
        tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
    },
    context: '0x00000000',
    dependencies: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
  },
  siteOrigin: 'http://localhost:8000',
});

/**
 * Mock stored gator permission: erc20-token-periodic (as returned by the Snap).
 *
 * @param chainId - The chain ID of the permission.
 * @returns Mock stored gator permission: erc20-token-periodic.
 */
export const mockErc20TokenPeriodicStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<Erc20TokenPeriodicPermission> => ({
  permissionResponse: {
    chainId,
    from: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    to: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63',
    permission: {
      type: 'erc20-token-periodic',
      isAdjustmentAllowed: true,
      data: {
        periodAmount: '0x22b1c8c1227a0000',
        periodDuration: 1747699200,
        startTime: 1747699200,
        tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
    },
    context: '0x00000000',
    dependencies: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
  },
  siteOrigin: 'http://localhost:8000',
});

/**
 * Config for mock stored gator permissions: per chainId, how many of each permission type to create.
 */
export type MockGatorPermissionsStorageEntriesConfig = {
  [chainId: string]: {
    nativeTokenStream: number;
    nativeTokenPeriodic: number;
    erc20TokenStream: number;
    erc20TokenPeriodic: number;
  };
};

/**
 * Creates mock stored gator permissions as returned by the gator permissions provider Snap.
 *
 * @param config - Per-chain counts for each permission type.
 * @returns Array of {@link StoredGatorPermission} entries.
 */
export function mockGatorPermissionsStorageEntriesFactory(
  config: MockGatorPermissionsStorageEntriesConfig,
): StoredGatorPermission[] {
  const result: StoredGatorPermission[] = [];

  Object.entries(config).forEach(([chainId, counts]) => {
    const createEntries = (
      count: number,
      createEntry: () => StoredGatorPermission,
    ): void => {
      for (let i = 0; i < count; i++) {
        const entry = createEntry();
        result.push(entry);
      }
    };

    createEntries(counts.nativeTokenStream, () =>
      mockNativeTokenStreamStorageEntry(chainId as Hex),
    );

    createEntries(counts.nativeTokenPeriodic, () =>
      mockNativeTokenPeriodicStorageEntry(chainId as Hex),
    );

    createEntries(counts.erc20TokenStream, () =>
      mockErc20TokenStreamStorageEntry(chainId as Hex),
    );

    createEntries(counts.erc20TokenPeriodic, () =>
      mockErc20TokenPeriodicStorageEntry(chainId as Hex),
    );
  });

  return result;
}
