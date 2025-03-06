import { createMockRemoteNetworkConfiguration } from './__fixtures__/mockNetwork';
import {
  batchUpsertRemoteNetworks,
  getAllRemoteNetworks,
  upsertRemoteNetwork,
} from './services';
import type { RemoteNetworkConfiguration } from './types';
import UserStorageController from '..';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import { mockUserStorageMessenger } from '../__fixtures__/mockMessenger';
import {
  mockEndpointBatchUpsertUserStorage,
  mockEndpointGetUserStorageAllFeatureEntries,
  mockEndpointUpsertUserStorage,
} from '../__fixtures__/mockServices';
import {
  MOCK_STORAGE_KEY,
  createMockAllFeatureEntriesResponse,
} from '../mocks';
import type { UserStorageBaseOptions } from '../types';

const storageOpts: UserStorageBaseOptions = {
  bearerToken: 'MOCK_TOKEN',
  storageKey: MOCK_STORAGE_KEY,
};

describe('network-syncing/services - getAllRemoteNetworks()', () => {
  const arrangeMockNetwork = () => {
    const mockNetwork = createMockRemoteNetworkConfiguration({
      chainId: '0x1337',
    });
    return {
      mockNetwork,
    };
  };

  const arrangeMockGetAllAPI = async (
    network: RemoteNetworkConfiguration,
    status: 200 | 500 = 200,
  ) => {
    const payload = {
      status,
      body:
        status === 200
          ? await createMockAllFeatureEntriesResponse([JSON.stringify(network)])
          : {},
    };

    return {
      mockGetAllAPI: await mockEndpointGetUserStorageAllFeatureEntries(
        USER_STORAGE_FEATURE_NAMES.networks,
        payload,
      ),
    };
  };

  it('should return list of remote networks', async () => {
    const { mockNetwork } = arrangeMockNetwork();
    const { mockGetAllAPI } = await arrangeMockGetAllAPI(mockNetwork);

    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    const result = await getAllRemoteNetworks({
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockGetAllAPI.isDone()).toBe(true);

    expect(result).toHaveLength(1);
    expect(result[0].chainId).toBe(mockNetwork.chainId);
  });

  it('should return an empty list if fails to get networks', async () => {
    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    const { mockNetwork } = arrangeMockNetwork();
    const { mockGetAllAPI } = await arrangeMockGetAllAPI(mockNetwork, 500);

    const result = await getAllRemoteNetworks({
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockGetAllAPI.isDone()).toBe(true);

    expect(result).toHaveLength(0);
  });

  it('should return empty list if unable to parse retrieved networks', async () => {
    const { mockNetwork } = arrangeMockNetwork();
    const { mockGetAllAPI } = await arrangeMockGetAllAPI(mockNetwork);
    const realParse = JSON.parse;
    jest.spyOn(JSON, 'parse').mockImplementation((data) => {
      // eslint-disable-next-line jest/no-conditional-in-test
      if (data === JSON.stringify(mockNetwork)) {
        throw new Error('MOCK FAIL TO PARSE STRING');
      }

      return realParse(data);
    });

    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    const result = await getAllRemoteNetworks({
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockGetAllAPI.isDone()).toBe(true);

    expect(result).toHaveLength(0);

    JSON.parse = realParse;
  });
});

describe('network-syncing/services - upsertRemoteNetwork()', () => {
  const arrangeMocks = () => {
    const mockNetwork = createMockRemoteNetworkConfiguration({
      chainId: '0x1337',
    });

    return {
      storageOps: storageOpts,
      mockNetwork,
      mockUpsertAPI: mockEndpointUpsertUserStorage(
        `${USER_STORAGE_FEATURE_NAMES.networks}.0x1337`,
      ),
    };
  };

  it('should call upsert storage API with mock network', async () => {
    const { mockNetwork, mockUpsertAPI } = arrangeMocks();

    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    await upsertRemoteNetwork(mockNetwork, {
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockUpsertAPI.isDone()).toBe(true);
  });
});

describe('network-syncing/services - batchUpsertRemoteNetworks()', () => {
  const arrangeMocks = () => {
    const mockNetworks = [
      createMockRemoteNetworkConfiguration({ chainId: '0x1337' }),
      createMockRemoteNetworkConfiguration({ chainId: '0x1338' }),
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

    await batchUpsertRemoteNetworks(mockNetworks, {
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockBatchUpsertAPI.isDone()).toBe(true);
  });
});
