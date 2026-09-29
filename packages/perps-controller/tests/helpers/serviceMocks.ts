/* eslint-disable */
/**
 * Shared service mocks for Perps service tests
 * Provides reusable mock implementations for ServiceContext and related types
 */

import { Messenger, MOCK_ANY_NAMESPACE } from '@metamask/messenger';
import type {
  MessengerActions,
  MessengerEvents,
  MockAnyNamespace,
} from '@metamask/messenger';
import {
  type ServiceContext,
  type PerpsControllerState,
  type InitializationState,
  type PerpsControllerMessenger,
  type PerpsPlatformDependencies,
} from '@metamask/perps-controller';

export type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
};

/**
 * Create a promise whose settlement is controlled by the test.
 *
 * @returns The promise and its resolve and reject callbacks.
 */
export const createDeferred = <T>(): Deferred<T> => {
  let resolve!: Deferred<T>['resolve'];
  let reject!: Deferred<T>['reject'];
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
};

/**
 * Create a mock EVM account (KeyringAccount)
 */
export const createMockEvmAccount = () => ({
  id: '00000000-0000-0000-0000-000000000000',
  address: '0x1234567890abcdef1234567890abcdef12345678' as `0x${string}`,
  type: 'eip155:eoa' as const,
  options: {},
  scopes: ['eip155:1'],
  methods: ['eth_signTransaction', 'eth_sign'],
  metadata: {
    name: 'Test Account',
    importTime: Date.now(),
    keyring: { type: 'HD Key Tree' },
  },
});

/**
 * Create a mock PerpsPlatformDependencies instance.
 * Returns a type-safe mock with jest.Mock functions for all methods.
 * Uses `as unknown as jest.Mocked<PerpsPlatformDependencies>` pattern
 * to ensure compatibility with both the interface contract and Jest mock APIs.
 *
 * Architecture:
 * - Observability: logger, debugLogger, metrics, performance, tracer (stateless utilities)
 * - Platform: streamManager (mobile/extension specific capabilities)
 * - Controllers: consolidated access to all external controllers
 */
export const createMockInfrastructure =
  (): jest.Mocked<PerpsPlatformDependencies> =>
    ({
      // === Observability (stateless utilities) ===
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
        addBreadcrumb: jest.fn(),
      },

      // === Platform Services ===
      streamManager: {
        pauseChannel: jest.fn(),
        resumeChannel: jest.fn(),
        clearAllChannels: jest.fn(),
      },

      // === Feature Flags (platform-specific version gating) ===
      featureFlags: {
        validateVersionGated: jest.fn().mockReturnValue(undefined),
      },

      // === Market Data Formatting ===
      marketDataFormatters: {
        formatVolume: jest.fn((v: number) => `$${v.toFixed(0)}`),
        formatPerpsFiat: jest.fn((v: number) => `$${v.toFixed(2)}`),
        formatPercentage: jest.fn((p: number) => `${p.toFixed(2)}%`),
        priceRangesUniversal: [],
      },

      // === Cache Invalidation ===
      cacheInvalidator: {
        invalidate: jest.fn(),
        invalidateAll: jest.fn(),
      },

      // === Terminal API ===
      terminalApiUrl: 'https://terminal.test-api.cx.metamask.io/v1/perpetuals',

      // === Rewards (DI — no RewardsController in Core yet) ===
      rewards: {
        getPerpsDiscountForAccount: jest.fn().mockResolvedValue(0),
      },

      // === Disk Cache (cold-start persistence) ===
      // FUNCTIONAL in-memory disk cache: durable-state code treats disk
      // absence as authoritative, so the default mock must actually
      // store — a null-only stub would silently erase obligations.
      diskCache: (() => {
        const store = new Map<string, string>();
        return {
          getItem: jest
            .fn()
            .mockImplementation(async (key: string) => store.get(key) ?? null),
          getItemSync: jest
            .fn()
            .mockImplementation((key: string) => store.get(key) ?? null),
          setItem: jest
            .fn()
            .mockImplementation(async (key: string, value: string) => {
              store.set(key, value);
            }),
          removeItem: jest.fn().mockImplementation(async (key: string) => {
            store.delete(key);
          }),
        };
      })(),
    }) as unknown as jest.Mocked<PerpsPlatformDependencies>;

/**
 * Create a mock PerpsControllerState
 */
export const createMockPerpsControllerState = (
  overrides: Partial<PerpsControllerState> = {},
): PerpsControllerState => ({
  activeProvider: 'hyperliquid',
  isTestnet: false,
  initializationState: 'initialized' as InitializationState,
  initializationError: null,
  initializationAttempts: 0,
  accountState: null,
  perpsBalances: {},
  depositInProgress: false,
  lastDepositTransactionId: null,
  lastDepositResult: null,
  withdrawInProgress: false,
  lastWithdrawResult: null,
  lastCompletedWithdrawalTimestamp: null,
  lastCompletedWithdrawalTxHashes: [],
  withdrawalRequests: [],
  withdrawalProgress: {
    progress: 0,
    lastUpdated: 0,
    activeWithdrawalId: null,
  },
  depositRequests: [],
  isEligible: true,
  isFirstTimeUser: {
    testnet: true,
    mainnet: true,
  },
  hasPlacedFirstOrder: {
    testnet: false,
    mainnet: false,
  },
  watchlistMarkets: {
    testnet: [],
    mainnet: [],
  },
  tradeConfigurations: {
    testnet: {},
    mainnet: {},
  },
  marketFilterPreferences: {
    optionId: 'volume',
    direction: 'desc',
  },
  lastError: null,
  lastUpdateTimestamp: Date.now(),
  hip3ConfigVersion: 0,
  selectedPaymentToken: null,
  cachedMarketDataByProvider: {},
  cachedUserDataByProvider: {},
  ...overrides,
});

/**
 * Create a mock ServiceContext with optional overrides
 * Note: infrastructure is no longer part of ServiceContext - it's now injected
 * into service instances via constructor.
 */
export const createMockServiceContext = (
  overrides: Partial<ServiceContext> = {},
): ServiceContext => ({
  tracingContext: {
    provider: 'hyperliquid',
    isTestnet: false,
  },
  errorContext: {
    controller: 'TestService',
    method: 'testMethod',
  },
  stateManager: {
    update: jest.fn(),
    getState: jest.fn(() => createMockPerpsControllerState()),
  },
  ...overrides,
});

/**
 * Create a mock PerpsControllerMessenger for testing inter-controller communication.
 * The messenger.call() method should be configured in each test to return appropriate values.
 *
 * Common messenger actions used:
 * - 'AccountTreeController:getAccountsFromSelectedAccountGroup' - returns array of accounts
 * - 'KeyringController:signTypedMessage' - returns signature string
 * - 'NetworkController:getState' - returns { selectedNetworkClientId: string }
 * - 'NetworkController:getNetworkClientById' - returns { configuration: { chainId: string } }
 * - 'AuthenticationController:getBearerToken' - returns bearer token string
 *
 * @param overrides - Optional partial messenger to override default behavior
 */
export const createMockMessenger = (
  overrides?: Partial<PerpsControllerMessenger>,
): jest.Mocked<PerpsControllerMessenger> => {
  const mockEvmAccount = createMockEvmAccount();
  const base = {
    call: jest.fn().mockImplementation((action: string) => {
      // Default implementations for common actions
      if (
        action === 'AccountTreeController:getAccountsFromSelectedAccountGroup'
      ) {
        return [mockEvmAccount];
      }
      if (action === 'KeyringController:getState') {
        return { isUnlocked: true };
      }
      if (action === 'KeyringController:signTypedMessage') {
        return Promise.resolve('0xSignatureResult');
      }
      if (action === 'NetworkController:getState') {
        return { selectedNetworkClientId: 'mainnet' };
      }
      if (action === 'NetworkController:getNetworkClientById') {
        return { configuration: { chainId: '0x1' } };
      }
      if (action === 'AuthenticationController:getBearerToken') {
        return Promise.resolve('mock-bearer-token');
      }
      return undefined;
    }),
    publish: jest.fn(),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(),
    registerActionHandler: jest.fn(),
    registerMethodActionHandlers: jest.fn(),
    unregisterActionHandler: jest.fn(),
    // Additional methods used by PerpsController
    registerEventHandler: jest.fn(),
    registerInitialEventPayload: jest.fn(),
    unregisterEventHandler: jest.fn(),
    clearEventSubscriptions: jest.fn(),
  };
  return {
    ...base,
    ...overrides,
  } as unknown as jest.Mocked<PerpsControllerMessenger>;
};

// The keyring type of a software (non-hardware) account.
const HD_KEYRING_TYPE = 'HD Key Tree';

type RootMessenger = Messenger<
  MockAnyNamespace,
  MessengerActions<PerpsControllerMessenger>,
  MessengerEvents<PerpsControllerMessenger>
>;

type AccountMessenger = {
  messenger: PerpsControllerMessenger;
  // The host side, to answer and delegate more of the host's actions.
  rootMessenger: RootMessenger;
  call: jest.SpyInstance;
  selectAccount: (address: `0x${string}`) => void;
  // Leave no account selected.
  deselectAccount: () => void;
};

/**
 * Create a real PerpsController messenger that delegates
 * `AccountsController:getSelectedAccount`, and the unlocked
 * `KeyringController` actions when a keyring signature is given.
 *
 * @param keyringType - Keyring type reported in the selected account metadata.
 * @param keyringSignature - Signature the keyring returns; omit for a host
 * without a KeyringController.
 * @param isUnlocked - Whether the keyring reports it is unlocked.
 * @returns The messenger, its host root messenger, a spy on its `call`, and
 * ways to switch or clear the selected account.
 */
const createAccountMessenger = (
  keyringType: string,
  keyringSignature?: string,
  isUnlocked = true,
): AccountMessenger => {
  const account = createMockEvmAccount();
  // Empty when no account is selected.
  let selectedAddress: string = account.address;
  const root: RootMessenger = new Messenger<
    MockAnyNamespace,
    MessengerActions<PerpsControllerMessenger>,
    MessengerEvents<PerpsControllerMessenger>
  >({ namespace: MOCK_ANY_NAMESPACE });
  const messenger: PerpsControllerMessenger = new Messenger({
    namespace: 'PerpsController',
    parent: root,
  });
  root.registerActionHandler('AccountsController:getSelectedAccount', () => ({
    ...account,
    address: selectedAddress,
    scopes: ['eip155:0'],
    metadata: { ...account.metadata, keyring: { type: keyringType } },
  }));
  if (keyringSignature === undefined) {
    root.delegate({
      actions: ['AccountsController:getSelectedAccount'],
      messenger,
    });
  } else {
    root.registerActionHandler('KeyringController:getState', () => ({
      isUnlocked,
      keyrings: [],
    }));
    root.registerActionHandler(
      'KeyringController:signTypedMessage',
      async () => keyringSignature,
    );
    root.registerActionHandler(
      'KeyringController:signPersonalMessage',
      async () => keyringSignature,
    );
    root.delegate({
      actions: [
        'AccountsController:getSelectedAccount',
        'KeyringController:getState',
        'KeyringController:signTypedMessage',
        'KeyringController:signPersonalMessage',
      ],
      messenger,
    });
  }
  return {
    messenger,
    rootMessenger: root,
    call: jest.spyOn(messenger, 'call'),
    selectAccount: (address): void => {
      selectedAddress = address;
    },
    deselectAccount: (): void => {
      selectedAddress = '';
    },
  };
};

/**
 * Create a real PerpsController messenger for a host without a
 * KeyringController: only `AccountsController:getSelectedAccount` is
 * delegated, so any `KeyringController:*` call throws.
 *
 * @param keyringType - Keyring type reported in the selected account metadata.
 * @returns The messenger, its host root messenger, a spy on its `call`, and
 * ways to switch or clear the selected account.
 */
export const createKeyringlessMessenger = (
  keyringType = HD_KEYRING_TYPE,
): AccountMessenger => createAccountMessenger(keyringType);

/**
 * Create a real PerpsController messenger for a host with a KeyringController
 * that returns `signature` for typed data and personal messages.
 *
 * @param signature - Signature the keyring returns.
 * @param isUnlocked - Whether the keyring reports it is unlocked.
 * @returns The messenger, its host root messenger, a spy on its `call`, and
 * ways to switch or clear the selected account.
 */
export const createKeyringMessenger = (
  signature: string,
  isUnlocked = true,
): AccountMessenger =>
  createAccountMessenger(HD_KEYRING_TYPE, signature, isUnlocked);

/**
 * Names of the `KeyringController:*` actions a messenger spy saw.
 *
 * @param call - Spy on a messenger's `call`.
 * @returns The KeyringController action names, in call order.
 */
export const keyringCalls = (call: jest.SpyInstance): string[] =>
  call.mock.calls
    .map(([action]: [unknown]) => String(action))
    .filter((action) => action.startsWith('KeyringController:'));
