import type { NotNamespacedBy } from '@metamask/base-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import log from 'loglevel';

import type {
  AllowedActions,
  AllowedEvents,
  UserStorageControllerMessenger,
} from '..';
import { MOCK_STORAGE_KEY } from '../__fixtures__';
import { waitFor } from '../__fixtures__/test-utils';
import type { UserStorageBaseOptions } from '../services';
import {
  createMockNetworkConfiguration,
  createMockRemoteNetworkConfiguration,
} from './__fixtures__/mockNetwork';
import {
  performMainNetworkSync,
  startNetworkSyncing,
} from './controller-integration';
import * as ServicesModule from './services';
import * as SyncAllModule from './sync-all';
import * as SyncMutationsModule from './sync-mutations';

type GetActionHandler<Type extends AllowedActions['type']> = Extract<
  AllowedActions,
  { type: Type }
>['handler'];

// Creates the correct typed call params for mocks
type CallParams = {
  [K in AllowedActions['type']]: [K, ...Parameters<GetActionHandler<K>>];
}[AllowedActions['type']];

const typedMockCallFn = <
  Type extends AllowedActions['type'],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Func extends (...args: any[]) => any = GetActionHandler<Type>,
>() => jest.fn<ReturnType<Func>, Parameters<Func>>();

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

type ExternalEvents = NotNamespacedBy<
  'UserStorageController',
  AllowedEvents['type']
>;
const getEvents = (): ExternalEvents[] => [
  'NetworkController:networkAdded',
  'NetworkController:networkUpdated',
  'NetworkController:networkRemoved',
];

const testMatrix = [
  {
    event: 'NetworkController:networkRemoved' as const,
    arrangeSyncFnMock: () =>
      jest.spyOn(SyncMutationsModule, 'deleteNetwork').mockResolvedValue(),
  },
];

describe.each(testMatrix)(
  'network-syncing/controller-integration - startNetworkSyncing() $event',
  ({ event, arrangeSyncFnMock }) => {
    it(`should successfully sync when ${event} is emitted`, async () => {
      const syncFnMock = arrangeSyncFnMock();
      const { baseMessenger, messenger, getStorageConfig } = arrangeMocks();
      startNetworkSyncing({ messenger, getStorageConfig });
      baseMessenger.publish(event, createMockNetworkConfiguration());

      await waitFor(() => {
        expect(getStorageConfig).toHaveBeenCalled();
        expect(syncFnMock).toHaveBeenCalled();
      });
    });

    it('should silently fail is unable to authenticate or get storage key', async () => {
      const syncFnMock = arrangeSyncFnMock();
      const { baseMessenger, messenger, getStorageConfig } = arrangeMocks();
      getStorageConfig.mockRejectedValue(new Error('Mock Error'));
      startNetworkSyncing({ messenger, getStorageConfig });
      baseMessenger.publish(event, createMockNetworkConfiguration());

      expect(getStorageConfig).toHaveBeenCalled();
      expect(syncFnMock).not.toHaveBeenCalled();
    });

    it(`should emit a warning if controller messenger is missing the ${event} event`, async () => {
      const { baseMessenger, getStorageConfig } = arrangeMocks();

      const eventsWithoutNetworkAdded = getEvents().filter((e) => e !== event);
      const messenger = mockUserStorageMessenger(
        baseMessenger,
        eventsWithoutNetworkAdded,
      );

      startNetworkSyncing({ messenger, getStorageConfig });
      expect(warnMock).toHaveBeenCalled();
    });

    /**
     * Test Utility - arrange mocks and parameters
     * @returns the mocks and parameters used when testing `startNetworkSyncing()`
     */
    function arrangeMocks() {
      const baseMessenger = mockBaseMessenger();
      const messenger = mockUserStorageMessenger(baseMessenger);
      const getStorageConfigMock = jest.fn().mockResolvedValue(storageOpts);

      return {
        getStorageConfig: getStorageConfigMock,
        baseMessenger,
        messenger,
      };
    }
  },
);

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
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
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

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(mockServices.mockBatchUpdateNetworks).toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
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

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
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

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).toHaveBeenCalled();
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

    await performMainNetworkSync({ messenger, getStorageConfig });
    expect(mockServices.mockBatchUpdateNetworks).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerAddNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerUpdateNetwork).not.toHaveBeenCalled();
    expect(mockCalls.mockNetworkControllerRemoveNetwork).toHaveBeenCalled();
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
    expect(mockServices.mockBatchUpdateNetworks).toHaveBeenCalledTimes(1); // this is a batch endpoint
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
   * @returns mocks for tests
   */
  function arrangeMocks() {
    const baseMessenger = mockBaseMessenger();
    const messenger = mockUserStorageMessenger(baseMessenger);
    const getStorageConfigMock = jest
      .fn<Promise<UserStorageBaseOptions | null>, []>()
      .mockResolvedValue(storageOpts);

    const mockCalls = mockMessengerCalls(messenger);

    return {
      baseMessenger,
      messenger,
      getStorageConfig: getStorageConfigMock,
      mockCalls,
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

  /**
   * Jest Mock Utility - create a mock User Storage Messenger
   * @param messenger - The messenger to mock
   * @returns messenger call mocks
   */
  function mockMessengerCalls(messenger: UserStorageControllerMessenger) {
    const mockNetworkControllerGetState =
      typedMockCallFn<'NetworkController:getState'>().mockReturnValue({
        selectedNetworkClientId: '',
        networksMetadata: {},
        networkConfigurationsByChainId: {},
      });

    const mockNetworkControllerAddNetwork =
      typedMockCallFn<'NetworkController:addNetwork'>();

    const mockNetworkControllerUpdateNetwork =
      typedMockCallFn<'NetworkController:updateNetwork'>();

    const mockNetworkControllerRemoveNetwork =
      typedMockCallFn<'NetworkController:removeNetwork'>();

    jest.spyOn(messenger, 'call').mockImplementation((...args) => {
      const typedArgs = args as unknown as CallParams;
      const [actionType] = typedArgs;

      if (actionType === 'NetworkController:getState') {
        return mockNetworkControllerGetState();
      }

      if (actionType === 'NetworkController:addNetwork') {
        const [, ...params] = typedArgs;
        return mockNetworkControllerAddNetwork(...params);
      }

      if (actionType === 'NetworkController:updateNetwork') {
        const [, ...params] = typedArgs;
        return mockNetworkControllerUpdateNetwork(...params);
      }

      if (actionType === 'NetworkController:removeNetwork') {
        const [, ...params] = typedArgs;
        return mockNetworkControllerRemoveNetwork(...params);
      }

      throw new Error(
        `MOCK_FAIL - unsupported messenger call: ${actionType as string}`,
      );
    });

    return {
      mockNetworkControllerGetState,
      mockNetworkControllerAddNetwork,
      mockNetworkControllerUpdateNetwork,
      mockNetworkControllerRemoveNetwork,
    };
  }
});

/**
 * Test Utility - creates a base messenger so we can invoke/publish events
 * @returns Base messenger for publishing events
 */
function mockBaseMessenger() {
  const baseMessenger = new ControllerMessenger<
    AllowedActions,
    AllowedEvents
  >();

  return baseMessenger;
}

/**
 * Test Utility - creates a UserStorageMessenger to simulate the messenger used inside the UserStorageController
 * @param baseMessenger - base messenger to restrict
 * @param eventsOverride - provide optional override events
 * @returns UserStorageMessenger
 */
function mockUserStorageMessenger(
  baseMessenger: ReturnType<typeof mockBaseMessenger>,
  eventsOverride?: ExternalEvents[],
) {
  const allowedEvents = eventsOverride ?? getEvents();

  const messenger = baseMessenger.getRestricted({
    name: 'UserStorageController',
    allowedActions: [
      'KeyringController:getState',
      'SnapController:handleRequest',
      'AuthenticationController:getBearerToken',
      'AuthenticationController:getSessionProfile',
      'AuthenticationController:isSignedIn',
      'AuthenticationController:performSignIn',
      'AuthenticationController:performSignOut',
      'NotificationServicesController:disableNotificationServices',
      'NotificationServicesController:selectIsNotificationServicesEnabled',
      'AccountsController:listAccounts',
      'AccountsController:updateAccountMetadata',
      'KeyringController:addNewAccount',
    ],
    allowedEvents,
  });

  return messenger;
}
