import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { ConnectivityControllerMessenger } from './ConnectivityController';
import { ConnectivityController } from './ConnectivityController';
import { CONNECTIVITY_STATUSES } from './types';
import type { ConnectivityAdapter, ConnectivityStatus } from './types';

describe('ConnectivityController', () => {
  describe('constructor', () => {
    it('uses service initial state when online', async () => {
      const mockAdapter: ConnectivityAdapter = {
        getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Online),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityAdapter: mockAdapter } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Online,
          );
          expect(mockAdapter.getStatus).toHaveBeenCalled();
        },
      );
    });

    it('uses service initial state when offline', async () => {
      const mockAdapter: ConnectivityAdapter = {
        getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Offline),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityAdapter: mockAdapter } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Offline,
          );
        },
      );
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInDebugSnapshot',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "connectivityStatus": "online",
          }
        `);
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'includeInStateLogs',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "connectivityStatus": "online",
          }
        `);
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'persist',
          ),
        ).toMatchInlineSnapshot(`Object {}`);
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        expect(
          deriveStateFromMetadata(
            controller.state,
            controller.metadata,
            'usedInUi',
          ),
        ).toMatchInlineSnapshot(`
          Object {
            "connectivityStatus": "online",
          }
        `);
      });
    });
  });

  describe('when connectivity changes via the adapter', () => {
    it('updates state when service reports offline', async () => {
      let onConnectivityChangeCallback: (
        connectivityStatus: ConnectivityStatus,
      ) => void;
      const mockAdapter: ConnectivityAdapter = {
        getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Online),
        onConnectivityChange(
          callback: (connectivityStatus: ConnectivityStatus) => void,
        ) {
          onConnectivityChangeCallback = callback;
        },
        destroy: jest.fn(),
      };
      await withController(
        { options: { connectivityAdapter: mockAdapter } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Online,
          );
          // Simulate service reporting offline
          onConnectivityChangeCallback(CONNECTIVITY_STATUSES.Offline);
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Offline,
          );
        },
      );
    });

    it('updates state when service reports online', async () => {
      let onConnectivityChangeCallback: (
        connectivityStatus: ConnectivityStatus,
      ) => void;
      const mockAdapter: ConnectivityAdapter = {
        getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Offline),
        onConnectivityChange(
          callback: (connectivityStatus: ConnectivityStatus) => void,
        ) {
          onConnectivityChangeCallback = callback;
        },
        destroy: jest.fn(),
      };
      await withController(
        { options: { connectivityAdapter: mockAdapter } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Offline,
          );
          // Simulate service reporting online
          onConnectivityChangeCallback(CONNECTIVITY_STATUSES.Online);
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Online,
          );
        },
      );
    });
  });

  describe('setConnectivityStatus', () => {
    it('updates state when called directly', async () => {
      await withController(({ controller }) => {
        expect(controller.state.connectivityStatus).toBe(
          CONNECTIVITY_STATUSES.Online,
        );

        controller.setConnectivityStatus(CONNECTIVITY_STATUSES.Offline);

        expect(controller.state.connectivityStatus).toBe(
          CONNECTIVITY_STATUSES.Offline,
        );
      });
    });

    it('updates state when called via messenger action', async () => {
      await withController(({ rootMessenger, controller }) => {
        expect(controller.state.connectivityStatus).toBe(
          CONNECTIVITY_STATUSES.Online,
        );

        rootMessenger.call(
          'ConnectivityController:setConnectivityStatus',
          CONNECTIVITY_STATUSES.Offline,
        );

        expect(controller.state.connectivityStatus).toBe(
          CONNECTIVITY_STATUSES.Offline,
        );
      });
    });

    it('can change status from offline to online via direct call', async () => {
      const mockAdapter: ConnectivityAdapter = {
        getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Offline),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityAdapter: mockAdapter } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Offline,
          );

          controller.setConnectivityStatus(CONNECTIVITY_STATUSES.Online);

          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Online,
          );
        },
      );
    });

    it('can change status from offline to online via messenger action', async () => {
      const mockAdapter: ConnectivityAdapter = {
        getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Offline),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityAdapter: mockAdapter } },
        ({ rootMessenger, controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Offline,
          );

          rootMessenger.call(
            'ConnectivityController:setConnectivityStatus',
            CONNECTIVITY_STATUSES.Online,
          );

          expect(controller.state.connectivityStatus).toBe(
            CONNECTIVITY_STATUSES.Online,
          );
        },
      );
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<ConnectivityControllerMessenger>,
  MessengerEvents<ConnectivityControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: ConnectivityController;
  rootMessenger: RootMessenger;
  controllerMessenger: ConnectivityControllerMessenger;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof ConnectivityController>[0]>;
};

/**
 * Constructs the messenger populated with all external actions and events
 * required by the controller under test.
 *
 * @returns The root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({ namespace: MOCK_ANY_NAMESPACE });
}

/**
 * Constructs the messenger for the controller under test.
 *
 * @param rootMessenger - The root messenger, with all external actions and
 * events required by the controller's messenger.
 * @returns The controller-specific messenger.
 */
function getMessenger(
  rootMessenger: RootMessenger,
): ConnectivityControllerMessenger {
  return new Messenger({
    namespace: 'ConnectivityController',
    parent: rootMessenger,
  });
}

/**
 * Wrap tests for the controller under test by ensuring that the controller is
 * created ahead of time and then safely destroyed afterward as needed.
 *
 * @param args - Either a function, or an options bag + a function. The options
 * bag contains arguments for the controller constructor. All constructor
 * arguments are optional and will be filled in with defaults in as needed
 * (including `messenger` and `connectivityAdapter`). The function is called
 * with the instantiated controller, root messenger, and controller messenger.
 * @returns The same return value as the given function.
 */
async function withController<ReturnValue>(
  ...args:
    | [WithControllerCallback<ReturnValue>]
    | [WithControllerOptions, WithControllerCallback<ReturnValue>]
): Promise<ReturnValue> {
  const [{ options = {} }, testFunction] =
    args.length === 2 ? args : [{}, args[0]];
  const rootMessenger = getRootMessenger();
  const controllerMessenger = getMessenger(rootMessenger);
  const defaultAdapter: ConnectivityAdapter = {
    getStatus: jest.fn().mockReturnValue(CONNECTIVITY_STATUSES.Online),
    onConnectivityChange: jest.fn(),
    destroy: jest.fn(),
  };
  const controller = new ConnectivityController({
    messenger: controllerMessenger,
    connectivityAdapter: defaultAdapter,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, controllerMessenger });
}
