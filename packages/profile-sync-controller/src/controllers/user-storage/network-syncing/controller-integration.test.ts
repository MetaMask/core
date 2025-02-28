import log from 'loglevel';

import {
  createMockNetworkConfiguration,
  createMockRemoteNetworkConfiguration,
} from './__fixtures__/mockNetwork';
import {
  performMainNetworkSync,
  startNetworkSyncing,
} from './controller-integration';
import * as ControllerIntegrationModule from './controller-integration';
import * as ServicesModule from './services';
import * as SyncAllModule from './sync-all';
import * as SyncMutationsModule from './sync-mutations';
import {
  createCustomUserStorageMessenger,
  mockUserStorageMessenger,
} from '../__fixtures__/mockMessenger';
import { waitFor } from '../__fixtures__/test-utils';
import UserStorageController from '../UserStorageController';

jest.mock('loglevel', () => {
  const actual = jest.requireActual('loglevel');
  return {
    ...actual,
    default: {
      ...actual.default,
      warn: jest.fn(),
    },
    // Mocking an ESModule.

    __esModule: true,
  };
});
const warnMock = jest.mocked(log.warn);

describe('network-syncing/controller-integration - startNetworkSyncing()', () => {
  it(`should successfully sync when NetworkController:networkRemoved is emitted`, async () => {
    const { baseMessenger, props, deleteNetworkMock } = arrangeMocks();
    startNetworkSyncing(props);
    baseMessenger.publish(
      'NetworkController:networkRemoved',
      createMockNetworkConfiguration(),
    );

    await waitFor(() => {
      expect(deleteNetworkMock).toHaveBeenCalled();
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
    expect(deleteNetworkMock).not.toHaveBeenCalled();
  });

  /**
   * Test Utility - arrange mocks and parameters
   *
   * @returns the mocks and parameters used when testing `startNetworkSyncing()`
   */
  function arrangeMocks() {
    const messengerMocks = mockUserStorageMessenger();
    const deleteNetworkMock = jest
      .spyOn(SyncMutationsModule, 'deleteNetwork')
      .mockResolvedValue();

    const { messenger } = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger,
    });

    return {
      props: {
        messenger: messengerMocks.messenger,
        isMutationSyncBlocked: () => false,
        getUserStorageControllerInstance: () => controller,
      },
      deleteNetworkMock,
      baseMessenger: messengerMocks.baseMessenger,
    };
  }
});

describe('network-syncing/controller-integration - performMainSync()', () => {
  it('should do nothing if unable to calculate networks to update', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue(undefined);

    await performMainNetworkSync({
      messenger,
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should update remote networks if there are local networks to add', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
      arrangeMocks();
    mockSync.findNetworksToUpdate.mockReturnValue({
      remoteNetworksToUpdate: [createMockRemoteNetworkConfiguration()],
      missingLocalNetworks: [],
      localNetworksToUpdate: [],
      localNetworksToRemove: [],
    });

    await performMainNetworkSync({
      messenger,
      getUserStorageControllerInstance: () => controller,
    });

    expect(mockServices.mockBatchUpdateNetworks).toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should add missing local networks', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
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
      onNetworkAdded: mockAddCallback,
      getUserStorageControllerInstance: () => controller,
    });

    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).toHaveBeenCalled();
    expect(mockAddCallback).toHaveBeenCalledTimes(1);
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should not add missing local networks if there is no available space', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
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
      onNetworkAdded: mockAddCallback,
      maxNetworksToAdd: 0, // mocking that there is no available space
      getUserStorageControllerInstance: () => controller,
    });

    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockAddCallback).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should update local networks', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
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
      onNetworkUpdated: mockUpdateCallback,
      getUserStorageControllerInstance: () => controller,
    });

    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).toHaveBeenCalled();
    expect(mockUpdateCallback).toHaveBeenCalledTimes(1);
    expect(mockCalls.mockNetworkControllerRemoveNetwork).not.toHaveBeenCalled();
  });

  it('should remove local networks', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
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
      onNetworkRemoved: mockRemoveCallback,
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).toHaveBeenCalled();
    expect(mockRemoveCallback).toHaveBeenCalledTimes(1);
  });

  it('should handle multiple networks to update', async () => {
    const { messenger, mockSync, mockServices, mockCalls, controller } =
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

    await performMainNetworkSync({
      messenger,
      getUserStorageControllerInstance: () => controller,
    });
    expect(mockServices.mockBatchUpdateNetworks).toHaveBeenCalledTimes(1);
    expect(mockCalls.mockNetworkControllerAddNetwork).toHaveBeenCalledTimes(2);
    expect(mockCalls.mockNetworkControllerUpdateNetwork).toHaveBeenCalledTimes(
      2,
    );
    expect(mockCalls.mockNetworkControllerRemoveNetwork).toHaveBeenCalledTimes(
      2,
    );
  });

  /**
   * Jest Mock Utility - create suite of mocks for tests
   *
   * @returns mocks for tests
   */
  function arrangeMocks() {
    const messengerMocks = mockUserStorageMessenger();
    const controller = new UserStorageController({
      messenger: messengerMocks.messenger,
    });

    return {
      baseMessenger: messengerMocks.baseMessenger,
      messenger: messengerMocks.messenger,
      controller,
      mockCalls: {
        mockNetworkControllerGetState:
          messengerMocks.mockNetworkControllerGetState.mockReturnValue({
            networkConfigurationsByChainId: {
              '0x1337': createMockNetworkConfiguration(),
            },
            selectedNetworkClientId: '1111-1111-1111',
            networksMetadata: {},
          }),
        mockNetworkControllerAddNetwork:
          messengerMocks.mockNetworkControllerAddNetwork,
        mockNetworkControllerRemoveNetwork:
          messengerMocks.mockNetworkControllerRemoveNetwork,
        mockNetworkControllerUpdateNetwork:
          messengerMocks.mockNetworkControllerUpdateNetwork.mockResolvedValue(
            createMockNetworkConfiguration(),
          ),
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
