import type { Hex } from '@metamask/utils';

import type {
  AccountSigner,
  CustomPermission,
  Erc20TokenPeriodicPermission,
  Erc20TokenStreamPermission,
  NativeTokenPeriodicPermission,
  NativeTokenStreamPermission,
  PermissionTypes,
  StoredGatorPermission,
} from '../types';

export const mockNativeTokenStreamStorageEntry = (
  chainId: Hex,
): StoredGatorPermission<AccountSigner, NativeTokenStreamPermission> => ({
  permissionResponse: {
    chainId: chainId as Hex,
    address: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
    expiry: 1750291201,
    isAdjustmentAllowed: true,
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
    permission: {
      type: 'native-token-stream',
      data: {
        maxAmount: '0x22b1c8c1227a0000',
        initialAmount: '0x6f05b59d3b20000',
        amountPerSecond: '0x6f05b59d3b20000',
        startTime: 1747699200,
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
      rules: {},
    },
    context: '0x00000000',
    accountMeta: [
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
    expiry: 1850291200,
    isAdjustmentAllowed: true,
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
    permission: {
      type: 'native-token-periodic',
      data: {
        periodAmount: '0x22b1c8c1227a0000',
        periodDuration: 1747699200,
        startTime: 1747699200,
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
      rules: {},
    },
    context: '0x00000000',
    accountMeta: [
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
    expiry: 1750298200,
    isAdjustmentAllowed: true,
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
    permission: {
      type: 'erc20-token-stream',
      data: {
        initialAmount: '0x22b1c8c1227a0000',
        maxAmount: '0x6f05b59d3b20000',
        amountPerSecond: '0x6f05b59d3b20000',
        startTime: 1747699200,
        tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
      rules: {},
    },
    context: '0x00000000',
    accountMeta: [
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
    expiry: 1750291600,
    isAdjustmentAllowed: true,
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
    permission: {
      type: 'erc20-token-periodic',
      data: {
        periodAmount: '0x22b1c8c1227a0000',
        periodDuration: 1747699200,
        startTime: 1747699200,
        tokenAddress: '0xB68c70159E9892DdF5659ec42ff9BD2bbC23e778',
        justification:
          'This is a very important request for streaming allowance for some very important thing',
      },
      rules: {},
    },
    context: '0x00000000',
    accountMeta: [
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
    expiry: 1750291200,
    isAdjustmentAllowed: true,
    signer: {
      type: 'account',
      data: { address: '0x4f71DA06987BfeDE90aF0b33E1e3e4ffDCEE7a63' },
    },
    permission: {
      type: 'custom',
      data: {
        justification:
          'This is a very important request for streaming allowance for some very important thing',
        ...data,
      },
      rules: {},
    },
    context: '0x00000000',
    accountMeta: [
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
): StoredGatorPermission<AccountSigner, PermissionTypes>[] {
  const result: StoredGatorPermission<AccountSigner, PermissionTypes>[] = [];
  let globalIndex = 0;

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
      createEntry: () => StoredGatorPermission<AccountSigner, PermissionTypes>,
    ) => {
      for (let i = 0; i < count; i++) {
        const entry = createEntry();
        entry.permissionResponse.expiry += globalIndex;
        result.push(entry);
        globalIndex += 1;
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
      entry.permissionResponse.expiry += globalIndex;
      result.push(entry);
      globalIndex += 1;
    }
  });

  return result;
}
