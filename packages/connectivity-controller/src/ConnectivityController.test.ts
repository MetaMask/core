import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { ConnectivityControllerMessenger } from './ConnectivityController';
import {
  ConnectivityController,
  controllerName,
} from './ConnectivityController';
import { ConnectivityStatus } from './types';
import type { ConnectivityService } from './types';

/**
 * A test implementation of ConnectivityService.
 * Allows manual control of connectivity status via setStatus.
 */
class TestConnectivityService implements ConnectivityService {
  #status: ConnectivityStatus;

  #onConnectivityChangeCallbacks: ((status: ConnectivityStatus) => void)[] = [];

  constructor(initialStatus: ConnectivityStatus = ConnectivityStatus.Online) {
    this.#status = initialStatus;
  }

  getStatus(): ConnectivityStatus {
    return this.#status;
  }

  onConnectivityChange(callback: (status: ConnectivityStatus) => void): void {
    this.#onConnectivityChangeCallbacks.push(callback);
  }

  setStatus(status: ConnectivityStatus): void {
    this.#status = status;
    this.#onConnectivityChangeCallbacks.forEach((callback) => callback(status));
  }

  destroy(): void {
    this.#onConnectivityChangeCallbacks = [];
  }
}

describe('ConnectivityController', () => {
  describe('constructor', () => {
    it('uses service initial state when online', async () => {
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Online),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Online,
          );
          expect(mockService.getStatus).toHaveBeenCalled();
        },
      );
    });

    it('uses service initial state when offline', async () => {
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Offline),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Offline,
          );
        },
      );
    });

    it('subscribes to service connectivity changes', async () => {
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Online),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        () => {
          expect(mockService.onConnectivityChange).toHaveBeenCalledWith(
            expect.any(Function),
          );
        },
      );
    });

    it('has correct name property', async () => {
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Online),
        onConnectivityChange: jest.fn(),
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controller }) => {
          expect(controller.name).toBe(controllerName);
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

  describe('service callbacks', () => {
    it('updates state when service reports offline', async () => {
      const mockOnConnectivityChange = jest.fn();
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Online),
        onConnectivityChange: mockOnConnectivityChange,
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Online,
          );

          // Get the callback that was passed to onConnectivityChange
          const capturedCallback = mockOnConnectivityChange.mock
            .calls[0]?.[0] as
            | ((status: ConnectivityStatus) => void)
            | undefined;
          expect(capturedCallback).toBeDefined();

          // Simulate service reporting offline
          capturedCallback?.(ConnectivityStatus.Offline);

          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Offline,
          );
        },
      );
    });

    it('updates state when service reports online', async () => {
      const mockOnConnectivityChange = jest.fn();
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Offline),
        onConnectivityChange: mockOnConnectivityChange,
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Offline,
          );

          // Get the callback that was passed to onConnectivityChange
          const capturedCallback = mockOnConnectivityChange.mock
            .calls[0]?.[0] as
            | ((status: ConnectivityStatus) => void)
            | undefined;
          expect(capturedCallback).toBeDefined();

          // Simulate service reporting online
          capturedCallback?.(ConnectivityStatus.Online);

          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Online,
          );
        },
      );
    });

    it('emits stateChange event when status changes', async () => {
      const mockOnConnectivityChange = jest.fn();
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Online),
        onConnectivityChange: mockOnConnectivityChange,
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controllerMessenger }) => {
          const eventHandler = jest.fn();
          controllerMessenger.subscribe(
            `${controllerName}:stateChange`,
            eventHandler,
          );

          // Get the callback that was passed to onConnectivityChange
          const capturedCallback = mockOnConnectivityChange.mock
            .calls[0]?.[0] as
            | ((status: ConnectivityStatus) => void)
            | undefined;
          expect(capturedCallback).toBeDefined();

          capturedCallback?.(ConnectivityStatus.Offline);

          expect(eventHandler).toHaveBeenCalledWith(
            { connectivityStatus: ConnectivityStatus.Offline },
            expect.any(Array),
          );
        },
      );
    });

    it('does not emit event when status does not change', async () => {
      const mockOnConnectivityChange = jest.fn();
      const mockService: ConnectivityService = {
        getStatus: jest.fn().mockReturnValue(ConnectivityStatus.Online),
        onConnectivityChange: mockOnConnectivityChange,
        destroy: jest.fn(),
      };

      await withController(
        { options: { connectivityService: mockService } },
        ({ controllerMessenger }) => {
          const eventHandler = jest.fn();
          controllerMessenger.subscribe(
            `${controllerName}:stateChange`,
            eventHandler,
          );

          // Get the callback that was passed to onConnectivityChange
          const capturedCallback = mockOnConnectivityChange.mock
            .calls[0]?.[0] as
            | ((status: ConnectivityStatus) => void)
            | undefined;
          expect(capturedCallback).toBeDefined();

          // Report online when already online
          capturedCallback?.(ConnectivityStatus.Online);

          expect(eventHandler).not.toHaveBeenCalled();
        },
      );
    });
  });

  describe('with TestConnectivityService', () => {
    it('updates state when service.setStatus is called', async () => {
      const service = new TestConnectivityService();

      await withController(
        { options: { connectivityService: service } },
        ({ controller }) => {
          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Online,
          );

          service.setStatus(ConnectivityStatus.Offline);

          expect(controller.state.connectivityStatus).toBe(
            ConnectivityStatus.Offline,
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
 * (including `messenger` and `connectivityService`). The function is called
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
  const defaultService = new TestConnectivityService();
  const controller = new ConnectivityController({
    messenger: controllerMessenger,
    connectivityService: defaultService,
    ...options,
  });
  return await testFunction({ controller, rootMessenger, controllerMessenger });
}
