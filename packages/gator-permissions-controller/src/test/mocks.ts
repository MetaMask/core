import type {
  AccountSigner,
  Erc20TokenPeriodicPermission,
  Erc20TokenStreamPermission,
  NativeTokenPeriodicPermission,
  NativeTokenStreamPermission,
} from '@metamask/7715-permission-types';
import type { Hex } from '@metamask/utils';

import type {
  CustomPermission,
  PermissionTypesWithCustom,
  StoredGatorPermission,
} from '../types';

export const mockNativeTokenStreamStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<AccountSigner, NativeTokenStreamPermission> => ({
  permissionResponse: {
    chainId: chainId as Hex,
    address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
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
    dependencyInfo: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    signerMeta: {
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    },
  },
  siteOrigin: 'http://localhost:8000',
});

export const mockNativeTokenPeriodicStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<AccountSigner, NativeTokenPeriodicPermission> => ({
  permissionResponse: {
    chainId: chainId as Hex,
    address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
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
    dependencyInfo: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    signerMeta: {
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    },
  },
  siteOrigin: 'http://localhost:8000',
});

export const mockErc20TokenStreamStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<AccountSigner, Erc20TokenStreamPermission> => ({
  permissionResponse: {
    chainId: chainId as Hex,
    address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
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
    dependencyInfo: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    signerMeta: {
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    },
  },
  siteOrigin: 'http://localhost:8000',
});

export const mockErc20TokenPeriodicStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<AccountSigner, Erc20TokenPeriodicPermission> => ({
  permissionResponse: {
    chainId: chainId as Hex,
    address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
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
    dependencyInfo: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    signerMeta: {
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    },
  },
  siteOrigin: 'http://localhost:8000',
});

export const mockCustomPermissionStorageEntry = (
  chainId: Hex,
  data: Record<string, unknown>,
): StoredGatorPermission<AccountSigner, CustomPermission> => ({
  permissionResponse: {
    chainId: chainId as Hex,
    address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
    permission: {
      type: 'custom',
      isAdjustmentAllowed: true,
      data: {
        justification:
          'This is a very important request for streaming allowance for some very important thing',
        ...data,
      },
    },
    context: '0x00000000',
    dependencyInfo: [
      {
        factory: '0x69Aa2f9fe1572F1B640E1bbc512f5c3a734fc77c',
        factoryData: '0x0000000',
      },
    ],
    signerMeta: {
      delegationManager: '0xdb9B1e94B5b69Df7e401DDbedE43491141047dB3',
    },
  },
  siteOrigin: 'http://localhost:8000',
});

export type MockGatorPermissionsStorageEntriesConfig = {
  [chainId: string]: {
    nativeTokenStream: number;
    nativeTokenPeriodic: number;
    erc20TokenStream: number;
    erc20TokenPeriodic: number;
    custom: {
      count: number;
      data: Record<string, unknown>[];
    };
  };
};

/**
 * Creates a mock gator permissions storage entry
 *
 * @param config - The config for the mock gator permissions storage entries.
 * @returns Mock gator permissions storage entry
 */
/**
 * Creates mock gator permissions storage entries with unique expiry times
 *
 * @param config - The config for the mock gator permissions storage entries.
 * @returns Mock gator permissions storage entries
 */
export function mockGatorPermissionsStorageEntriesFactory(
  config: MockGatorPermissionsStorageEntriesConfig,
): StoredGatorPermission<AccountSigner, PermissionTypesWithCustom>[] {
  const result: StoredGatorPermission<
    AccountSigner,
    PermissionTypesWithCustom
  >[] = [];

  Object.entries(config).forEach(([chainId, counts]) => {
    if (counts.custom.count !== counts.custom.data.length) {
      throw new Error('Custom permission count and data length mismatch');
    }

    /**
     * Creates a number of entries with unique expiry times
     *
     * @param count - The number of entries to create.
     * @param createEntry - The function to create an entry.
     */
    const createEntries = (
      count: number,
      createEntry: () => StoredGatorPermission<
        AccountSigner,
        PermissionTypesWithCustom
      >,
    ) => {
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

    // Create custom entries
    for (let i = 0; i < counts.custom.count; i++) {
      const entry = mockCustomPermissionStorageEntry(
        chainId as Hex,
        counts.custom.data[i],
      );
      result.push(entry);
    }
  });

  return result;
}
