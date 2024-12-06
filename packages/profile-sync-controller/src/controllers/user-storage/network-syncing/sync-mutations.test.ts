import type { NetworkConfiguration } from '@metamask/network-controller';

import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import { MOCK_STORAGE_KEY } from '../__fixtures__';
import {
  mockEndpointBatchUpsertUserStorage,
  mockEndpointUpsertUserStorage,
} from '../__fixtures__/mockServices';
import type { UserStorageBaseOptions } from '../services';
import { createMockNetworkConfiguration } from './__fixtures__/mockNetwork';
import {
  addNetwork,
  batchUpdateNetworks,
  deleteNetwork,
  updateNetwork,
} from './sync-mutations';

const storageOpts: UserStorageBaseOptions = {
  bearerToken: 'MOCK_TOKEN',
  storageKey: MOCK_STORAGE_KEY,
};

const arrangeMockNetwork = () =>
  createMockNetworkConfiguration({ chainId: '0x1337' });

const testMatrix = [
  {
    fnName: 'updateNetwork()',
    act: (n: NetworkConfiguration) => updateNetwork(n, storageOpts),
  },
  {
    fnName: 'addNetwork()',
    act: (n: NetworkConfiguration) => addNetwork(n, storageOpts),
  },
  {
    fnName: 'deleteNetwork()',
    act: (n: NetworkConfiguration) => deleteNetwork(n, storageOpts),
  },
];

describe('network-syncing/sync - updateNetwork() / addNetwork() / deleteNetwork()', () => {
  it.each(testMatrix)('should successfully call $fnName', async ({ act }) => {
    const mockNetwork = arrangeMockNetwork();
    const mockUpsertAPI = mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.networks}.0x1337`,
    );
    await act(mockNetwork);
    expect(mockUpsertAPI.isDone()).toBe(true);
  });

  it.each(testMatrix)(
    'should throw error when calling $fnName when API fails',
    async ({ act }) => {
      const mockNetwork = arrangeMockNetwork();
      const mockUpsertAPI = mockEndpointUpsertUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.networks}.0x1337`,
        {
          status: 500,
        },
      );
      await expect(async () => await act(mockNetwork)).rejects.toThrow(
        expect.any(Error),
      );
      expect(mockUpsertAPI.isDone()).toBe(true);
    },
  );
});

describe('network-syncing/sync - batchUpdateNetworks()', () => {
  const arrangeMocks = () => {
    const mockNetworks = [
      createMockNetworkConfiguration({ chainId: '0x1337' }),
      createMockNetworkConfiguration({ chainId: '0x1338' }),
    ];

    return {
      storageOps: storageOpts,
      mockNetworks,
      mockBatchUpsertAPI: mockEndpointBatchUpsertUserStorage('networks'),
    };
  };

  it('should call upsert storage API with mock network', async () => {
    const { mockNetworks, mockBatchUpsertAPI } = arrangeMocks();
    // Example where we can batch normal adds/updates with deletes
    await batchUpdateNetworks(
      [mockNetworks[0], { ...mockNetworks[1], deleted: true }],
      storageOpts,
    );
    expect(mockBatchUpsertAPI.isDone()).toBe(true);
  });
});
