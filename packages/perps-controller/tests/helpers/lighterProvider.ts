import { webcrypto } from 'crypto';
import { afterEach, vi } from 'vitest';
import type { Mock, MockedClass, MockedFunction } from 'vitest';

import {
  InitializationState,
  PerpsController,
} from '../../src/PerpsController.js';
import { LighterProvider } from '../../src/providers/LighterProvider.js';
import {
  LighterApiError,
  LighterClientService,
} from '../../src/services/LighterClientService.js';
import { LighterWalletService } from '../../src/services/LighterWalletService.js';
import type {
  PerpsActiveProviderMode,
  PerpsProvider,
} from '../../src/types/index.js';
import type {
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
  LighterWebSocketCtor,
  LighterWebSocketLike,
} from '../../src/types/lighter-types.js';
import {
  createKeyringlessMessenger,
  createMockInfrastructure,
} from './serviceMocks.js';

export const MockedClientService = LighterClientService as MockedClass<
  typeof LighterClientService
>;
export const MockedWalletService = LighterWalletService as MockedClass<
  typeof LighterWalletService
>;

export type MockInfrastructure = ReturnType<typeof createMockInfrastructure>;

/**
 * Get the typed error logger mock from test infrastructure.
 *
 * @param dependencies - Mock platform dependencies.
 * @returns The logger error mock.
 */
export const getLoggerErrorMock = (
  dependencies: MockInfrastructure,
): MockedFunction<MockInfrastructure['logger']['error']> =>
  // The infrastructure logger methods are deliberately Jest mocks.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  dependencies.logger.error as MockedFunction<
    MockInfrastructure['logger']['error']
  >;

export const BTC_MARKET = {
  symbol: 'BTC',
  marketId: 1,
  marketType: 'perp',
  status: 'active',
  takerFee: '0.0000',
  makerFee: '0.0000',
  minBaseAmount: '0.00020',
  minQuoteAmount: '10.000000',
  supportedSizeDecimals: 5,
  supportedPriceDecimals: 1,
  supportedQuoteDecimals: 6,
};

/**
 * Resolve the key holding a journal's PAYLOAD: code-written journals
 * store a pointer at the base key and the payload under an
 * operation-scoped key; seeded inline journals live at the base key.
 *
 * @param disk - Test disk map.
 * @param baseKey - The base journal key.
 * @returns The key whose value contains the journal payload.
 */
/**
 * Round-21 acknowledgment protocol: read-only listing + selective
 * per-outcome acknowledgment. Helper acks every pending outcome the way
 * a caller would after refreshing venue state.
 *
 * @param provider - The provider under test.
 * @returns The outcomes that were acknowledged.
 */
export const acknowledgeAllRecovered = async (
  provider: LighterProvider,
): Promise<{ recoveryId: string; kind: number; intent: string }[]> => {
  const outcomes = await provider.getRecoveredDispatches();
  for (const outcome of outcomes) {
    await provider.acknowledgeRecoveredDispatch(outcome.recoveryId);
  }
  return outcomes;
};

/**
 * The WebCrypto object under test. Install Node's implementation as the
 * global the provider reads when the Jest environment does not expose it;
 * the spies below must intercept the same object the code under test uses.
 *
 * @returns The WebCrypto object the provider draws randomness from.
 */
export const ensureWebCrypto = (): typeof webcrypto => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  return webcrypto;
};

export const resolveJournalPayloadKey = (
  disk: Map<string, string>,
  baseKey: string,
): string => {
  try {
    const parsed = JSON.parse(disk.get(baseKey) ?? '') as {
      pointerVersion?: number;
      operationId?: string;
    };
    if (parsed.pointerVersion === 1 && typeof parsed.operationId === 'string') {
      return `${baseKey.replace(
        'lighterTpslJournal:',
        'lighterTpslJournalOp:',
      )}:${parsed.operationId}`;
    }
  } catch {
    // Inline journal.
  }
  return baseKey;
};

export const ACCOUNT = {
  code: 0,
  accountType: 0,
  index: 28,
  l1Address: '0x8D7f03FdE1A626223364E592740a233b72395235',
  cancelAllTime: 0,
  totalOrderCount: 0,
  pendingOrderCount: 0,
  status: 1,
  collateral: '10000',
  availableBalance: '9000',
  positions: [
    {
      marketId: 1,
      symbol: 'BTC',
      initialMarginFraction: '20',
      openOrderCount: 0,
      sign: 1,
      position: '0.1',
      avgEntryPrice: '100000',
      positionValue: '10000',
      unrealizedPnl: '500',
      realizedPnl: '0',
      liquidationPrice: '80000',
    },
  ],
};

export type MockBridgeBundle = {
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
  fireReset: () => void;
  resetListenerCount: () => number;
  resetUnsubscribe: Mock;
};

/**
 * WASM bridge double: replays canned results per function name.
 *
 * @returns Bridge plus the recorded calls.
 */
export function createMockBridge(): MockBridgeBundle {
  const calls: LighterWasmCall[] = [];
  const resetListeners = new Set<() => void>();
  const resetUnsubscribe = vi.fn();
  let signSequence = 0;
  const bridge: LighterSignerBridge = {
    createClient: vi.fn<LighterSignerBridge['createClient']>(async (params) =>
      bridge.execute({
        function: '_createClient',
        params: [
          params.chainId,
          params.accountIndex,
          params.nonce,
          params.apiKeyIndex,
        ],
      }),
    ),
    onReset: (listener: () => void) => {
      resetListeners.add(listener);
      return () => {
        resetUnsubscribe();
        resetListeners.delete(listener);
      };
    },
    execute: vi.fn(
      async <Operation extends LighterSignerOperation>(
        call: LighterWasmCall<Operation>,
      ): Promise<LighterSignerResult<Operation>> => {
        calls.push(call);
        switch (call.function) {
          case '_createClient':
            return {
              success: true,
              pk: '9c'.repeat(40),
              pubKeySuccess: true,
              body: 'Register Lighter Account\n\npubkey: 0x9c...\nOnly sign this message for a trusted client!',
            } as LighterSignerResult<Operation>;
          case '_signChangePubKey': {
            signSequence += 1;
            return {
              txInfo: JSON.stringify({
                changePubKey: true,
                Nonce: Number((call.params as (string | number)[])[2]),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: `dddd${String(signSequence).padStart(12, '0')}`,
            } as LighterSignerResult<Operation>;
          }
          case '_signCreateOrder': {
            signSequence += 1;
            // FAITHFUL to the pinned WASM contract (web-wasm
            // light_client.go): the signing RESULT carries {txHash, txInfo}
            // and txInfo is the marshaled wire payload — it contains Nonce
            // and ExpiredAt but NEVER the hash.
            const createHash = `aaaa${String(signSequence).padStart(12, '0')}`;
            return {
              txInfo: JSON.stringify({
                createOrder: true,
                ClientOrderIndex: Number(call.params[2]),
                OrderExpiry:
                  Number(call.params[10]) === -1
                    ? Date.now() + 28 * 24 * 60 * 60 * 1000
                    : Number(call.params[10]),
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: createHash,
            } as LighterSignerResult<Operation>;
          }
          case '_signModifyOrder': {
            signSequence += 1;
            return {
              txInfo: JSON.stringify({
                AccountIndex: call.params[0],
                ApiKeyIndex: 7,
                MarketIndex: call.params[1],
                Index: String(call.params[2]),
                BaseAmount: call.params[3],
                Price: call.params[4],
                TriggerPrice: call.params[5],
                Nonce: call.params[6],
                ExpiredAt: Date.now() + 599_000,
                Sig: `${'A'.repeat(107)}=`,
                L2TxAttributes: null,
              }).replace(/"Index":"(\d+)"/u, '"Index":$1'),
              txHash: `dddd${String(signSequence).padStart(12, '0')}`,
            } as LighterSignerResult<Operation>;
          }
          case '_signCancelOrder': {
            signSequence += 1;
            const cancelHash = `bbbb${String(signSequence).padStart(12, '0')}`;
            return {
              txInfo: JSON.stringify({
                cancelOrder: true,
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: cancelHash,
            } as LighterSignerResult<Operation>;
          }
          case '_signUpdateLeverage': {
            signSequence += 1;
            return {
              txInfo: JSON.stringify({
                updateLeverage: true,
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: `eeee${String(signSequence).padStart(12, '0')}`,
            } as LighterSignerResult<Operation>;
          }
          case '_signCreateGroupedOrders': {
            signSequence += 1;
            const groupedHash = `cccc${String(signSequence).padStart(12, '0')}`;
            const groupedDefaultExpiry = Date.now() + 28 * 24 * 60 * 60 * 1000;
            return {
              txInfo: JSON.stringify({
                createGroupedOrders: true,
                Orders: Array.from(
                  { length: Number(call.params[2]) },
                  (_, index) => ({
                    ClientOrderIndex: Number(call.params[4 + index * 10]),
                    OrderExpiry:
                      Number(call.params[12 + index * 10]) === -1
                        ? groupedDefaultExpiry
                        : Number(call.params[12 + index * 10]),
                  }),
                ),
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: groupedHash,
            } as LighterSignerResult<Operation>;
          }
          case '_signUpdateMargin': {
            signSequence += 1;
            return {
              txInfo: JSON.stringify({
                updateMargin: true,
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: `ffff${String(signSequence).padStart(12, '0')}`,
            } as LighterSignerResult<Operation>;
          }
          case '_signWithdraw': {
            signSequence += 1;
            return {
              txInfo: JSON.stringify({
                withdraw: true,
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: `abab${String(signSequence).padStart(12, '0')}`,
            } as LighterSignerResult<Operation>;
          }
          case '_createAuthToken':
            return {
              token: 'auth-token',
              deadline: Math.floor(Date.now() / 1000) + 600,
            } as LighterSignerResult<Operation>;
          default:
            throw new Error(`Unexpected WASM call: ${call.function}`);
        }
      },
    ),
  };
  return {
    bridge,
    calls,
    fireReset: () => resetListeners.forEach((listener) => listener()),
    resetListenerCount: () => resetListeners.size,
    resetUnsubscribe,
  };
}

export type MockClientInstance = {
  getEditableOrders: Mock;
  network: string;
  getCandles: Mock;
  getOrderBookOrders: Mock;
  getOrderBooks: Mock;
  getOrderBookDetails: Mock;
  getAccountsByL1Address: Mock;
  getAccountByIndex: Mock;
  getApiKeys: Mock;
  getNextNonce: Mock;
  getActiveOrders: Mock;
  getOrdersByClientIds: Mock;
  getInactiveOrders: Mock;
  getTx: Mock;
  getDepositHistory: Mock;
  getWithdrawHistory: Mock;
  getTransferHistory: Mock;
  getPositionFundings: Mock;
  getTrades: Mock;
  sendTx: Mock;
};

export type BuiltProvider = {
  provider: LighterProvider;
  clientInstance: MockClientInstance;
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
  getUserAddressMock: Mock;
  fireReset: () => void;
  resetListenerCount: () => number;
  resetUnsubscribe: Mock;
};

/**
 * Build a provider wired to mocked services and bridge.
 *
 * @param options - Overrides.
 * @param options.withBridge - Attach the mock WASM bridge.
 * @param options.registeredKey - Pubkey the mocked apikeys endpoint reports.
 * @param options.webSocketCtor - Transport override (null = REST polling).
 * @param options.isTestnet - Network the provider targets (defaults to testnet).
 * @param options.configuredAccountIndex - Account index override; null forces resolution via accountsByL1Address.
 * @param options.platformDependencies - Shared platform deps (e.g. durable diskCache across simulated lifetimes).
 * @param options.apiKeyIndex - API key slot (nonce namespace); defaults to 7.
 * @param options.sharedBridge - Share ANOTHER provider's bridge OBJECT (singleton-client model).
 * @returns Provider and its collaborators.
 */
export function buildProvider(
  options: {
    chaseTestnetProbe?: boolean;
    nativeTwapTestnetProbe?: boolean;
    withBridge?: boolean;
    registeredKey?: string;
    webSocketCtor?: LighterWebSocketCtor | null;
    isTestnet?: boolean;
    /** Pass null to force account resolution through accountsByL1Address. */
    configuredAccountIndex?: number | null;
    /**
     * Shared platform dependencies (e.g. a durable diskCache across
     * simulated provider lifetimes).
     */
    platformDependencies?: ReturnType<typeof createMockInfrastructure>;
    /** API key slot (nonce namespace); defaults to 7. */
    apiKeyIndex?: number;
    /** Share ANOTHER provider's bridge OBJECT (singleton-client model). */
    sharedBridge?: MockBridgeBundle;
  } = {},
): BuiltProvider {
  const {
    withBridge = true,
    registeredKey,
    webSocketCtor,
    isTestnet = true,
    configuredAccountIndex = 28,
    platformDependencies = createMockInfrastructure(),
    apiKeyIndex = 7,
    sharedBridge,
  } = options;
  const clientInstance = {
    getEditableOrders: vi.fn().mockResolvedValue({ code: 200, orders: [] }),
    getOrdersByClientIds: vi.fn().mockResolvedValue({ code: 200, orders: [] }),
    network: 'testnet',
    getCandles: vi.fn().mockResolvedValue({ code: 200, c: [] }),
    getOrderBookOrders: vi.fn().mockResolvedValue({
      code: 200,
      totalBids: 1,
      totalAsks: 1,
      bids: [
        {
          orderId: '101',
          orderIndex: 101,
          ownerAccountIndex: 99,
          initialBaseAmount: '1',
          remainingBaseAmount: '1',
          price: '99999',
          orderExpiry: 0,
          transactionTime: 1,
        },
      ],
      asks: [
        {
          orderId: '102',
          orderIndex: 102,
          ownerAccountIndex: 99,
          initialBaseAmount: '1',
          remainingBaseAmount: '1',
          price: '100001',
          orderExpiry: 0,
          transactionTime: 1,
        },
      ],
    }),
    getOrderBooks: vi.fn().mockResolvedValue([BTC_MARKET]),
    getOrderBookDetails: vi.fn().mockResolvedValue({
      code: 200,
      orderBookDetails: [
        {
          ...BTC_MARKET,
          lastTradePrice: 100000,
          dailyTradesCount: 10,
          dailyBaseTokenVolume: 1,
          dailyQuoteTokenVolume: 100000,
          dailyPriceLow: 99000,
          dailyPriceHigh: 101000,
          dailyPriceChange: 1,
          openInterest: 1000000,
          dailyChart: {},
          // Authoritative margin metadata (strict leverage gate): 200
          // hundredths of a percent -> 50x max leverage.
          minInitialMarginFraction: 200,
          maintenanceMarginFraction: 120,
        },
      ],
    }),
    getAccountsByL1Address: vi.fn().mockResolvedValue({
      code: 200,
      l1Address: ACCOUNT.l1Address,
      subAccounts: [ACCOUNT],
    }),
    getAccountByIndex: vi
      .fn()
      .mockResolvedValue({ code: 200, accounts: [ACCOUNT] }),
    getApiKeys: vi.fn().mockResolvedValue({
      code: 200,
      apiKeys: registeredKey
        ? [
            {
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: 1,
              publicKey: registeredKey,
            },
          ]
        : [],
    }),
    getNextNonce: vi.fn().mockResolvedValue({ code: 200, nonce: 42 }),
    getActiveOrders: vi.fn().mockResolvedValue({
      code: 200,
      orders: [
        {
          orderIndex: 555,
          clientOrderIndex: 1,
          marketIndex: 1,
          ownerAccountIndex: 28,
          initialBaseAmount: '0.001',
          remainingBaseAmount: '0.001',
          price: '90000',
          isAsk: false,
          type: 'limit',
          timeInForce: 'good-till-time',
          reduceOnly: 0,
          status: 'open',
          orderExpiry: 0,
          timestamp: 1700000000000,
        },
      ],
    }),
    // Default: no transaction is known to the venue. The service contract
    // resolves venue-confirmed not-found (code 21500) to null and
    // RETHROWS transport/other API errors.
    getTx: vi.fn().mockResolvedValue(null),
    getInactiveOrders: vi.fn().mockResolvedValue({
      code: 200,
      orders: [
        {
          orderIndex: 777,
          clientOrderIndex: 2,
          marketIndex: 1,
          ownerAccountIndex: 28,
          initialBaseAmount: '0.002',
          remainingBaseAmount: '0.000',
          price: '95000',
          isAsk: true,
          type: 'market',
          timeInForce: 'immediate-or-cancel',
          reduceOnly: 0,
          status: 'filled',
          orderExpiry: 0,
          timestamp: 1700000001000,
        },
      ],
    }),
    getDepositHistory: vi.fn().mockResolvedValue({
      code: 200,
      deposits: [
        {
          id: '1',
          assetId: 3,
          amount: '10000.000000',
          timestamp: 1700000002000,
          status: 'completed',
          l1TxHash: '0xdep',
        },
      ],
    }),
    getWithdrawHistory: vi.fn().mockResolvedValue({
      code: 200,
      withdraws: [
        {
          id: '2',
          assetId: 3,
          amount: '1.000000',
          timestamp: 1700000003000,
          status: 'claimable',
          type: 'secure',
          l1TxHash: '0xwit',
        },
      ],
    }),
    getTransferHistory: vi.fn().mockResolvedValue({
      code: 200,
      transfers: [
        {
          id: '3',
          assetId: 3,
          amount: '100.000000',
          fee: '0.000000',
          timestamp: 1700000004000,
          type: 'L2TransferOutflow',
          fromL1Address: ACCOUNT.l1Address,
          toL1Address: ACCOUNT.l1Address,
          fromAccountIndex: 28,
          toAccountIndex: 999,
          txHash: '0xtra',
        },
      ],
    }),
    getPositionFundings: vi.fn().mockResolvedValue({
      code: 200,
      positionFundings: [],
    }),
    getTrades: vi.fn().mockResolvedValue({ code: 200, trades: [] }),
    sendTx: vi.fn().mockResolvedValue({ code: 200, txHash: '0xsent' }),
  };
  MockedClientService.mockImplementation(function () {
    return clientInstance as unknown as LighterClientService;
  });
  const getUserAddressMock = vi
    .fn()
    .mockReturnValue('0x8D7f03FdE1A626223364E592740a233b72395235');
  MockedWalletService.mockImplementation(function () {
    return {
      getUserAddress: getUserAddressMock,
      signPersonalMessage: vi.fn().mockResolvedValue(`0x${'cd'.repeat(65)}`),
      network: 'testnet',
    } as unknown as LighterWalletService;
  });

  const bridgeBundle = sharedBridge ?? createMockBridge();
  const { bridge, calls, fireReset, resetListenerCount, resetUnsubscribe } =
    bridgeBundle;
  const provider = new LighterProvider({
    nativeTwapTestnetProbe: options.nativeTwapTestnetProbe,
    chaseTestnetProbe: options.chaseTestnetProbe,
    isTestnet,
    platformDependencies,
    lighterAuthConfig: {
      ...(configuredAccountIndex === null
        ? {}
        : { accountIndex: configuredAccountIndex }),
      apiKeyIndex,
    },
    // Tests default to the REST-polling transport; the WS suite injects a fake.
    webSocketCtor: webSocketCtor ?? null,
    ...(withBridge ? { signerBridge: bridge } : {}),
  });

  return {
    provider,
    clientInstance,
    bridge,
    calls,
    getUserAddressMock,
    fireReset,
    resetListenerCount,
    resetUnsubscribe,
  };
}

/** Module-scope WS fake for suites outside the price-streaming describe. */
export class StreamFakeWebSocket implements LighterWebSocketLike {
  static instances: StreamFakeWebSocket[] = [];

  readyState = 0;

  sent: string[] = [];

  onopen: (() => void) | null = null;

  onmessage: ((event: { data: unknown }) => void) | null = null;

  onclose: (() => void) | null = null;

  onerror: (() => void) | null = null;

  url: string;

  constructor(url: string) {
    this.url = url;
    StreamFakeWebSocket.instances.push(this);
  }

  send = (data: string): void => {
    this.sent.push(data);
  };

  close = (): void => {
    this.readyState = 3;
    this.onclose?.();
  };

  open = (): void => {
    this.readyState = 1;
    this.onopen?.();
  };
}

export const fakeStreamCtor =
  StreamFakeWebSocket as unknown as LighterWebSocketCtor;

/** Real public controller with initialized providers and host-controlled selection. */
export class ChaseOwnershipController extends PerpsController {
  /**
   * @param provider - Actual provider under test.
   * @param mode - Host route.
   */
  activate(
    provider: PerpsProvider,
    mode: PerpsActiveProviderMode = 'lighter',
  ): void {
    this.activeProviderInstance = provider;
    if (mode !== 'aggregated') {
      this.providers.set(mode, provider);
    }
    this.isInitialized = true;
    this.update((state) => {
      state.activeProvider = mode;
      state.initializationState = InitializationState.Initialized;
    });
  }

  /**
   * @param change - Host context changes during an asynchronous read.
   */
  changeContext(change: {
    isTestnet?: boolean;
    activeProvider?: PerpsActiveProviderMode;
  }): void {
    this.update((state) => Object.assign(state, change));
  }
}

/**
 * @param provider - Real provider, with only external I/O mocked.
 * @param mode - Active route.
 * @returns Real controller and its registered public messenger.
 */
export function ownershipController(
  provider: PerpsProvider,
  mode: PerpsActiveProviderMode = 'lighter',
): {
  controller: ChaseOwnershipController;
  host: ReturnType<typeof createKeyringlessMessenger>;
} {
  const host = createKeyringlessMessenger();
  host.selectAccount(ACCOUNT.l1Address as `0x${string}`);
  host.rootMessenger.registerActionHandler(
    'RemoteFeatureFlagController:getState',
    () => ({ remoteFeatureFlags: {}, cacheTimestamp: 0 }),
  );
  host.rootMessenger.delegate({
    actions: ['RemoteFeatureFlagController:getState'],
    events: [
      'RemoteFeatureFlagController:stateChange',
      'AccountsController:selectedAccountChange',
      'AccountTreeController:selectedAccountGroupChange',
    ],
    messenger: host.messenger,
  });
  const controller = new ChaseOwnershipController({
    messenger: host.messenger,
    state: { isTestnet: true },
    infrastructure: createMockInfrastructure(),
    deferEligibilityCheck: true,
  });
  controller.activate(provider, mode);
  return { controller, host };
}

/**
 * Work a test leaves in flight can hold the provider's process-wide mutexes.
 * Finish it before the package setup removes the fake clock and its pending
 * timers, or the next test waits on those mutexes forever.
 */
export function finishPendingTimersAfterEach(): void {
  afterEach(async () => {
    if (vi.isFakeTimers()) {
      await vi.runAllTimersAsync();
    }
  });
}

export type RawTriggerOrder = {
  orderIndex: number;
  clientOrderIndex: number;
  marketIndex: number;
  ownerAccountIndex: number;
  initialBaseAmount: string;
  remainingBaseAmount: string;
  price: string;
  isAsk: boolean;
  type: string;
  timeInForce: string;
  reduceOnly: number;
  status: string;
  orderExpiry: number;
  timestamp: number;
  triggerPrice: string;
  /** Venue OCO linkage: the sibling this order auto-cancels. */
  toCancelOrderId0?: string;
};
/**
 * Stateful fake venue trigger book: creations observed at the bridge
 * add triggers, cancels remove them, and getActiveOrders always
 * reflects the current state — so interleaving outcomes are decided by
 * actual call order, not static mocks.
 *
 * @param clientInstance - Mock client service instance.
 * @param bridge - Mock signer bridge.
 * @param venueOptions - Venue configuration.
 * @param venueOptions.apiKeyIndex - API key slot the fake reports for
 * landed transactions; defaults to 7.
 * @returns The live raw trigger table and a seeding helper.
 */
export const setupTriggerVenue = (
  clientInstance: MockClientInstance,
  bridge: LighterSignerBridge,
  venueOptions: { apiKeyIndex?: number } = {},
): {
  rawTriggers: RawTriggerOrder[];
  seedTrigger: (type: string, triggerPrice: string) => number;
  seedLinkedPair: (tpPrice: string, slPrice: string) => [number, number];
  events: string[];
  armCreateGate: () => Promise<void>;
  releaseCreateGate: () => void;
  setRestLag: (reads: number) => void;
  stagedCancels: { orderId: string; txHash: string; nonce: number }[];
  rawInactive: RawTriggerOrder[];
  setCreateTerminal: (
    mode:
      | 'none'
      | 'filled'
      | 'canceled'
      | 'oco-mixed'
      | 'oco-split'
      | 'filled-partial',
  ) => void;
  delayedCommitOnce: (txType: number, delayMs: number) => void;
  failResponseOnce: (txType: number) => void;
  failCodedAfterCommitOnce: (txType: number, code: number) => void;
  failBeforeCommitOnce: (txType: number) => void;
  failExecutionOnceFor: (txType: number) => void;
  landedTxs: Map<string, { nonce: number; status: number }>;
  getVenueNonce: () => number;
  setVenueNonce: (nonce: number) => void;
  getNextIndex: () => number;
  setNextIndex: (index: number) => void;
  primeLag: (view: RawTriggerOrder[], reads: number) => void;
} => {
  let nextIndex = 9000;
  const rawTriggers: RawTriggerOrder[] = [];
  const buildRawTrigger = (
    orderIndex: number,
    type: string,
    triggerPrice: string,
  ): RawTriggerOrder => ({
    orderIndex,
    clientOrderIndex: orderIndex,
    marketIndex: 1,
    ownerAccountIndex: 28,
    initialBaseAmount: ACCOUNT.positions[0].position,
    remainingBaseAmount: ACCOUNT.positions[0].position,
    price: '80000',
    isAsk: true,
    type,
    timeInForce: 'immediate-or-cancel',
    reduceOnly: 1,
    status: 'open',
    orderExpiry: 0,
    timestamp: 1700000000000,
    triggerPrice,
  });
  const seedTrigger = (type: string, triggerPrice: string): number => {
    const orderIndex = nextIndex;
    nextIndex += 1;
    rawTriggers.push(buildRawTrigger(orderIndex, type, triggerPrice));
    return orderIndex;
  };
  // A VENUE-LINKED OCO pair: both rows carry the venue's own mutual
  // to_cancel linkage fields — the ONLY basis for grouping.
  const seedLinkedPair = (
    tpPrice: string,
    slPrice: string,
  ): [number, number] => {
    const tpIndex = nextIndex;
    nextIndex += 1;
    const slIndex = nextIndex;
    nextIndex += 1;
    rawTriggers.push(
      {
        ...buildRawTrigger(tpIndex, 'take-profit', tpPrice),
        toCancelOrderId0: String(slIndex),
      },
      {
        ...buildRawTrigger(slIndex, 'stop-loss', slPrice),
        toCancelOrderId0: String(tpIndex),
      },
    );
    return [tpIndex, slIndex];
  };
  // Deterministic interleaving instrumentation: reads are counted, and
  // the FIRST trigger creation can be stalled mid-transition (after its
  // snapshot, at signing). Under full-transition exclusion a concurrent
  // call CANNOT read while the first is stalled — it is queued behind
  // the write chain; unserialized code reaches getActiveOrders during
  // the stall and double-snapshots pre-mutation state.
  const events: string[] = [];
  // Venue-faithful timing: state commits when sendTx ACCEPTS (not at
  // signing), and reads can lag commits by a configurable number of
  // responses to model REST visibility delay.
  let restLag = 0;
  let lagRemaining = 0;
  let laggedView: RawTriggerOrder[] = [];
  const setRestLag = (reads: number): void => {
    restLag = reads;
  };
  const primeLag = (view: RawTriggerOrder[], reads: number): void => {
    laggedView = [...view];
    lagRemaining = reads;
  };
  clientInstance.getActiveOrders.mockImplementation(async () => {
    events.push('read');
    if (lagRemaining > 0) {
      lagRemaining -= 1;
      return { code: 200, orders: [...laggedView] };
    }
    return { code: 200, orders: [...rawTriggers] };
  });
  type StagedCreate = {
    type: string;
    triggerPrice: string;
    clientOrderIndex: number;
    baseAmount: string;
  };
  type StagedCreateBatch = {
    creates: StagedCreate[];
    txHash: string;
    nonce: number;
  };
  type StagedCancel = { orderId: string; txHash: string; nonce: number };
  const stagedCreates: StagedCreateBatch[] = [];
  const stagedCancels: StagedCancel[] = [];
  // Generic (non-order) dispatches: withdraw/margin/leverage/key-reg.
  // The venue's tx registry records EVERY landed tx by hash, so masked
  // commits of these types must be exact-hash resolvable too.
  const stagedGenerics: { txHash: string; nonce: number }[] = [];
  // Authoritative tx registry: exact-hash lookup resolves acceptance.
  // Status semantics follow the venue: 3 executed, 4 failed, 5 rejected.
  const venueApiKeyIndex = venueOptions.apiKeyIndex ?? 7;
  const landedTxs = new Map<string, { nonce: number; status: number }>();
  clientInstance.getTx.mockImplementation(async (hash: string) =>
    landedTxs.has(hash)
      ? {
          code: 200,
          hash,
          accountIndex: 28,
          apiKeyIndex: venueApiKeyIndex,
          nonce: landedTxs.get(hash)?.nonce,
          status: landedTxs.get(hash)?.status,
        }
      : null,
  );
  // Inactive/terminal book + terminal mode: an immediate/crossed trigger
  // never rests active and lands directly in inactive history.
  const rawInactive: RawTriggerOrder[] = [];
  // Inactive history honors limit + cursor (numeric offset), newest
  // first — a truncated first page must be traversable.
  clientInstance.getInactiveOrders.mockImplementation(
    async (
      _accountIndex: number,
      _authToken: string,
      limit: number = 50,
      cursor?: string,
    ) => {
      const newestFirst = [...rawInactive].reverse();
      const offset = cursor === undefined ? 0 : Number(cursor);
      const page = newestFirst.slice(offset, offset + limit);
      const nextOffset = offset + limit;
      return {
        code: 200,
        orders: page,
        ...(nextOffset < newestFirst.length
          ? { nextCursor: String(nextOffset) }
          : {}),
      };
    },
  );
  const beginLag = (): void => {
    if (restLag > 0) {
      laggedView = [...rawTriggers];
      lagRemaining = restLag;
    }
  };
  type CreateTerminalMode =
    | 'none'
    | 'filled'
    | 'canceled'
    | 'oco-mixed'
    | 'oco-split'
    | 'filled-partial';
  let createTerminalMode: CreateTerminalMode = 'none';
  const setCreateTerminal = (mode: CreateTerminalMode): void => {
    createTerminalMode = mode;
  };
  // Authoritative venue nonce: consumed on each ACCEPTED submission.
  let venueNonce = 42;
  clientInstance.getNextNonce.mockImplementation(async () => ({
    code: 200,
    nonce: venueNonce,
  }));
  // One-shot transport failure AFTER venue commit (response loss).
  const failAfterCommit = new Set<number>();
  const failResponseOnce = (txType: number): void => {
    failAfterCommit.add(txType);
  };
  // One-shot transport failure BEFORE the venue sees the submission:
  // the staged payload is dropped (it never reached the venue), so a
  // later retry can never accidentally commit the stale payload.
  const failBeforeCommit = new Set<number>();
  const failBeforeCommitOnce = (txType: number): void => {
    failBeforeCommit.add(txType);
  };
  // One-shot DELAYED commit: the caller sees a transport failure now,
  // but the request is still in flight server-side and commits later
  // (within the signed validity window).
  const delayedCommit = new Map<number, number>();
  const delayedCommitOnce = (txType: number, delayMs: number): void => {
    delayedCommit.set(txType, delayMs);
  };
  // One-shot FAILED execution: the sequencer consumes the nonce and the
  // tx lands with terminal status 0 (failed), but NO book mutation
  // happens; the caller's response is also lost.
  const failExecutionOnce = new Set<number>();
  const failExecutionOnceFor = (txType: number): void => {
    failExecutionOnce.add(txType);
  };
  // One-shot CODED error AFTER commit: the venue commits, then the
  // caller receives an application/HTTP-coded error (e.g. a 5xx that
  // masked the commit). The nonce IS consumed.
  const failCodedAfterCommit = new Map<number, number>();
  const failCodedAfterCommitOnce = (txType: number, code: number): void => {
    failCodedAfterCommit.set(txType, code);
  };
  const realSendTx = clientInstance.sendTx.getMockImplementation() as (
    txType: number,
    txInfo: string,
  ) => Promise<unknown>;
  // Venue commit application, shared by the accepted path and the
  // delayed-commit (response-lost) path.
  const commitCreateBatch = (batch: StagedCreateBatch): void => {
    beginLag();
    landedTxs.set(batch.txHash, { nonce: batch.nonce, status: 2 });
    batch.creates.forEach((create, createIndexInBatch) => {
      const orderIndex = nextIndex;
      nextIndex += 1;
      const row = {
        ...buildRawTrigger(orderIndex, create.type, create.triggerPrice),
        clientOrderIndex: create.clientOrderIndex,
        initialBaseAmount: create.baseAmount,
        remainingBaseAmount: create.baseAmount,
      };
      if (createTerminalMode === 'none') {
        rawTriggers.push(row);
      } else if (createTerminalMode === 'oco-mixed') {
        // One OCO leg fills (fully); the venue auto-cancels its sibling.
        rawInactive.push({
          ...row,
          remainingBaseAmount:
            createIndexInBatch === 0 ? '0.000' : row.remainingBaseAmount,
          status: createIndexInBatch === 0 ? 'filled' : 'canceled',
        });
      } else if (createTerminalMode === 'oco-split') {
        // One leg rests ACTIVE; the sibling terminal-cancels.
        if (createIndexInBatch === 0) {
          rawTriggers.push(row);
        } else {
          rawInactive.push({ ...row, status: 'canceled' });
        }
      } else if (createTerminalMode === 'filled') {
        // A genuine execution leaves nothing remaining.
        rawInactive.push({
          ...row,
          remainingBaseAmount: '0.000',
          status: 'filled',
        });
      } else if (createTerminalMode === 'filled-partial') {
        // Inconsistent venue row: 'filled' status but remaining size —
        // must NOT count as a proven execution.
        rawInactive.push({ ...row, status: 'filled' });
      } else {
        rawInactive.push({ ...row, status: createTerminalMode });
      }
    });
  };
  const commitCancel = (staged: StagedCancel): void => {
    beginLag();
    landedTxs.set(staged.txHash, { nonce: staged.nonce, status: 2 });
    const at = rawTriggers.findIndex(
      (entry) => String(entry.orderIndex) === String(staged.orderId),
    );
    if (at >= 0) {
      rawTriggers.splice(at, 1);
    }
  };
  // Payloads are matched by the wire NONCE in the submitted txInfo
  // (the REAL signed payload shape carries Nonce, never the hash): a
  // signed-but-never-submitted payload must never be committed in
  // place of the actually-submitted one (FIFO desync).
  const nonceFromTxInfo = (txInfo: string): number | undefined => {
    try {
      const parsed = (JSON.parse(txInfo) as Record<string, unknown>).Nonce;
      return typeof parsed === 'number' ? parsed : undefined;
    } catch {
      return undefined;
    }
  };
  const takeStagedCreate = (txInfo: string): StagedCreateBatch | undefined => {
    const nonce = nonceFromTxInfo(txInfo);
    const clientId = (JSON.parse(txInfo) as { ClientOrderIndex?: number })
      .ClientOrderIndex;
    // A signed-but-never-dispatched create can share the next nonce with
    // a retry. Match its actual wire client ID rather than committing the
    // first signature staged under that nonce.
    const at = stagedCreates.findIndex(
      (batch) =>
        batch.nonce === nonce &&
        (clientId === undefined ||
          batch.creates.some((entry) => entry.clientOrderIndex === clientId)),
    );
    return at >= 0 ? stagedCreates.splice(at, 1)[0] : undefined;
  };
  const takeStagedCancel = (txInfo: string): StagedCancel | undefined => {
    const nonce = nonceFromTxInfo(txInfo);
    const at = stagedCancels.findIndex((staged) => staged.nonce === nonce);
    return at >= 0 ? stagedCancels.splice(at, 1)[0] : undefined;
  };
  const takeStagedGeneric = (
    txInfo: string,
  ): { txHash: string; nonce: number } | undefined => {
    const nonce = nonceFromTxInfo(txInfo);
    const at = stagedGenerics.findIndex((staged) => staged.nonce === nonce);
    return at >= 0 ? stagedGenerics.splice(at, 1)[0] : undefined;
  };
  // Drop a submission's staged payload when it never reached acceptance.
  const dropStaged = (txType: number, txInfo: string): void => {
    if (txType === 14 || txType === 28) {
      takeStagedCreate(txInfo);
    }
    if (txType === 15) {
      takeStagedCancel(txInfo);
    } else if (txType !== 14 && txType !== 28) {
      takeStagedGeneric(txInfo);
    }
  };
  clientInstance.sendTx.mockImplementation(
    async (txType: number, txInfo: string) => {
      if (failBeforeCommit.has(txType)) {
        failBeforeCommit.delete(txType);
        dropStaged(txType, txInfo);
        throw new Error('network unreachable');
      }
      if (failExecutionOnce.has(txType)) {
        failExecutionOnce.delete(txType);
        // Nonce consumed, tx recorded with terminal FAILED status, no
        // book mutation, response lost.
        const failedStaged =
          txType === 15 ? takeStagedCancel(txInfo) : takeStagedCreate(txInfo);
        if (failedStaged) {
          venueNonce += 1;
          landedTxs.set(failedStaged.txHash, {
            nonce: failedStaged.nonce,
            status: 0,
          });
        }
        throw new Error('transport failure with failed execution');
      }
      const delayMs = delayedCommit.get(txType);
      if (delayMs !== undefined) {
        delayedCommit.delete(txType);
        // The request is still in flight: commit later, fail the caller
        // NOW with a transport error.
        if (txType === 14 || txType === 28) {
          const batch = takeStagedCreate(txInfo);
          if (batch) {
            setTimeout(() => {
              venueNonce += 1;
              commitCreateBatch(batch);
            }, delayMs);
          }
        }
        if (txType === 15) {
          const staged = takeStagedCancel(txInfo);
          if (staged) {
            setTimeout(() => {
              venueNonce += 1;
              commitCancel(staged);
            }, delayMs);
          }
        }
        throw new Error('network timeout with request in flight');
      }
      // ACCEPTANCE timing: apply staged mutations only after the venue
      // resolves 200 — a rejected/failed submission must not mutate,
      // matching the provider's onAccepted boundary.
      let response: { code?: number };
      try {
        response = (await realSendTx(txType, txInfo)) as { code?: number };
      } catch (error) {
        dropStaged(txType, txInfo);
        throw error;
      }
      if (response?.code !== 200) {
        dropStaged(txType, txInfo);
        return response;
      }
      venueNonce += 1;
      if (txType === 14 || txType === 28) {
        const batch = takeStagedCreate(txInfo);
        if (batch) {
          commitCreateBatch(batch);
        }
      }
      if (txType === 15) {
        const staged = takeStagedCancel(txInfo);
        if (staged) {
          commitCancel(staged);
        }
      }
      if (txType !== 14 && txType !== 28 && txType !== 15) {
        // Generic dispatch (withdraw/margin/leverage/key-reg): the
        // venue records EVERY landed tx by exact hash.
        const staged = takeStagedGeneric(txInfo);
        if (staged) {
          landedTxs.set(staged.txHash, { nonce: staged.nonce, status: 2 });
        }
      }
      if (failAfterCommit.has(txType)) {
        failAfterCommit.delete(txType);
        throw new Error('transport failure after venue commit');
      }
      const codedFailure = failCodedAfterCommit.get(txType);
      if (codedFailure !== undefined) {
        failCodedAfterCommit.delete(txType);
        throw new LighterApiError('internal server error', codedFailure);
      }
      return response;
    },
  );
  let pendingCreateGate: Promise<void> | null = null;
  let releaseCreateGate = (): void => undefined;
  let signalGateEntered = (): void => undefined;
  const gateEntered = new Promise<void>((resolve) => {
    signalGateEntered = resolve;
  });
  const armCreateGate = (): Promise<void> => {
    pendingCreateGate = new Promise<void>((resolve) => {
      releaseCreateGate = resolve;
    });
    return gateEntered;
  };
  const realImplementation = (
    bridge.execute as Mock
  ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
  (bridge.execute as Mock).mockImplementation(async (call: LighterWasmCall) => {
    const wireParams = call.params as (string | number)[];
    if (
      call.function === '_signCreateOrder' &&
      (wireParams[6] === 2 ||
        wireParams[6] === 3 ||
        wireParams[6] === 4 ||
        wireParams[6] === 5)
    ) {
      if (pendingCreateGate) {
        const gate = pendingCreateGate;
        pendingCreateGate = null;
        events.push('create-stalled');
        signalGateEntered();
        await gate;
      }
      events.push('create');
      // Stage with the REAL wire client id + signed tx identity
      // (hash/nonce), committed at sendTx acceptance.
      const result = (await realImplementation(call)) as {
        txHash?: string;
      };
      const singleTypeByWire: Record<number, string> = {
        2: 'stop-loss',
        3: 'stop-loss-limit',
        4: 'take-profit',
        5: 'take-profit-limit',
      };
      stagedCreates.push({
        creates: [
          {
            type: singleTypeByWire[Number(wireParams[6])] ?? 'stop-loss',
            triggerPrice: String(Number(wireParams[9]) / 10),
            clientOrderIndex: Number(wireParams[2]),
            baseAmount: String(
              Number(wireParams[3]) / 10 ** BTC_MARKET.supportedSizeDecimals,
            ),
          },
        ],
        txHash: result.txHash ?? 'missing',
        nonce: Number(wireParams[11]),
      });
      return result;
    }
    if (call.function === '_signCreateGroupedOrders') {
      const count = Number(wireParams[2]);
      const creates: StagedCreate[] = [];
      for (let index = 0; index < count; index++) {
        const base = 3 + index * 10;
        creates.push({
          type: wireParams[base + 5] === 4 ? 'take-profit' : 'stop-loss',
          triggerPrice: String(Number(wireParams[base + 8]) / 10),
          clientOrderIndex: Number(wireParams[base + 1]),
          baseAmount: String(
            Number(wireParams[base + 2]) /
              10 ** BTC_MARKET.supportedSizeDecimals,
          ),
        });
      }
      const result = (await realImplementation(call)) as {
        txHash?: string;
      };
      stagedCreates.push({
        creates,
        txHash: result.txHash ?? 'missing',
        nonce: Number(wireParams[wireParams.length - 1]),
      });
      return result;
    }
    if (call.function === '_signCancelOrder') {
      events.push('cancel');
      const result = (await realImplementation(call)) as {
        txHash?: string;
      };
      stagedCancels.push({
        orderId: String(wireParams[2]),
        txHash: result.txHash ?? 'missing',
        nonce: Number(wireParams[3]),
      });
      return result;
    }
    if (
      [
        '_signWithdraw',
        '_signUpdateMargin',
        '_signUpdateLeverage',
        '_signChangePubKey',
      ].includes(call.function)
    ) {
      const result = (await realImplementation(call)) as {
        txHash?: string;
        txInfo?: string;
      };
      let wireNonce: number | undefined;
      try {
        const parsed = JSON.parse(result.txInfo ?? '') as Record<
          string,
          unknown
        >;
        wireNonce = typeof parsed.Nonce === 'number' ? parsed.Nonce : undefined;
      } catch {
        wireNonce = undefined;
      }
      if (typeof result.txHash === 'string' && wireNonce !== undefined) {
        stagedGenerics.push({ txHash: result.txHash, nonce: wireNonce });
      }
      return result;
    }
    return realImplementation(call);
  });
  return {
    rawTriggers,
    seedTrigger,
    seedLinkedPair,
    events,
    armCreateGate,
    releaseCreateGate: () => releaseCreateGate(),
    setRestLag,
    stagedCancels,
    rawInactive,
    setCreateTerminal,
    failResponseOnce,
    failCodedAfterCommitOnce,
    failBeforeCommitOnce,
    failExecutionOnceFor,
    landedTxs,
    getVenueNonce: () => venueNonce,
    setVenueNonce: (nonce: number): void => {
      venueNonce = nonce;
    },
    getNextIndex: () => nextIndex,
    setNextIndex: (index: number): void => {
      nextIndex = index;
    },
    delayedCommitOnce,
    primeLag,
  };
};
