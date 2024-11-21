import log from 'loglevel';

import { MOCK_STORAGE_KEY } from '../__fixtures__';
import {
  createCustomUserStorageMessenger,
  mockUserStorageMessenger,
} from '../__fixtures__/mockMessenger';
import { waitFor } from '../__fixtures__/test-utils';
import type { UserStorageBaseOptions } from '../services';
import {
  createMockNetworkConfiguration,
  createMockRemoteNetworkConfiguration,
} from './__fixtures__/mockNetwork';
import {
  performMainNetworkSync,
  startNetworkSyncing,
  calculateAvailableSpaceToAdd,
  getBoundedNetworksToAdd,
} from './controller-integration';
import * as ControllerIntegrationModule from './controller-integration';
import * as ServicesModule from './services';
import * as SyncAllModule from './sync-all';
import * as SyncMutationsModule from './sync-mutations';

jest.mock('loglevel', () => {
  const actual = jest.requireActual('loglevel');
  return {
    ...actual,
    default: {
      ...actual.default,
      warn: jest.fn(),
    },
    // Mocking an ESModule.
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
  };
});
const warnMock = jest.mocked(log.warn);

const storageOpts: UserStorageBaseOptions = {
  bearerToken: 'MOCK_TOKEN',
  storageKey: MOCK_STORAGE_KEY,
};

describe('network-syncing/controller-integration - calculateAvailableSpaceToAdd()', () => {
  it('returns available space to add', () => {
    expect(calculateAvailableSpaceToAdd(5, 10)).toBe(5);
    expect(calculateAvailableSpaceToAdd(9, 10)).toBe(1);
  });
  it('returns 0 if there is no available space to add', () => {
    expect(calculateAvailableSpaceToAdd(5, 5)).toBe(0);
    expect(calculateAvailableSpaceToAdd(10, 5)).toBe(0);
  });
});

describe('network-syncing/controller-integration - getBoundedNetworksToAdd()', () => {
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

describe('network-syncing/controller-integration - startNetworkSyncing()', () => {
  it(`should successfully sync when NetworkController:networkRemoved is emitted`, async () => {
    const { baseMessenger, props, deleteNetworkMock } = arrangeMocks();
    startNetworkSyncing(props);
    baseMessenger.publish(
      'NetworkController:networkRemoved',
      createMockNetworkConfiguration(),
    );

    await waitFor(() => {
      expect(props.getStorageConfig).toHaveBeenCalled();
      expect(deleteNetworkMock).toHaveBeenCalled();
    });
  });

  it('should silently fail is unable to authenticate or get storage key', async () => {
    const { baseMessenger, props, deleteNetworkMock } = arrangeMocks();
    props.getStorageConfig.mockRejectedValue(new Error('Mock Error'));
    startNetworkSyncing(props);
    baseMessenger.publish(
      'NetworkController:networkRemoved',
      createMockNetworkConfiguration(),
    );

    await waitFor(() => {
      expect(props.getStorageConfig).toHaveBeenCalled();
      expect(deleteNetworkMock).not.toHaveBeenCalled();
    });
  });

  it('should silently fail if unable to get storage config', async () => {
    const { baseMessenger, props, deleteNetworkMock } = arrangeMocks();
    props.getStorageConfig.mockResolvedValue(null);
    startNetworkSyncing(props);
    baseMessenger.publish(
      'NetworkController:networkRemoved',
      createMockNetworkConfiguration(),
    );

    await waitFor(() => {
      expect(props.getStorageConfig).toHaveBeenCalled();
      expect(deleteNetworkMock).not.toHaveBeenCalled();
    });
  });

  it(`should emit a warning if controller messenger is missing the NetworkController:networkRemoved event`, async () => {
    // arrange without setting event permissions
    const { props } = arrangeMocks();
    const { messenger } = mockUserStorageMessenger(
      createCustomUserStorageMessenger({ overrideEvents: [] }),
    );

    await waitFor(() => {
      startNetworkSyncing({ ...props, messenger });
      expect(warnMock).toHaveBeenCalled();
    });
  });

  it('should not remove networks if main sync is in progress', async () => {
    const { baseMessenger, props, deleteNetworkMock } = arrangeMocks();

    // TODO - replace with jest.replaceProperty once we upgrade jest.
    Object.defineProperty(
      ControllerIntegrationModule,
      'isMainNetworkSyncInProgress',
      { value: true },
    );

    startNetworkSyncing(props);

    baseMessenger.publish(
      'NetworkController:networkRemoved',
      createMockNetworkConfiguration(),
    );

    expect(props.getStorageConfig).not.toHaveBeenCalled();
    expect(deleteNetworkMock).not.toHaveBeenCalled();

    // Reset this property
    Object.defineProperty(
      ControllerIntegrationModule,
      'isMainNetworkSyncInProgress',
      { value: false },
    );
  });

  it('should not remove networks if the mutation sync is blocked (e.g. main sync has not happened before)', async () => {
    const { props, baseMessenger, deleteNetworkMock } = arrangeMocks();
    const mockIsBlocked = jest.fn(() => true);
    startNetworkSyncing({ ...props, isMutationSyncBlocked: mockIsBlocked });

    baseMessenger.publish(
      'NetworkController:networkRemoved',
      createMockNetworkConfiguration(),
    );

    expect(mockIsBlocked).toHaveBeenCalled();
    expect(props.getStorageConfig).not.toHaveBeenCalled();
    expect(deleteNetworkMock).not.toHaveBeenCalled();
  });

  /**
   * Test Utility - arrange mocks and parameters
   * @returns the mocks and parameters used when testing `startNetworkSyncing()`
   */
  function arrangeMocks() {
    const messengerMocks = mockUserStorageMessenger();
    const getStorageConfigMock = jest.fn().mockResolvedValue(storageOpts);
    const deleteNetworkMock = jest
      .spyOn(SyncMutationsModule, 'deleteNetwork')
      .mockResolvedValue();

    return {
      props: {
        getStorageConfig: getStorageConfigMock,
        messenger: messengerMocks.messenger,
        isMutationSyncBlocked: () => false,
      },
      deleteNetworkMock,
      baseMessenger: messengerMocks.baseMessenger,
    };
  }
});

describe('network-syncing/controller-integration - performMainSync()', () => {
  it('should do nothing if unable to get storage config', async () => {
    const { getStorageConfig, messenger, mockCalls } = arrangeMocks();
    getStorageConfig.mockResolvedValue(null);

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(getStorageConfig).toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerGetState).not.toHaveBeenCalled();
  });

  it('should do nothing if unable to calculate networks to update', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue(undefined);

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should update remote networks if there are local networks to add', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [createMockRemoteNetworkConfiguration()],
      missingLocalNetworks: [],
      localNetworksToUpdate: [],
      localNetworksToRemove: [],
    });

    await performMainNetworkSync({
      messenger,
      getStorageConfig,
    });

    expect(mockServices.mockBatchUpdateNetworks).toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should add missing local networks', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [],
      missingLocalNetworks: [createMockNetworkConfiguration()],
      localNetworksToUpdate: [],
      localNetworksToRemove: [],
    });

    const mockAddCallback = jest.fn();
    await performMainNetworkSync({
      messenger,
      getStorageConfig,
      onNetworkAdded: mockAddCallback,
    });

    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).toHaveBeenCalled();
    expect(mockAddCallback).toHaveBeenCalledTimes(1);
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should not add missing local networks if there is no available space', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [],
      missingLocalNetworks: [createMockNetworkConfiguration()],
      localNetworksToUpdate: [],
      localNetworksToRemove: [],
    });

    const mockAddCallback = jest.fn();
    await performMainNetworkSync({
      messenger,
      getStorageConfig,
      onNetworkAdded: mockAddCallback,
      maxNetworksToAdd: 0, // mocking that there is no available space
    });

    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockAddCallback).not.toHaveBeenCalled();
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should update local networks', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [],
      missingLocalNetworks: [],
      localNetworksToUpdate: [createMockNetworkConfiguration()],
      localNetworksToRemove: [],
    });

    const mockUpdateCallback = jest.fn();
    await performMainNetworkSync({
      messenger,
      getStorageConfig,
      onNetworkUpdated: mockUpdateCallback,
    });

    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).toHaveBeenCalled();
    expect(mockUpdateCallback).toHaveBeenCalledTimes(1);
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should remove local networks', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [],
      missingLocalNetworks: [],
      localNetworksToUpdate: [],
      localNetworksToRemove: [createMockNetworkConfiguration()],
    });

    const mockRemoveCallback = jest.fn();
    await performMainNetworkSync({
      messenger,
      getStorageConfig,
      onNetworkRemoved: mockRemoveCallback,
    });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).toHaveBeenCalled();
    expect(mockRemoveCallback).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple networks to update', async () => {
    const { messenger, getStorageConfig, mockSync, mockServices, mockCalls } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [
        createMockRemoteNetworkConfiguration(),
        createMockRemoteNetworkConfiguration(),
      ],
      missingLocalNetworks: [
        createMockNetworkConfiguration(),
        createMockNetworkConfiguration(),
      ],
      localNetworksToUpdate: [
        createMockNetworkConfiguration(),
        createMockNetworkConfiguration(),
      ],
      localNetworksToRemove: [
        createMockNetworkConfiguration(),
        createMockNetworkConfiguration(),
      ],
    });

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(mockServices.mockBatchUpdateNetworks).toHaveBeenCalledTimes(1);
    expect(mockCalls.mockNetworkControllerAddNetwork).toHaveBeenCalledTimes(2);
    expect(
      mockCalls.mockNetworkControllerDangerouslySetNetworkConfiguration,
    ).toHaveBeenCalledTimes(2);
    expect(mockCalls.mockNetworkControllerRemoveNetwork).toHaveBeenCalledTimes(
      2,
    );
  });

  /**
   * Jest Mock Utility - create suite of mocks for tests
   * @returns mocks for tests
   */
  function arrangeMocks() {
    const messengerMocks = mockUserStorageMessenger();
    const getStorageConfigMock = jest
      .fn<Promise<UserStorageBaseOptions | null>, []>()
      .mockResolvedValue(storageOpts);

    return {
      baseMessenger: messengerMocks.baseMessenger,
      messenger: messengerMocks.messenger,
      getStorageConfig: getStorageConfigMock,
      mockCalls: {
        mockNetworkControllerGetState:
          messengerMocks.mockNetworkControllerGetState,
        mockNetworkControllerAddNetwork:
          messengerMocks.mockNetworkControllerAddNetwork,
        mockNetworkControllerRemoveNetwork:
          messengerMocks.mockNetworkControllerRemoveNetwork,
        mockNetworkControllerDangerouslySetNetworkConfiguration:
          messengerMocks.mockNetworkControllerDangerouslySetNetworkConfiguration,
      },
      mockServices: {
        mockGetAllRemoveNetworks: jest
          .spyOn(ServicesModule, 'getAllRemoteNetworks')
          .mockResolvedValue([]),
        mockBatchUpdateNetworks: jest
          .spyOn(ServicesModule, 'batchUpsertRemoteNetworks')
          .mockResolvedValue(),
      },
      mockSync: {
        findNetworksToUpdate: jest
          .spyOn(SyncAllModule, 'findNetworksToUpdate')
          .mockReturnValue(undefined),
      },
    };
  }
});
