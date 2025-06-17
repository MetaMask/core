import type { NetworkConfiguration } from '@metamask/network-controller';

import { createMockNetworkConfiguration } from './__fixtures__/mockNetwork';
import {
  addNetwork,
  batchUpdateNetworks,
  deleteNetwork,
  updateNetwork,
} from './sync-mutations';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import { mockUserStorageMessenger } from '../__fixtures__/mockMessenger';
import {
  mockEndpointBatchUpsertUserStorage,
  mockEndpointUpsertUserStorage,
} from '../__fixtures__/mockServices';
import { MOCK_STORAGE_KEY } from '../mocks';
import type { UserStorageBaseOptions } from '../types';
import UserStorageController from '../UserStorageController';

const storageOpts: UserStorageBaseOptions = {
  bearerToken: 'MOCK_TOKEN',
  storageKey: MOCK_STORAGE_KEY,
};

const arrangeMockNetwork = () =>
  createMockNetworkConfiguration({ chainId: '0x1337' });

const testMatrix = [
  {
    fnName: 'updateNetwork()',
    act: (
      n: NetworkConfiguration,
      opts: {
        getUserStorageControllerInstance: () => UserStorageController;
      },
    ) => updateNetwork(n, opts),
  },
  {
    fnName: 'addNetwork()',
    act: (
      n: NetworkConfiguration,
      opts: {
        getUserStorageControllerInstance: () => UserStorageController;
      },
    ) => addNetwork(n, opts),
  },
  {
    fnName: 'deleteNetwork()',
    act: (
      n: NetworkConfiguration,
      opts: {
        getUserStorageControllerInstance: () => UserStorageController;
      },
    ) => deleteNetwork(n, opts),
  },
];

describe('network-syncing/sync - updateNetwork() / addNetwork() / deleteNetwork()', () => {
  it.each(testMatrix)('should successfully call $fnName', async ({ act }) => {
    const mockNetwork = arrangeMockNetwork();
    const mockUpsertAPI = mockEndpointUpsertUserStorage(
      `${USER_STORAGE_FEATURE_NAMES.networks}.0x1337`,
    );

    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    await act(mockNetwork, {
      getUserStorageControllerInstance: () => controller,
    });
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

      const { messenger } = mockUserStorageMessenger();
      const controller = new UserStorageController({
        messenger,
      });

      await expect(
        async () =>
          await act(mockNetwork, {
            getUserStorageControllerInstance: () => controller,
          }),
      ).rejects.toThrow(expect.any(Error));
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

    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    // Example where we can batch normal adds/updates with deletes
    await batchUpdateNetworks(
      [mockNetworks[0], { ...mockNetworks[1], deleted: true }],
      {
        getUserStorageControllerInstance: () => controller,
      },
    );
    expect(mockBatchUpsertAPI.isDone()).toBe(true);
  });
});
