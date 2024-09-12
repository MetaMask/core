import type { NotNamespacedBy } from '@metamask/base-controller';
import { ControllerMessenger } from '@metamask/base-controller';
import log from 'loglevel';

import type { AllowedActions, AllowedEvents } from '..';
import { MOCK_STORAGE_KEY } from '../__fixtures__';
import { waitFor } from '../__fixtures__/test-utils';
import type { UserStorageBaseOptions } from '../services';
import { createMockNetworkConfiguration } from './__fixtures__/mockNetwork';
import { startNetworkSyncing } from './controller-integration';
import * as SyncModule from './sync';

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
  'NetworkController:networkChanged',
  'NetworkController:networkDeleted',
];

const testMatrix = [
  {
    event: 'NetworkController:networkAdded' as const,
    arrangeSyncFnMock: () =>
      jest.spyOn(SyncModule, 'addNetwork').mockResolvedValue(),
  },
  {
    event: 'NetworkController:networkChanged' as const,
    arrangeSyncFnMock: () =>
      jest.spyOn(SyncModule, 'updateNetwork').mockResolvedValue(),
  },
  {
    event: 'NetworkController:networkDeleted' as const,
    arrangeSyncFnMock: () =>
      jest.spyOn(SyncModule, 'deleteNetwork').mockResolvedValue(),
  },
];

describe.each(testMatrix)(
  'network-syncing/controller-integration - $event',
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
  },
);

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
    allowedActions: [],
    allowedEvents,
  });

  return messenger;
}
