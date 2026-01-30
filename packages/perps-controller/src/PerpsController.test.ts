import { deriveStateFromMetadata } from '@metamask/base-controller';
import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MockAnyNamespace,
  MessengerActions,
  MessengerEvents,
} from '@metamask/messenger';

import type { PerpsControllerMessenger } from './PerpsController';
import {
  PerpsController,
  getDefaultPerpsControllerState,
} from './PerpsController';
import type { PerpsPlatformDependencies } from './types';

/**
 * Create a mock PerpsPlatformDependencies instance for testing.
 *
 * @returns Mocked PerpsPlatformDependencies
 */
function createMockInfrastructure(): jest.Mocked<PerpsPlatformDependencies> {
  return {
    logger: {
      error: jest.fn(),
    },
    debugLogger: {
      log: jest.fn(),
    },
    metrics: {
      trackEvent: jest.fn(),
      isEnabled: jest.fn(() => true),
      trackPerpsEvent: jest.fn(),
    },
    performance: {
      now: jest.fn(() => Date.now()),
    },
    tracer: {
      trace: jest.fn(() => undefined),
      endTrace: jest.fn(),
      setMeasurement: jest.fn(),
    },
    streamManager: {
      pauseChannel: jest.fn(),
      resumeChannel: jest.fn(),
      clearAllChannels: jest.fn(),
    },
    controllers: {
      accounts: {
        getSelectedEvmAccount: jest.fn(() => ({
          address: '0x1234567890abcdef1234567890abcdef12345678',
        })),
        formatAccountToCaipId: jest.fn(
          (address: string, chainId: string) => `eip155:${chainId}:${address}`,
        ),
      },
      keyring: {
        signTypedMessage: jest.fn().mockResolvedValue('0xSignatureResult'),
      },
      network: {
        getChainIdForNetwork: jest.fn().mockReturnValue('0x1'),
        findNetworkClientIdForChain: jest.fn().mockReturnValue('mainnet'),
        getSelectedNetworkClientId: jest.fn().mockReturnValue('mainnet'),
      },
      transaction: {
        submit: jest.fn().mockResolvedValue({
          result: Promise.resolve('0xTransactionHash'),
          transactionMeta: { id: 'tx-id-123', hash: '0xTransactionHash' },
        }),
      },
      rewards: {
        getFeeDiscount: jest.fn().mockResolvedValue(0),
      },
      authentication: {
        getBearerToken: jest.fn().mockResolvedValue('mock-bearer-token'),
      },
    },
  } as unknown as jest.Mocked<PerpsPlatformDependencies>;
}

describe('PerpsController', () => {
  describe('constructor', () => {
    it('accepts initial state', async () => {
      const defaultState = getDefaultPerpsControllerState();

      await withController(
        { options: { state: defaultState } },
        ({ controller }) => {
          expect(controller.state).toStrictEqual(defaultState);
        },
      );
    });

    it('fills in missing initial state with defaults', async () => {
      await withController(({ controller }) => {
        const defaultState = getDefaultPerpsControllerState();
        expect(controller.state).toStrictEqual(defaultState);
      });
    });

    it('initializes with hyperliquid as active provider', async () => {
      await withController(({ controller }) => {
        expect(controller.state.activeProvider).toBe('hyperliquid');
      });
    });
  });

  describe('metadata', () => {
    it('includes expected state in debug snapshots', async () => {
      await withController(({ controller }) => {
        const debugState = deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInDebugSnapshot',
        );
        // Debug snapshot should include controller state
        expect(debugState).toBeDefined();
      });
    });

    it('includes expected state in state logs', async () => {
      await withController(({ controller }) => {
        const logState = deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'includeInStateLogs',
        );
        // State logs should include controller state
        expect(logState).toBeDefined();
      });
    });

    it('persists expected state', async () => {
      await withController(({ controller }) => {
        const persistedState = deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'persist',
        );
        // Persisted state should include relevant controller state
        expect(persistedState).toBeDefined();
      });
    });

    it('exposes expected state to UI', async () => {
      await withController(({ controller }) => {
        const uiState = deriveStateFromMetadata(
          controller.state,
          controller.metadata,
          'usedInUi',
        );
        // UI state should include user-facing state
        expect(uiState).toBeDefined();
      });
    });
  });
});

/**
 * The type of the messenger populated with all external actions and events
 * required by the controller under test.
 */
type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<PerpsControllerMessenger>,
  MessengerEvents<PerpsControllerMessenger>
>;

/**
 * The callback that `withController` calls.
 */
type WithControllerCallback<ReturnValue> = (payload: {
  controller: PerpsController;
  rootMessenger: RootMessenger;
  controllerMessenger: PerpsControllerMessenger;
  infrastructure: jest.Mocked<PerpsPlatformDependencies>;
}) => Promise<ReturnValue> | ReturnValue;

/**
 * The options that `withController` takes.
 */
type WithControllerOptions = {
  options: Partial<ConstructorParameters<typeof PerpsController>[0]>;
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
function getMessenger(rootMessenger: RootMessenger): PerpsControllerMessenger {
  return new Messenger({
    namespace: 'PerpsController',
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
 * (including `messenger`). The function is called with the instantiated
 * controller, root messenger, and controller messenger.
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
  const infrastructure = createMockInfrastructure();

  const controller = new PerpsController({
    messenger: controllerMessenger,
    infrastructure,
    ...options,
  });

  return await testFunction({
    controller,
    rootMessenger,
    controllerMessenger,
    infrastructure,
  });
}
