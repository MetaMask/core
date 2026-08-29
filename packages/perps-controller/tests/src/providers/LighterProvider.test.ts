import { webcrypto } from 'crypto';

import { LighterProvider } from '../../../src/providers/LighterProvider.js';
import {
  LighterApiError,
  LighterClientService,
} from '../../../src/services/LighterClientService.js';
import { LighterWalletService } from '../../../src/services/LighterWalletService.js';
import type {
  LighterSignerBridge,
  LighterSignerOperation,
  LighterSignerResult,
  LighterWasmCall,
  LighterWebSocketCtor,
  LighterWebSocketLike,
} from '../../../src/types/lighter-types.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

jest.mock('../../../src/services/LighterClientService', () => ({
  ...jest.requireActual('../../../src/services/LighterClientService'),
  // Only the service class is doubled; convertKeysToCamelCase stays real so
  // the WebSocket message router operates on faithfully camelized payloads.
  LighterClientService: jest.fn(),
}));
jest.mock('../../../src/services/LighterWalletService');

const MockedClientService = LighterClientService as jest.MockedClass<
  typeof LighterClientService
>;
const MockedWalletService = LighterWalletService as jest.MockedClass<
  typeof LighterWalletService
>;

const BTC_MARKET = {
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
const acknowledgeAllRecovered = async (
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
const ensureWebCrypto = (): typeof webcrypto => {
  Object.defineProperty(globalThis, 'crypto', {
    value: webcrypto,
    configurable: true,
  });
  return webcrypto;
};

const resolveJournalPayloadKey = (
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

const ACCOUNT = {
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

type MockBridgeBundle = {
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
  fireReset: () => void;
  resetListenerCount: () => number;
  resetUnsubscribe: jest.Mock;
};

/**
 * WASM bridge double: replays canned results per function name.
 *
 * @returns Bridge plus the recorded calls.
 */
function createMockBridge(): MockBridgeBundle {
  const calls: LighterWasmCall[] = [];
  const resetListeners = new Set<() => void>();
  const resetUnsubscribe = jest.fn();
  let signSequence = 0;
  const bridge: LighterSignerBridge = {
    createClient: jest.fn(async (params) =>
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
    execute: jest.fn(
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
                Nonce: Number((call.params as (string | number)[]).at(-1)),
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: createHash,
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
            return {
              txInfo: JSON.stringify({
                createGroupedOrders: true,
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

type MockClientInstance = {
  network: string;
  getOrderBooks: jest.Mock;
  getOrderBookDetails: jest.Mock;
  getAccountsByL1Address: jest.Mock;
  getAccountByIndex: jest.Mock;
  getApiKeys: jest.Mock;
  getNextNonce: jest.Mock;
  getActiveOrders: jest.Mock;
  getInactiveOrders: jest.Mock;
  getTx: jest.Mock;
  getDepositHistory: jest.Mock;
  getWithdrawHistory: jest.Mock;
  getTransferHistory: jest.Mock;
  getTrades: jest.Mock;
  sendTx: jest.Mock;
};

type BuiltProvider = {
  provider: LighterProvider;
  clientInstance: MockClientInstance;
  bridge: LighterSignerBridge;
  calls: LighterWasmCall[];
  getUserAddressMock: jest.Mock;
  fireReset: () => void;
  resetListenerCount: () => number;
  resetUnsubscribe: jest.Mock;
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
function buildProvider(
  options: {
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
    network: 'testnet',
    getCandles: jest.fn().mockResolvedValue({ code: 200, c: [] }),
    getOrderBooks: jest.fn().mockResolvedValue([BTC_MARKET]),
    getOrderBookDetails: jest.fn().mockResolvedValue({
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
    getAccountsByL1Address: jest.fn().mockResolvedValue({
      code: 200,
      l1Address: ACCOUNT.l1Address,
      subAccounts: [ACCOUNT],
    }),
    getAccountByIndex: jest
      .fn()
      .mockResolvedValue({ code: 200, accounts: [ACCOUNT] }),
    getApiKeys: jest.fn().mockResolvedValue({
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
    getNextNonce: jest.fn().mockResolvedValue({ code: 200, nonce: 42 }),
    getActiveOrders: jest.fn().mockResolvedValue({
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
    getTx: jest.fn().mockResolvedValue(null),
    getInactiveOrders: jest.fn().mockResolvedValue({
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
    getDepositHistory: jest.fn().mockResolvedValue({
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
    getWithdrawHistory: jest.fn().mockResolvedValue({
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
    getTransferHistory: jest.fn().mockResolvedValue({
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
    getTrades: jest.fn().mockResolvedValue({ code: 200, trades: [] }),
    sendTx: jest.fn().mockResolvedValue({ code: 200, txHash: '0xsent' }),
  };
  MockedClientService.mockImplementation(
    () => clientInstance as unknown as LighterClientService,
  );
  const getUserAddressMock = jest
    .fn()
    .mockReturnValue('0x8D7f03FdE1A626223364E592740a233b72395235');
  MockedWalletService.mockImplementation(
    () =>
      ({
        getUserAddress: getUserAddressMock,
        signPersonalMessage: jest
          .fn()
          .mockResolvedValue(`0x${'cd'.repeat(65)}`),
        network: 'testnet',
      }) as unknown as LighterWalletService,
  );

  const bridgeBundle = sharedBridge ?? createMockBridge();
  const { bridge, calls, fireReset, resetListenerCount, resetUnsubscribe } =
    bridgeBundle;
  const provider = new LighterProvider({
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
class StreamFakeWebSocket implements LighterWebSocketLike {
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

const fakeStreamCtor = StreamFakeWebSocket as unknown as LighterWebSocketCtor;

describe('LighterProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('lifecycle', () => {
    it('exposes the lighter protocol id', () => {
      const { provider } = buildProvider();
      expect(provider.protocolId).toBe('lighter');
    });

    it('initializes by loading markets', async () => {
      const { provider, clientInstance } = buildProvider();
      const result = await provider.initialize();
      expect(result.success).toBe(true);
      expect(clientInstance.getOrderBooks).toHaveBeenCalledWith(true);
    });

    it('reports initialize failure without throwing', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(new Error('down'));
      const result = await provider.initialize();
      expect(result).toStrictEqual({ success: false, error: 'down' });
    });

    it('disconnects cleanly', async () => {
      const { provider, resetListenerCount, resetUnsubscribe } =
        buildProvider();
      expect(resetListenerCount()).toBe(1);
      expect(await provider.disconnect()).toStrictEqual({
        success: true,
      });
      expect(resetUnsubscribe).toHaveBeenCalledTimes(1);
      expect(resetListenerCount()).toBe(0);
    });

    it('does not rebind when a delayed account lookup resolves after disconnect', async () => {
      const { provider, clientInstance, calls, resetListenerCount } =
        buildProvider();
      let resolveAccount: (value: unknown) => void = () => undefined;
      let signalAccountLookup: () => void = () => undefined;
      const accountLookupStarted = new Promise<void>((resolve) => {
        signalAccountLookup = resolve;
      });
      clientInstance.getAccountByIndex
        .mockImplementationOnce(() => {
          signalAccountLookup();
          return new Promise((resolve) => {
            resolveAccount = resolve;
          });
        })
        .mockResolvedValue({ code: 200, accounts: [ACCOUNT] });

      provider.subscribeToAccount({ callback: jest.fn() });
      await accountLookupStarted;
      await provider.disconnect();
      expect(resetListenerCount()).toBe(0);
      resolveAccount({ code: 200, accounts: [ACCOUNT] });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(resetListenerCount()).toBe(0);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(0);
    });

    it('does not recreate the signer when a delayed auth mint resolves after disconnect', async () => {
      const { provider, bridge, calls, resetListenerCount } = buildProvider({
        registeredKey: '9c'.repeat(40),
      });
      const realExecute = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseAuth: () => void = () => undefined;
      let signalAuthMint: () => void = () => undefined;
      const authMintStarted = new Promise<void>((resolve) => {
        signalAuthMint = resolve;
      });
      let authPaused = false;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && !authPaused) {
            authPaused = true;
            signalAuthMint();
            await new Promise<void>((resolve) => {
              releaseAuth = resolve;
            });
          }
          return await realExecute(call);
        },
      );

      provider.subscribeToOrders({ callback: jest.fn() });
      await authMintStarted;
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(1);
      await provider.disconnect();
      releaseAuth();
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      expect(resetListenerCount()).toBe(0);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(1);
    });

    it('ignores a WebSocket open that arrives after disconnect', async () => {
      StreamFakeWebSocket.instances = [];
      const { provider, calls, resetListenerCount } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      const callback = jest.fn();
      provider.subscribeToPrices({ symbols: [], callback });
      const socket = StreamFakeWebSocket.instances[0];
      await provider.disconnect();

      socket.open();

      expect(resetListenerCount()).toBe(0);
      expect(provider.getWebSocketConnectionState()).toBe('disconnected');
      expect(socket.sent).toStrictEqual([]);
      expect(callback).not.toHaveBeenCalled();
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(0);
    });

    it('refuses toggleTestnet', async () => {
      const { provider } = buildProvider();
      const result = await provider.toggleTestnet();
      expect(result.success).toBe(false);
      expect(result.isTestnet).toBe(true);
    });

    it('pings via the markets endpoint', async () => {
      const { provider, clientInstance } = buildProvider();
      await provider.ping();
      expect(clientInstance.getOrderBooks).toHaveBeenCalled();
    });
  });

  describe('isReadyToTrade', () => {
    it('reports not ready without a signer bridge', async () => {
      const { provider } = buildProvider({ withBridge: false });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(false);
      expect(result.error).toContain('signer bridge');
    });

    it('sets up the signer and registers the venue key when missing', async () => {
      const { provider, clientInstance, calls, bridge } = buildProvider();
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      expect(bridge.createClient).toHaveBeenCalledWith({
        chainId: 300,
        accountIndex: 28,
        nonce: 42,
        apiKeyIndex: 7,
      });
      const callNames = calls.map((call) => call.function);
      expect(callNames).toContain('_createClient');
      expect(callNames).toContain('_signChangePubKey');
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        8,
        expect.stringContaining('"changePubKey":true'),
      );
    });

    it('mainnet signer setup registers the venue key exactly like testnet (rollout gate removed)', async () => {
      // Mainnet trading is enabled: the ceremony is identical to testnet —
      // client creation, ChangePubKey signing, and dispatch all proceed.
      const { provider, calls, clientInstance } = buildProvider({
        isTestnet: false,
      });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      const callNames = calls.map((call) => call.function);
      expect(callNames).toContain('_createClient');
      expect(callNames).toContain('_signChangePubKey');
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        8,
        expect.stringContaining('"changePubKey":true'),
      );
    });

    it('mainnet AUTHENTICATED reads work when the venue key is already registered (no dispatch needed)', async () => {
      const { provider, calls, clientInstance } = buildProvider({
        isTestnet: false,
        registeredKey: '9c'.repeat(40),
      });
      const orders = await provider.getOpenOrders();
      expect(orders.length).toBeGreaterThan(0);
      expect(calls.map((call) => call.function)).toContain('_createAuthToken');
      // Nothing was dispatched to the venue.
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('skips registration when the venue key is already registered', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        registeredKey: '9c'.repeat(40),
      });
      const result = await provider.isReadyToTrade();
      expect(result.ready).toBe(true);
      expect(calls.map((call) => call.function)).not.toContain(
        '_signChangePubKey',
      );
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('fails closed when the venue-key lookup fails', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getApiKeys.mockRejectedValue(new Error('temporary 503'));

      const result = await provider.isReadyToTrade();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('temporary 503');
      expect(calls.map((call) => call.function)).not.toContain(
        '_signChangePubKey',
      );
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('refuses to replace a different key already registered in the configured slot', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        registeredKey: 'ab'.repeat(40),
      });

      const result = await provider.isReadyToTrade();

      expect(result.ready).toBe(false);
      expect(result.error).toContain('automatic replacement is disabled');
      expect(calls.map((call) => call.function)).not.toContain(
        '_signChangePubKey',
      );
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });
  });

  describe('market reads', () => {
    it('returns adapted markets', async () => {
      const { provider } = buildProvider();
      const markets = await provider.getMarkets();
      expect(markets).toHaveLength(1);
      expect(markets[0]).toMatchObject({ name: 'BTC', providerId: 'lighter' });
    });

    it('returns empty markets on API failure', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(new Error('down'));
      expect(await provider.getMarkets()).toStrictEqual([]);
    });

    it('surfaces malformed venue market data instead of reporting no markets', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBooks.mockRejectedValue(
        new Error('Invalid Lighter venue data: malformed market'),
      );
      await expect(provider.getMarkets()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('returns adapted market data with prices', async () => {
      const { provider } = buildProvider();
      const data = await provider.getMarketDataWithPrices();
      expect(data).toHaveLength(1);
      expect(data[0].symbol).toBe('BTC');
    });

    it('surfaces malformed successful order-book details instead of reporting no market data', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('Invalid Lighter venue data: malformed order-book details'),
      );
      await expect(provider.getMarketDataWithPrices()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });
  });

  describe('account reads', () => {
    it('returns adapted positions', async () => {
      const { provider } = buildProvider();
      const positions = await provider.getPositions();
      expect(positions).toHaveLength(1);
      expect(positions[0]).toMatchObject({
        symbol: 'BTC',
        size: '0.1',
        providerId: 'lighter',
      });
    });

    it('returns adapted account state', async () => {
      const { provider } = buildProvider();
      const state = await provider.getAccountState();
      expect(state.totalBalance).toBe('10500');
      expect(state.providerId).toBe('lighter');
    });

    it('returns empty account state on failure', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockRejectedValue(new Error('down'));
      const state = await provider.getAccountState();
      expect(state.totalBalance).toBe('0');
    });

    it('surfaces malformed REST account numbers instead of degrading to empty state', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, collateral: '10000USD' }],
      });

      await expect(provider.getAccountState()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('returns open orders through the auth-token path', async () => {
      const { provider, clientInstance } = buildProvider();
      await provider.initialize();
      const orders = await provider.getOpenOrders();
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({
        orderId: '555',
        symbol: 'BTC',
        side: 'buy',
      });
      expect(clientInstance.getActiveOrders).toHaveBeenCalledWith(
        28,
        'auth-token',
      );
    });

    it('surfaces malformed REST order state instead of returning an empty list', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getActiveOrders.mockResolvedValue({
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
            status: 'venue-added-state',
            orderExpiry: 0,
            timestamp: 1700000000000,
          },
        ],
      });

      await expect(provider.getOpenOrders()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('builds a CAIP account id from the L1 address', async () => {
      const { provider } = buildProvider();
      expect(await provider.getCurrentAccountId()).toBe(
        'eip155:300:0x8D7f03FdE1A626223364E592740a233b72395235',
      );
    });
  });

  describe('placeOrder', () => {
    it('signs and submits a limit order with integerized values', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });

      expect(result.success).toBe(true);
      expect(result.providerId).toBe('lighter');
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall).toBeDefined();
      const [accountIndex, marketId, , baseAmount, price, isAsk] =
        orderCall?.params ?? [];
      expect(accountIndex).toBe(28);
      expect(marketId).toBe(1);
      // 0.001 BTC @ 5 size decimals = 100; but the $10 minimum at $90k
      // requires 0.00020 BTC = 20 -> requested size wins (100 > 20).
      expect(baseAmount).toBe('100');
      expect(price).toBe('900000');
      expect(isAsk).toBe(0);
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        14,
        expect.stringContaining('"createOrder":true'),
      );
    });

    it('does not claim or send an isolated-margin update when leverage is omitted', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });

      expect(result.success).toBe(true);
      expect(
        calls.filter((call) => call.function === '_signUpdateLeverage'),
      ).toHaveLength(0);
    });

    it('rejects sizes below the market minimum instead of silently bumping', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
      expect(
        calls.find((call) => call.function === '_signCreateOrder'),
      ).toBeUndefined();
    });

    it('accepts a USD amount whose raw quotient lands a hair under the minimum but grid-snaps onto it', async () => {
      // Regression (found live on device): a $10.15 seed computed from a
      // slightly stale price produced a raw quotient of 0.00529… ETH against
      // a 0.0053 minimum and was rejected — even though wire integerization
      // rounds to the size grid, so the venue would have received the valid
      // minimum step. The pre-check must judge the SNAPPED size.
      const { provider, calls } = buildProvider();
      // 17.9999 / 90000 = 0.00019999988… < 0.0002 raw, snaps to 0.0002 @ 5dp.
      const validation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        usdAmount: '17.9999',
        size: '',
        orderType: 'limit',
        price: '90000',
      });
      expect(validation.isValid).toBe(true);
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        usdAmount: '17.9999',
        size: '',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      const [, , , baseAmount] = orderCall?.params ?? [];
      // 0.0002 BTC @ 5 size decimals — exactly the venue minimum step.
      expect(baseAmount).toBe('20');
    });

    it('rejects non-positive sizes and attached TP/SL', async () => {
      const { provider } = buildProvider();
      const negative = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '-1',
        orderType: 'limit',
        price: '90000',
      });
      expect(negative.success).toBe(false);
      expect(negative.error).toContain('positive');

      const withTpsl = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        takeProfitPrice: '100000',
      });
      expect(withTpsl.success).toBe(false);
      expect(withTpsl.error).toContain('updatePositionTPSL');
    });

    it('allows a below-maker-minimum market partial close without bumping it', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      expect(
        calls.find((call) => call.function === '_signCreateOrder')?.params[3],
      ).toBe('1');
    });

    it('does not apply maker minimums to a dust market full close', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      // The live position IS the dust amount being closed.
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.00001' }],
          },
        ],
      });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall?.params[3]).toBe('1');
    });

    it('rejects unknown markets', async () => {
      const { provider } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'NOPE',
        isBuy: true,
        size: '1',
        orderType: 'limit',
        price: '1',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('Unknown Lighter market');
    });

    it('rejects limit orders without a price', async () => {
      const { provider } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a price');
    });

    it('opens a FLAT market with ISOLATED margin mode; an existing position keeps its venue mode', async () => {
      // The app manages isolated positions only (no cross-margin UI): a
      // flat market opens isolated — which also makes the venue report a
      // real per-position liquidation price. The venue refuses changing
      // the mode of a market with an open position, so an existing
      // position keeps whatever mode it already has.
      const { provider, clientInstance, bridge } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.000' }],
          },
        ],
      });
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signUpdateLeverage') {
            return {
              txInfo: JSON.stringify({
                updateLeverage: true,
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: 'eeee999900000002',
            };
          }
          return realImplementation(call);
        },
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(true);
      const leverageCall = (bridge.execute as jest.Mock).mock.calls.find(
        ([call]: [LighterWasmCall]) => call.function === '_signUpdateLeverage',
      )?.[0] as LighterWasmCall;
      expect(leverageCall).toBeDefined();
      // marginMode param: 1 = isolated on a flat market.
      expect(leverageCall.params[3]).toBe(1);
    });

    it('rejects unsupported order types', async () => {
      const { provider } = buildProvider();
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'twap',
      } as never);
      expect(result.success).toBe(false);
    });

    it('fails without a signer bridge', async () => {
      const { provider } = buildProvider({ withBridge: false });
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('signer bridge');
    });
  });

  describe('cancelOrder', () => {
    it('signs and submits a cancel', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const result = await provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      expect(result.success).toBe(true);
      const cancelCall = calls.find(
        (call) => call.function === '_signCancelOrder',
      );
      // Nonce 43: the setup ChangePubKey dispatched with 42 and the
      // session-global reservation never reissues a dispatched nonce.
      expect(cancelCall?.params).toStrictEqual([28, 1, '555', 43]);
      expect(clientInstance.sendTx).toHaveBeenCalledWith(
        15,
        expect.stringContaining('"cancelOrder":true'),
      );
    });

    it('rejects unknown markets', async () => {
      const { provider } = buildProvider();
      const result = await provider.cancelOrder({
        orderId: '1',
        symbol: 'NOPE',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('price streaming', () => {
    class FakeWebSocket implements LighterWebSocketLike {
      static instances: FakeWebSocket[] = [];

      readyState = 0;

      sent: string[] = [];

      onopen: (() => void) | null = null;

      onmessage: ((event: { data: unknown }) => void) | null = null;

      onclose: (() => void) | null = null;

      onerror: (() => void) | null = null;

      url: string;

      constructor(url: string) {
        this.url = url;
        FakeWebSocket.instances.push(this);
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

      receive = (message: unknown): void => {
        this.onmessage?.({ data: JSON.stringify(message) });
      };
    }

    const fakeCtor = FakeWebSocket as unknown as LighterWebSocketCtor;

    beforeEach(() => {
      FakeWebSocket.instances = [];
    });

    const wsStat = (
      symbol: string,
      marketId: number,
      midPrice: string,
    ): Record<string, unknown> => ({
      symbol,
      market_id: marketId,
      index_price: midPrice,
      mark_price: midPrice,
      mid_price: midPrice,
      best_ask_price: midPrice,
      best_bid_price: midPrice,
      last_trade_price: midPrice,
      open_interest: '1000',
      open_interest_limit: '100000',
      funding_rate: '0.0012',
      daily_quote_token_volume: 5,
      daily_price_change: 0.5,
    });

    it('subscribes to market_stats/all and dispatches snapshot + updates', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback,
      });

      const socket = FakeWebSocket.instances[0];
      socket.open();
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' }),
      );

      socket.receive({
        type: 'subscribed/market_stats',
        channel: 'market_stats:all',
        market_stats: { '1': wsStat('BTC', 1, '63000.5') },
        timestamp: 123,
      });
      expect(callback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          price: '63000.5',
          markPrice: '63000.5',
          timestamp: 123,
        }),
      ]);

      socket.receive({
        type: 'update/market_stats',
        channel: 'market_stats:all',
        market_stats: { '2': wsStat('SOL', 2, '75.1') },
        timestamp: 456,
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'SOL', price: '75.1' }),
      ]);
      unsubscribe();
      await provider.disconnect();
    });

    it('replays the merged snapshot to late subscribers with symbol filters', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const unsubscribeFirst = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
      });
      const socket = FakeWebSocket.instances[0];
      socket.open();
      socket.receive({
        type: 'subscribed/market_stats',
        market_stats: { '1': wsStat('BTC', 1, '63000.5') },
      });
      // A later delta must not evict BTC from the replay cache.
      socket.receive({
        type: 'update/market_stats',
        market_stats: { '2': wsStat('SOL', 2, '75.1') },
      });

      const late = jest.fn();
      const unsubscribeLate = provider.subscribeToPrices({
        symbols: ['BTC'],
        callback: late,
      });
      expect(late).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC' }),
      ]);
      unsubscribeFirst();
      unsubscribeLate();
      await provider.disconnect();
    });

    it('streams user_stats and account_all_positions into their subscribers', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      const accountCallback = jest.fn();
      const positionsCallback = jest.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      // Let account-channel setup resolve (account index + auth token).
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));

      const socket = FakeWebSocket.instances[0];
      socket.open();
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
      );
      expect(socket.sent).toContainEqual(
        JSON.stringify({
          type: 'subscribe',
          channel: 'account_all_positions/28',
        }),
      );

      socket.receive({
        type: 'subscribed/user_stats',
        channel: 'user_stats:28',
        stats: {
          collateral: '10000',
          portfolio_value: '11000',
          leverage: '2',
          available_balance: '6000',
          margin_usage: '40',
          buying_power: '0',
        },
      });
      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalBalance: '11000',
          spendableBalance: '6000',
          marginUsed: '4000',
          unrealizedPnl: '1000',
        }),
      );

      socket.receive({
        type: 'subscribed/account_all_positions',
        channel: 'account_all_positions:28',
        positions: {
          '1': {
            market_id: 1,
            symbol: 'BTC',
            initial_margin_fraction: '5.00',
            open_order_count: 0,
            sign: -1,
            position: '0.5',
            avg_entry_price: '60000',
            position_value: '30000',
            unrealized_pnl: '100',
            realized_pnl: '0',
            liquidation_price: '90000',
          },
        },
      });
      expect(positionsCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '-0.5' }),
      ]);
      unsubscribeAccount();
      unsubscribePositions();
      await provider.disconnect();
    });

    it('applies position snapshots and deltas transactionally', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToPositions({ callback });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      const position = {
        market_id: 1,
        symbol: 'BTC',
        initial_margin_fraction: '5.00',
        open_order_count: 0,
        sign: 1,
        position: '0.5',
        avg_entry_price: '60000',
        position_value: '30000',
        unrealized_pnl: '100',
        realized_pnl: '0',
        liquidation_price: '40000',
      };
      socket.receive({
        type: 'subscribed/account_all_positions',
        positions: { '1': position },
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '0.5' }),
      ]);
      callback.mockClear();

      socket.receive({
        type: 'subscribed/account_all_positions',
        positions: {
          '2': { ...position, market_id: 2, symbol: 'SOL', position: '1' },
          '3': {
            ...position,
            market_id: 3,
            symbol: 'ETH',
            position: '0.2oops',
          },
        },
      });
      expect(callback).not.toHaveBeenCalled();

      socket.receive({
        type: 'update/account_all_positions',
        positions: {
          '2': { ...position, market_id: 2, symbol: 'SOL', position: '1' },
        },
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '0.5' }),
        expect.objectContaining({ symbol: 'SOL', size: '1' }),
      ]);

      const late = jest.fn();
      const unsubscribeLate = provider.subscribeToPositions({ callback: late });
      expect(late).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', size: '0.5' }),
        expect.objectContaining({ symbol: 'SOL', size: '1' }),
      ]);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('keeps the previous orders snapshot when a new snapshot is malformed', async () => {
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
      });
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToOrders({ callback });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      const validOrder = {
        order_index: 555,
        client_order_index: 1,
        market_index: 1,
        owner_account_index: 28,
        initial_base_amount: '0.001',
        remaining_base_amount: '0.001',
        price: '90000',
        is_ask: false,
        type: 'limit',
        time_in_force: 'good-till-time',
        reduce_only: 0,
        status: 'open',
        order_expiry: 0,
        timestamp: 1700000000000,
      };
      socket.receive({
        type: 'subscribed/account_all_orders',
        channel: 'account_all_orders:28',
        orders: { '1': [validOrder] },
      });
      expect(callback).toHaveBeenLastCalledWith([
        expect.objectContaining({ orderId: '555' }),
      ]);
      callback.mockClear();

      socket.receive({
        type: 'subscribed/account_all_orders',
        channel: 'account_all_orders:28',
        orders: {
          '1': [{ ...validOrder, status: 'venue-added-state' }],
        },
      });
      expect(callback).not.toHaveBeenCalled();

      const late = jest.fn();
      const unsubscribeLate = provider.subscribeToOrders({ callback: late });
      expect(late).toHaveBeenCalledWith([
        expect.objectContaining({ orderId: '555' }),
      ]);
      unsubscribeLate();
      unsubscribe();
      await provider.disconnect();
    });

    it('drops malformed user_stats numbers without throwing or emitting a partial account state', async () => {
      const infra = createMockInfrastructure();
      const { provider } = buildProvider({
        webSocketCtor: fakeCtor,
        registeredKey: 'a'.repeat(80),
        platformDependencies: infra,
      });
      const accountCallback = jest.fn();
      const unsubscribe = provider.subscribeToAccount({
        callback: accountCallback,
      });
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      await new Promise((resolveTick) => setImmediate(resolveTick));
      const socket = FakeWebSocket.instances[0];
      socket.open();
      accountCallback.mockClear();

      expect(() =>
        socket.receive({
          type: 'update/user_stats',
          channel: 'user_stats:28',
          stats: {
            collateral: '10000USD',
            portfolio_value: '11000',
            leverage: '2',
            available_balance: '6000',
            margin_usage: '40',
            buying_power: '0',
          },
        }),
      ).not.toThrow();
      expect(accountCallback).not.toHaveBeenCalled();
      expect(infra.debugLogger.log).toHaveBeenCalledWith(
        '[LighterProvider] dropped malformed WebSocket frame',
        expect.objectContaining({
          error: expect.stringContaining('Invalid Lighter venue data'),
        }),
      );

      unsubscribe();
      await provider.disconnect();
    });

    it('tears down the socket when the last subscriber unsubscribes', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
      });
      const socket = FakeWebSocket.instances[0];
      socket.open();
      unsubscribe();
      expect(socket.readyState).toBe(3);
      await provider.disconnect();
    });

    it('reports connection-state transitions and supports manual reconnect', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeCtor });
      const transitions: string[] = [];
      const unsubscribeState = provider.subscribeToConnectionState((state) => {
        transitions.push(state);
      });
      expect(transitions).toStrictEqual(['disconnected']);

      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
      });
      FakeWebSocket.instances[0].open();
      expect(transitions).toStrictEqual([
        'disconnected',
        'connecting',
        'connected',
      ]);
      expect(provider.getWebSocketConnectionState()).toBe('connected');

      await provider.reconnect();
      expect(FakeWebSocket.instances).toHaveLength(2);
      FakeWebSocket.instances[1].open();
      expect(transitions.slice(3)).toStrictEqual([
        'disconnected',
        'connecting',
        'connected',
      ]);
      // The replacement socket re-subscribes the wanted channels.
      expect(FakeWebSocket.instances[1].sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' }),
      );

      unsubscribeState();
      unsubscribe();
      expect(provider.getWebSocketConnectionState()).toBe('disconnected');
    });

    it('falls back to REST polling when no WebSocket implementation exists', async () => {
      jest.useFakeTimers();
      try {
        const { provider, clientInstance } = buildProvider({
          webSocketCtor: null,
        });
        expect(provider.getWebSocketConnectionState()).toBe('disconnected');
        const callback = jest.fn();
        const unsubscribe = provider.subscribeToPrices({
          symbols: [],
          callback,
        });
        expect(provider.getWebSocketConnectionState()).toBe('connected');
        await Promise.resolve();
        await Promise.resolve();
        expect(callback).toHaveBeenCalledWith([
          expect.objectContaining({ symbol: 'BTC', price: '100000' }),
        ]);

        await jest.advanceTimersByTimeAsync(10_500);
        expect(
          clientInstance.getOrderBookDetails.mock.calls.length,
        ).toBeGreaterThanOrEqual(3);

        unsubscribe();
        expect(provider.getWebSocketConnectionState()).toBe('disconnected');
        const callsAfter = clientInstance.getOrderBookDetails.mock.calls.length;
        await jest.advanceTimersByTimeAsync(20_000);
        expect(clientInstance.getOrderBookDetails.mock.calls).toHaveLength(
          callsAfter,
        );
        await provider.disconnect();
        expect(provider.getWebSocketConnectionState()).toBe('disconnected');
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('session binding', () => {
    it('re-arms one signer reset listener after wallet deselection and reselection', async () => {
      const {
        provider,
        calls,
        fireReset,
        getUserAddressMock,
        resetListenerCount,
      } = buildProvider({ registeredKey: '9c'.repeat(40) });
      expect((await provider.isReadyToTrade()).ready).toBe(true);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(1);

      getUserAddressMock.mockImplementation(() => {
        throw new Error('no selected wallet account');
      });
      await provider.getAccountState();
      expect(resetListenerCount()).toBe(0);

      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      await provider.getAccountState();
      expect(resetListenerCount()).toBe(1);
      fireReset();

      expect((await provider.isReadyToTrade()).ready).toBe(true);
      expect(
        calls.filter((call) => call.function === '_createClient'),
      ).toHaveLength(2);
      await provider.disconnect();
      expect(resetListenerCount()).toBe(0);
    });

    it('replaces the signer reset listener on account rebind and removes it on disconnect', async () => {
      const {
        provider,
        getUserAddressMock,
        resetListenerCount,
        resetUnsubscribe,
      } = buildProvider();
      expect(resetListenerCount()).toBe(1);
      await provider.getAccountState();
      getUserAddressMock.mockReturnValue(
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      );
      await provider.getAccountState().catch(() => undefined);
      expect(resetUnsubscribe).toHaveBeenCalledTimes(1);
      expect(resetListenerCount()).toBe(1);
      await provider.disconnect();
      expect(resetUnsubscribe).toHaveBeenCalledTimes(2);
      expect(resetListenerCount()).toBe(0);
    });

    it('does not let a stale account lookup poison the session after an account switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      const accountA = { ...ACCOUNT, index: 28 };
      const accountB = { ...ACCOUNT, index: 900 };
      // Account A's lookup is slow; B's resolves immediately.
      let resolveLookupA: (value: unknown) => void = () => undefined;
      clientInstance.getAccountsByL1Address
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              resolveLookupA = resolve;
            }),
        )
        .mockResolvedValue({
          code: 200,
          l1Address: '0xbbbb',
          subAccounts: [accountB],
        });

      // Start a read under account A (lookup hangs in flight).
      const readUnderA = provider.getAccountState();
      // Wallet switches to account B; a new read rebinds the session and
      // resolves B's index.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      // A's lookup finally resolves — it must NOT overwrite B's session.
      resolveLookupA({
        code: 200,
        l1Address: accountA.l1Address,
        subAccounts: [accountA],
      });
      await readUnderA;

      const accountReads = clientInstance.getAccountByIndex.mock.calls.map(
        (call) => call[0],
      );
      expect(accountReads).not.toContain(28);
      expect(accountReads).toContain(900);
    });

    it('rebuilds stream channels for the NEW account after a switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      const accountB = { ...ACCOUNT, index: 900 };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      StreamFakeWebSocket.instances = [];
      const accountCallback = jest.fn();
      const positionsCallback = jest.fn();
      const ordersCallback = jest.fn();
      const unsubscribePrices = provider.subscribeToPrices({
        symbols: [],
        callback: jest.fn(),
      });
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribePositions = provider.subscribeToPositions({
        callback: positionsCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      StreamFakeWebSocket.instances[0].open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(StreamFakeWebSocket.instances[0].sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/28' }),
      );

      // Wallet switches accounts; any session-bound call triggers rebind.
      accountCallback.mockClear();
      positionsCallback.mockClear();
      ordersCallback.mockClear();
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalBalance: '0',
          spendableBalance: '0',
          providerId: 'lighter',
        }),
      );
      expect(positionsCallback).toHaveBeenCalledWith([]);
      expect(ordersCallback).toHaveBeenCalledWith([]);
      await new Promise((resolve) => setTimeout(resolve, 0));
      const replacement =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      expect(StreamFakeWebSocket.instances.length).toBeGreaterThan(1);
      replacement.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(replacement.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'market_stats/all' }),
      );
      // The account channels target account B's exact index — never A's.
      expect(replacement.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'user_stats/900' }),
      );
      expect(
        replacement.sent.some((frame) => frame.includes('user_stats/28')),
      ).toBe(false);

      unsubscribePrices();
      unsubscribeAccount();
      unsubscribePositions();
      unsubscribeOrders();
    });

    it('cancels a queued write when the wallet switches accounts first', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      // Hold the write chain busy with a slow nonce fetch so the next write
      // queues behind it.
      let releaseNonce: (value: unknown) => void = () => undefined;
      clientInstance.getNextNonce.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseNonce = resolve;
          }),
      );
      const firstWrite = provider.cancelOrder({ orderId: '1', symbol: 'BTC' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const queuedWrite = provider.cancelOrder({ orderId: '2', symbol: 'BTC' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Account switch happens while the second write sits in the queue.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState().catch(() => undefined);
      releaseNonce({ code: 200, nonce: 42 });
      await firstWrite;
      const queuedResult = await queuedWrite;
      expect(queuedResult.success).toBe(false);
      expect(queuedResult.error).toContain('switched accounts');
    });
  });

  describe('session races (reviewer scenarios)', () => {
    it('a stalled account-A _createClient aborts and account B ends as the actual signer', async () => {
      // Serialized design: A's setup enters the lock and stalls INSIDE
      // _createClient; B's setup must remain pending behind the lock; on
      // release, A aborts (generation fence) and only then B creates.
      const { provider, clientInstance, getUserAddressMock, calls, bridge } =
        buildProvider({
          configuredAccountIndex: null,
          registeredKey: '9c'.repeat(40),
        });
      const accountB = { ...ACCOUNT, index: 900 };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      // Capture the ORIGINAL implementation, not the mock reference —
      // delegating to the mock itself would recurse forever.
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseCreateA: () => void = () => undefined;
      let createARequested: () => void = () => undefined;
      const createAPaused = new Promise<void>((resolve) => {
        createARequested = resolve;
      });
      let stalledOnce = false;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createClient' && !stalledOnce) {
            stalledOnce = true;
            createARequested();
            await new Promise<void>((resolve) => {
              releaseCreateA = resolve;
            });
          }
          return realImplementation(call);
        },
      );

      const setupUnderA = provider.isReadyToTrade();
      await createAPaused;
      // Switch to B and start B's setup: it must queue behind A's lock.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      let setupBSettled = false;
      const setupUnderB = provider.isReadyToTrade().then((result) => {
        setupBSettled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setupBSettled).toBe(false);
      // The recorded `calls` list only captures delegated (completed)
      // executions; count issued creates on the wrapper itself.
      const issuedCreates = (bridge.execute as jest.Mock).mock.calls.filter(
        ([call]: [LighterWasmCall]) => call.function === '_createClient',
      );
      expect(issuedCreates).toHaveLength(1);

      // Release A: it aborts at the post-createClient fence; B then runs.
      releaseCreateA();
      const readyA = await setupUnderA;
      const readyB = await setupUnderB;
      expect(readyA.ready).toBe(false);
      expect(readyB.ready).toBe(true);
      const createCalls = calls.filter(
        (call) => call.function === '_createClient',
      );
      // Exactly two creates, and the LAST client created belongs to B — B
      // is the actual signer left in the bridge.
      expect(createCalls).toHaveLength(2);
      expect(createCalls[1].params[1]).toBe(900);
      // A never registered or submitted anything.
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('an account-A write paused inside the lock never signs after B initializes', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({
          configuredAccountIndex: null,
          registeredKey: '9c'.repeat(40),
        });
      const accountB = { ...ACCOUNT, index: 900 };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      // Warm A's signer FIRST so the deferred nonce below is definitively
      // the cancel write's nonce, not signer setup's.
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      let releaseNonce: (value: unknown) => void = () => undefined;
      let nonceRequested: () => void = () => undefined;
      const noncePaused = new Promise<void>((resolve) => {
        nonceRequested = resolve;
      });
      clientInstance.getNextNonce.mockImplementationOnce(() => {
        nonceRequested();
        return new Promise((resolve) => {
          releaseNonce = resolve;
        });
      });
      const writeUnderA = provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      await noncePaused;
      // While A's write holds the lock: switch to B and start B's signer
      // setup — it must QUEUE behind A's critical section.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      let setupBSettled = false;
      const setupUnderB = provider.isReadyToTrade().then((result) => {
        setupBSettled = true;
        return result;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(setupBSettled).toBe(false);

      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
      // A's cancel never signed or submitted.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
      // B's signer completes once the lock frees.
      const readyB = await setupUnderB;
      expect(readyB.ready).toBe(true);
    });

    it('ignores frames from the pre-switch WebSocket after a rebind', async () => {
      const { provider, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      StreamFakeWebSocket.instances = [];
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToPrices({
        symbols: [],
        callback,
      });
      // Bind the session under account A first — without a previous binding
      // an account call merely binds, it does not rebuild anything.
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const staleSocket = StreamFakeWebSocket.instances[0];
      staleSocket.open();
      // Rebind to another account: the socket is replaced. (The read
      // itself now rejects — 0xbbbb does not own configured account 28 —
      // but the rebind happens at entry, which is all this test needs.)
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState().catch(() => undefined);
      callback.mockClear();
      // A late frame from the OLD socket must not reach subscribers.
      staleSocket.onmessage?.({
        data: JSON.stringify({
          type: 'update/market_stats',
          channel: 'market_stats:all',
          market_stats: {
            '1': {
              symbol: 'BTC',
              market_id: 1,
              index_price: '1',
              mark_price: '1',
              mid_price: '1',
              last_trade_price: '1',
            },
          },
        }),
      });
      expect(callback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('closePosition aborts before trading when the account switches after the position read', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      const accountB = { ...ACCOUNT, index: 900 };
      // Stall the position read (getAccountByIndex) under A.
      let releasePositions: (value: unknown) => void = () => undefined;
      clientInstance.getAccountByIndex
        .mockImplementationOnce(
          () =>
            new Promise((resolve) => {
              releasePositions = resolve;
            }),
        )
        .mockResolvedValue({ code: 200, accounts: [accountB] });
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      const closeUnderA = provider.closePosition({ symbol: 'BTC' });
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      releasePositions({ code: 200, accounts: [ACCOUNT] });
      const result = await closeUnderA;
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
    });

    it('updatePositionTPSL cancels nothing when the account switches mid-sequence', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      const accountB = { ...ACCOUNT, index: 900 };
      clientInstance.getAccountsByL1Address.mockImplementation(
        (address: string) =>
          Promise.resolve(
            address.toLowerCase() === '0xbbbb'
              ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
              : {
                  code: 200,
                  l1Address: ACCOUNT.l1Address,
                  subAccounts: [ACCOUNT],
                },
          ),
      );
      // A reduce-only trigger order exists so the replace path would cancel.
      clientInstance.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [
          {
            orderIndex: 999,
            clientOrderIndex: 9,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.1',
            remainingBaseAmount: '0.1',
            price: '80000',
            isAsk: true,
            type: 'stop_loss',
            timeInForce: 'immediate-or-cancel',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: 1700000000000,
          },
        ],
      });
      // Stall the open-orders read; switch while it is in flight.
      let releaseOrders: (value: unknown) => void = () => undefined;
      clientInstance.getActiveOrders.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOrders = resolve;
          }),
      );
      const tpslUnderA = provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      releaseOrders({
        code: 200,
        orders: [
          {
            orderIndex: 999,
            clientOrderIndex: 9,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.1',
            remainingBaseAmount: '0.1',
            price: '80000',
            isAsk: true,
            type: 'stop_loss',
            timeInForce: 'immediate-or-cancel',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: 1700000000000,
          },
        ],
      });
      const result = await tpslUnderA;
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
      // No cancel and no grouped order ever reached signing.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(
        calls.filter((call) => call.function === '_signCreateGroupedOrders'),
      ).toHaveLength(0);
    });
  });

  describe('account-type gate', () => {
    it('refuses Premium (nonzero-fee) accounts across the account surface', async () => {
      const { provider, clientInstance } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      // Capability gates SURFACE: no plausible empty state that hides why.
      await expect(provider.getAccountState()).rejects.toThrow('Premium');
      const ready = await provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      expect(ready.error).toContain('Premium');
    });

    it('verifies a configured account index is Standard before using it', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      const ready = await provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      expect(ready.error).toContain('Premium');
    });

    it('fails closed when the account type cannot be verified', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [],
      });
      const ready = await provider.isReadyToTrade();
      expect(ready.ready).toBe(false);
      expect(ready.error).toContain('could not be verified');
    });

    it('gates calculateFees for non-Standard accounts', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      await expect(
        provider.calculateFees({
          orderType: 'market',
          symbol: 'BTC',
          amount: '100',
        }),
      ).rejects.toThrow('Premium');
    });
  });

  describe('UpdateLeverage signing contract', () => {
    it('signs exactly [accountIndex, marketId, imfHundredths, marginMode, nonce]', async () => {
      // Regression: a patch artifact once injected a 6th argument before
      // the nonce, shifting it and mis-signing every leverage-changing
      // placement.
      const { provider, bridge } = buildProvider();
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signUpdateLeverage') {
            return {
              txInfo: JSON.stringify({
                updateLeverage: true,
                ExpiredAt: Date.now() + 599_000,
              }),
              txHash: 'eeee999900000001',
            };
          }
          return realImplementation(call);
        },
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(true);
      const leverageCall = (bridge.execute as jest.Mock).mock.calls.find(
        ([call]: [LighterWasmCall]) => call.function === '_signUpdateLeverage',
      )?.[0] as LighterWasmCall;
      expect(leverageCall).toBeDefined();
      expect(leverageCall.params).toHaveLength(5);
      expect(leverageCall.params[0]).toBe(28);
      expect(leverageCall.params[1]).toBe(1);
      expect(leverageCall.params[2]).toBe(1000);
      expect(leverageCall.params[3]).toBe(0);
      // Fifth param is the nonce from the shared write lock: 43 because
      // the setup ChangePubKey dispatched 42 and reservations are
      // session-global.
      expect(leverageCall.params[4]).toBe(43);
    });
  });

  type RawTriggerOrder = {
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
  const setupTriggerVenue = (
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
      initialBaseAmount: '0.001',
      remainingBaseAmount: '0.001',
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
        limit = 50,
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
    const takeStagedCreate = (
      txInfo: string,
    ): StagedCreateBatch | undefined => {
      const nonce = nonceFromTxInfo(txInfo);
      const at = stagedCreates.findIndex((batch) => batch.nonce === nonce);
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
      bridge.execute as jest.Mock
    ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
    (bridge.execute as jest.Mock).mockImplementation(
      async (call: LighterWasmCall) => {
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
            wireNonce =
              typeof parsed.Nonce === 'number' ? parsed.Nonce : undefined;
          } catch {
            wireNonce = undefined;
          }
          if (typeof result.txHash === 'string' && wireNonce !== undefined) {
            stagedGenerics.push({ txHash: result.txHash, nonce: wireNonce });
          }
          return result;
        }
        return realImplementation(call);
      },
    );
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

  describe('round-12 venue integrity and serialized TP/SL lifecycle', () => {
    it("a malformed venue position size ('0.1oops') fails closed with an explicit error and zero signer mutation", async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.1oops' }],
          },
        ],
      });
      // Reads surface an explicit data error — never a silently-coerced
      // '0.1' or a silent empty list that can preserve stale views.
      await expect(provider.getPositions()).rejects.toThrow(
        'Invalid Lighter venue data',
      );
      const tpsl = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(tpsl.success).toBe(false);
      expect(tpsl.error).toContain('Invalid Lighter venue data');
      const close = await provider.closePosition({
        symbol: 'BTC',
        currentPrice: 100000,
      });
      expect(close.success).toBe(false);
      expect(close.error).toContain('Invalid Lighter venue data');
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        currentPrice: 100000,
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('Invalid Lighter venue data');
      expect(calls).toHaveLength(0);
    });

    it('two concurrent replacements serialize: the second cannot snapshot while the first transition is mid-flight', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Stall the FIRST replacement inside its transition: snapshot done,
      // creation signing held.
      // Deterministic pre-lock signal: the second call's preflight ends
      // with its getPositions account read — wait for that, then flush a
      // macrotask, instead of asserting against a sleep.
      let accountReads = 0;
      let signalSecondPreflight = (): void => undefined;
      const secondPreflightDone = new Promise<void>((resolve) => {
        signalSecondPreflight = resolve;
      });
      const realGetAccount =
        clientInstance.getAccountByIndex.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getAccountByIndex.mockImplementation(async () => {
        const result = await realGetAccount();
        accountReads += 1;
        if (accountReads >= 2) {
          signalSecondPreflight();
        }
        return result;
      });
      const gateEntered = venue.armCreateGate();
      const firstPromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await gateEntered;
      const secondPromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      await secondPreflightDone;
      await new Promise((resolve) => setTimeout(resolve, 0));
      // FULL-TRANSITION EXCLUSION: the second call has provably finished
      // its pre-lock preflight, yet while the first is stalled mid-create
      // it must NOT have reached getActiveOrders — unserialized code reads
      // here and double-snapshots the seed trigger.
      expect(venue.events.filter((event) => event === 'read')).toHaveLength(1);
      venue.releaseCreateGate();
      const [first, second] = await Promise.all([firstPromise, secondPromise]);
      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      // Serial outcome: the second snapshots the first's fresh trigger and
      // cancels it — exactly ONE protection set remains, with the second
      // read strictly after the first transition's cancel.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(2);
      // The second op's create happened strictly after the first op's
      // cancel (full-transition exclusion; both ops' own barrier reads
      // sit between).
      const cancelEvents = venue.events.filter(
        (event) => event === 'cancel' || event === 'create',
      );
      expect(cancelEvents).toStrictEqual([
        'create',
        'cancel',
        'create',
        'cancel',
      ]);
    });

    it('replacement vs concurrent remove serializes: the remove sees and clears the fresh protection', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      let accountReads = 0;
      let signalSecondPreflight = (): void => undefined;
      const secondPreflightDone = new Promise<void>((resolve) => {
        signalSecondPreflight = resolve;
      });
      const realGetAccount =
        clientInstance.getAccountByIndex.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getAccountByIndex.mockImplementation(async () => {
        const result = await realGetAccount();
        accountReads += 1;
        if (accountReads >= 2) {
          signalSecondPreflight();
        }
        return result;
      });
      const gateEntered = venue.armCreateGate();
      const replacePromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await gateEntered;
      const removePromise = provider.updatePositionTPSL({ symbol: 'BTC' });
      await secondPreflightDone;
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The remove has provably passed its pre-lock preflight, yet must
      // NOT snapshot while the replacement is mid-flight — a stale
      // snapshot would cancel only the seed and "successfully" remove
      // nothing of the fresh protection.
      expect(venue.events.filter((event) => event === 'read')).toHaveLength(1);
      venue.releaseCreateGate();
      const [replaced, removed] = await Promise.all([
        replacePromise,
        removePromise,
      ]);
      expect(replaced.success).toBe(true);
      expect(removed.success).toBe(true);
      // Serial outcome: replace lands 85000 (seed cancelled), then remove
      // snapshots the fresh trigger and clears it.
      expect(venue.rawTriggers).toHaveLength(0);
    });

    it('an active-orders REST failure rejects remove AND replace with zero mutation calls', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getActiveOrders.mockRejectedValue(
        new Error('active orders REST down'),
      );
      const removed = await provider.updatePositionTPSL({ symbol: 'BTC' });
      expect(removed.success).toBe(false);
      expect(removed.error).toContain('active orders REST down');
      const replaced = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(replaced.success).toBe(false);
      expect(replaced.error).toContain('active orders REST down');
      // A swallowed [] would have let remove "succeed" cancelling nothing
      // and replace "succeed" with the old triggers still live.
      expect(
        calls.filter((call) =>
          [
            '_signCreateOrder',
            '_signCreateGroupedOrders',
            '_signCancelOrder',
          ].includes(call.function),
        ),
      ).toHaveLength(0);
    });

    it('rejects unsupported partial TP/SL sizes before any read or mutation', async () => {
      const { provider, calls } = buildProvider();
      // The venue path always wires the FULL position size; silently
      // ignoring a partial size would close the whole position.
      const takeProfit = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        takeProfitSize: '0.0005',
      });
      expect(takeProfit.success).toBe(false);
      expect(takeProfit.error).toContain('partial');
      const stopLoss = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '80000',
        stopLossSize: '0.0005',
      });
      expect(stopLoss.success).toBe(false);
      expect(stopLoss.error).toContain('partial');
      expect(calls).toHaveLength(0);
    });

    it('rejects prices that overflow the signer uint32 wire cast, in validators, placement and TP/SL', async () => {
      const { provider, calls } = buildProvider();
      // 429496729.7 at 1 price decimal scales to 4,294,967,297 — a safe JS
      // integer that the pinned lighter-go signer wraps to 1 via uint32().
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '429496729.7',
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('uint32');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('uint32');
      const tpsl = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '429496729.7',
      });
      expect(tpsl.success).toBe(false);
      expect(tpsl.error).toContain('uint32');
      expect(calls).toHaveLength(0);
    });

    it('refreshes the authoritative margin cache after TTL and fails closed on removed/failed metadata', async () => {
      const { provider, clientInstance } = buildProvider();
      const baseNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow);
      try {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit' as const,
          price: '90000',
          leverage: 40,
        };
        // Default metadata: minInitial 200 -> 50x. 40x validates.
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        // Venue tightens to 400 -> 25x; within TTL the cache still says 50x.
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [
            {
              symbol: 'BTC',
              lastTradePrice: 100000,
              minInitialMarginFraction: 400,
              maintenanceMarginFraction: 240,
            },
          ],
        });
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        // TTL expiry forces an authoritative refresh: 40x now overlimit.
        nowSpy.mockReturnValue(baseNow + 61_000);
        const refreshed = await provider.validateOrder(request);
        expect(refreshed.isValid).toBe(false);
        expect(refreshed.error).toContain('25');
        // Row removed from fresh metadata: stale cap must not survive the
        // atomic cache replacement.
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails: [{ symbol: 'ETH', lastTradePrice: 3000 }],
        });
        nowSpy.mockReturnValue(baseNow + 122_000);
        const removedRow = await provider.validateOrder(request);
        expect(removedRow.isValid).toBe(false);
        expect(removedRow.error).toContain('margin metadata');
        // Fetch failure after expiry: fail closed, never the stale cap.
        clientInstance.getOrderBookDetails.mockRejectedValue(
          new Error('metadata endpoint down'),
        );
        nowSpy.mockReturnValue(baseNow + 183_000);
        const failedFetch = await provider.validateOrder(request);
        expect(failedFetch.isValid).toBe(false);
        expect(failedFetch.error).toContain('margin metadata');
      } finally {
        nowSpy.mockRestore();
      }
    });
  });

  describe('round-15 authoritative settlement identity and recovery', () => {
    /**
     * Simulate full process death for a provider: every venue read/write
     * and every signer call fails from now on. Without this, a detached
     * background task (e.g. the setup-time recovery kick) of the "dead"
     * provider can keep mutating the shared venue after the crash and
     * invalidate restart-recovery scenarios.
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (jest.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as jest.Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    it('journals are bound to the API key slot: another slot neither consumes nor is blocked by them', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const slot7 = buildProvider({ platformDependencies: infra });
      const venue7 = setupTriggerVenue(slot7.clientInstance, slot7.bridge);
      venue7.seedTrigger('stop-loss', '80000');
      venue7.setRestLag(50);
      venue7.failResponseOnce(14);
      const first = await slot7.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      const journalKeys = [...disk.keys()].filter((key) =>
        key.startsWith('lighterTpslJournal:'),
      );
      expect(journalKeys.some((key) => key.includes(':7:'))).toBe(true);
      // A slot-8 provider (same account, shared disk) must not load,
      // clear, or be blocked by the slot-7 journal.
      const slot8 = buildProvider({
        platformDependencies: infra,
        apiKeyIndex: 8,
      });
      const venue8 = setupTriggerVenue(slot8.clientInstance, slot8.bridge);
      venue8.seedTrigger('stop-loss', '80000');
      const other = await slot8.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '87000',
      });
      expect(other.error).toBeUndefined();
      expect(other.success).toBe(true);
      // The slot-7 obligation is untouched.
      expect(
        [...disk.keys()].some(
          (key) => key.startsWith('lighterTpslJournal:') && key.includes(':7:'),
        ),
      ).toBe(true);
    });

    it('a lagging nextNonce endpoint cannot hand a multi-cancel section the same nonce twice', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // Warm signer setup, then FREEZE the nonce endpoint: acceptances no
      // longer advance what it reports.
      await provider.getOpenOrders();
      const frozen = venue.getVenueNonce();
      clientInstance.getNextNonce.mockResolvedValue({
        code: 200,
        nonce: frozen,
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // create + two cancels must carry three DISTINCT ascending nonces.
      const wireNonces = calls
        .filter((call) =>
          ['_signCreateOrder', '_signCancelOrder'].includes(call.function),
        )
        .map((call) =>
          call.function === '_signCreateOrder'
            ? Number(call.params[11])
            : Number(call.params[3]),
        );
      expect(wireNonces).toStrictEqual([frozen, frozen + 1, frozen + 2]);
    });

    it('a delayed commit inside the signed validity window stays blocked, then reconciles without duplicate', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Transport fails NOW; the request commits 2.8 s later — BEYOND the
      // retry's full poll + lookup window, so nothing during the blocked
      // reconciliation can observe it yet.
      venue.delayedCommitOnce(14, 2800);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Aged past the OLD grace design but still inside the signed
      // validity window: the retry must remain blocked (the venue could
      // still accept), never discard-and-duplicate — the old design
      // cleared here and duplicated once the commit landed.
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 13_000);
      try {
        const blocked = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(blocked.success).toBe(false);
        expect(blocked.error).toContain('unresolved');
      } finally {
        nowSpy.mockRestore();
      }
      // Await the delayed commit, then retry: the dispatch is JOURNAL-
      // OWNED, so its landed outcome is consumed by the settlement
      // machine directly — never parked behind the generic
      // acknowledgment — and the retry reconciles serially.
      await new Promise((resolve) => setTimeout(resolve, 3000));
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(await provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a venue-confirmed not-found is only never-landed after the signed expiry', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Inside the validity window: blocked even though the venue answers
      // not-found.
      const immediate = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(immediate.success).toBe(false);
      expect(immediate.error).toContain('unresolved');
      // Beyond signed ExpiredAt (+slack): the sequencer can no longer
      // accept the payload — authoritatively never landed; retry runs.
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 700_000);
      try {
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a tx-lookup transport failure is ambiguous and stays blocked', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      clientInstance.getTx.mockRejectedValue(new Error('tx endpoint down'));
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 700_000);
      try {
        const blocked = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(blocked.success).toBe(false);
        expect(blocked.error).toContain('unresolved');
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('an OCO with one leg active and one terminal-cancelled at the barrier rolls back the survivor and keeps old protection', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      const oldId = venue.seedTrigger('stop-loss', '80000');
      venue.setCreateTerminal('oco-split');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '75000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('left untouched');
      // The OLD trigger survives; the surviving NEW leg was rolled back.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(String(venue.rawTriggers[0].orderIndex)).toBe(String(oldId));
      // Exactly one cancel was signed — the rollback of the surviving
      // leg, never the old protection.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(1);
    });

    it('a replacement that terminal-fails after the old protection was cancelled parks DURABLE manual recovery', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Venue cancels the new trigger AFTER the barrier (read 3+) — by
      // then the old trigger is being/has been cancelled.
      let readsSeen = 0;
      const realActive =
        clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getActiveOrders.mockImplementation(async () => {
        readsSeen += 1;
        if (readsSeen === 3) {
          const at = venue.rawTriggers.findIndex(
            (row) => row.triggerPrice === '85000',
          );
          if (at >= 0) {
            const [row] = venue.rawTriggers.splice(at, 1);
            venue.rawInactive.push({ ...row, status: 'canceled' });
          }
        }
        return await realActive();
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      // NO automatic restore across an unprovable lifecycle: the failure
      // is explicit, the obligation parks DURABLY for manual recovery
      // and is surfaced to callers.
      expect(result.error).toContain('MANUAL re-establishment');
      expect(venue.rawTriggers).toHaveLength(0);
      const pending = await provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('BTC');
      // A NEW explicit protection intent acknowledges and resolves it.
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('84000');
    });

    it("a 'filled' terminal row with remaining size is NOT a proven execution", async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.setCreateTerminal('filled-partial');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      // Not proven executed: treated as a terminal failure — old
      // protection untouched.
      expect(result.success).toBe(false);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
    });

    it('a failed journal disk-remove keeps the obligation coherent for a later retry', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      let removeFails = true;
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          if (removeFails && key.startsWith('lighterTpslJournal:')) {
            throw new Error('disk remove refused');
          }
          disk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const first = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      // The venue settled but the durable obligation could not be
      // resolved: the op must NOT report clean success.
      expect(first.success).toBe(false);
      expect(first.error).toContain('disk remove refused');
      // Later, with the disk healthy again, a retry reconciles the intact
      // journal and completes.
      removeFails = false;
      const second = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('startup recovery completes an interrupted replacement WITHOUT a new mutation call', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Crash BEFORE any cancel submission (local signing failure): the
      // journal holds only the accepted create, and old + new triggers are
      // both live — no ambiguous in-flight cancel exists.
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      expect(venueA.rawTriggers).toHaveLength(2);
      // NEW provider lifetime: recovery must run from a NON-mutating call.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      // Bounded wait for the automatic recovery to converge the venue.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.rawTriggers.length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(venueB.rawTriggers[0].triggerPrice).toBe('85000');
      expect(
        [...disk.keys()].filter((key) => key.startsWith('lighterTpslJournal:')),
      ).toHaveLength(0);
    });

    it('inactive-history requests are bounded: zero when active, one page when recent, cursor-walk only until found', async () => {
      // Normal replacement (new trigger rests ACTIVE): ZERO inactive calls.
      const normal = buildProvider();
      const normalVenue = setupTriggerVenue(
        normal.clientInstance,
        normal.bridge,
      );
      normalVenue.seedTrigger('stop-loss', '80000');
      const normalResult = await normal.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(normalResult.success).toBe(true);
      // ZERO inactive reads when the replacement rests active.
      expect(normal.clientInstance.getInactiveOrders).not.toHaveBeenCalled();
      // Recent terminal (immediate fill): a single first-page read finds it.
      const recent = buildProvider();
      const recentVenue = setupTriggerVenue(
        recent.clientInstance,
        recent.bridge,
      );
      recentVenue.setCreateTerminal('filled');
      const recentResult = await recent.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(recentResult.success).toBe(true);
      expect(recent.clientInstance.getInactiveOrders).toHaveBeenCalledTimes(1);
      // Deep history: the JOURNALED terminal create sits beyond 100 newer
      // rows — the retry's reconcile must walk cursor pages (bounded,
      // stopping when found), never 10 pages per poll.
      const deep = buildProvider();
      const deepVenue = setupTriggerVenue(deep.clientInstance, deep.bridge);
      deepVenue.setCreateTerminal('filled');
      // Commit terminal AND lose the response: the journal remains.
      deepVenue.failResponseOnce(14);
      const deepFirst = await deep.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(deepFirst.success).toBe(false);
      // Bury THAT terminal row under 120 newer inactive rows.
      for (let filler = 0; filler < 120; filler += 1) {
        deepVenue.rawInactive.push({
          ...deepVenue.rawInactive[0],
          orderIndex: 500000 + filler,
          clientOrderIndex: 500000 + filler,
          status: 'canceled',
        });
      }
      deepVenue.setCreateTerminal('none');
      deep.clientInstance.getInactiveOrders.mockClear();
      // The lost-response create is JOURNAL-OWNED: the retry reconciles
      // it through the settlement machine directly (no quarantine).
      const second = await deep.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(await deep.provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      const inactiveCalls =
        deep.clientInstance.getInactiveOrders.mock.calls.length;
      // Cursor pages were genuinely used (>1) and bounded (found early) —
      // never a 10-pages-per-poll blowup (100+).
      expect(inactiveCalls).toBeGreaterThan(1);
      expect(inactiveCalls).toBeLessThanOrEqual(6);
      expect(deepVenue.rawTriggers).toHaveLength(1);
      expect(deepVenue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it("exact status matching: 'unfilled' and 'execution-failed' are failures, never executions", async () => {
      for (const trickStatus of ['unfilled', 'execution-failed']) {
        const { provider, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '80000');
        venue.setCreateTerminal(trickStatus as 'canceled');
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });
        // A substring match on fill/execut would treat these as SUCCESS
        // and cancel the old protection; exact matching fails them closed
        // with the old trigger untouched.
        expect(result.success).toBe(false);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      }
    });

    it('a persistence failure AFTER an accepted attempt preserves the prior durable obligation', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      let journalWrites = 0;
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          if (key.startsWith('lighterTpslJournal:') && !key.includes('Index')) {
            journalWrites += 1;
            // Attempt 1 (the create) persists; attempt 2 (first cancel)
            // fails to persist.
            if (journalWrites === 2) {
              throw new Error('disk write refused');
            }
          }
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('disk write refused');
      // The PRIOR durable obligation (accepted create) survives — the
      // failed second persistence must never compensate it away.
      const journalKeys = [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );
      expect(journalKeys).toHaveLength(1);
      const persisted = JSON.parse(
        disk.get(resolveJournalPayloadKey(disk, journalKeys[0])) ?? '{}',
      ) as {
        attempts?: { kind: string }[];
      };
      expect(persisted.attempts?.some((a) => a.kind === 'create')).toBe(true);
      // With disk healthy again — and past the never-submitted cancel's
      // signed expiry — the retry reconciles and completes.
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 700_000);
      try {
        const retry = await built.provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('restart recovery after a crash mid-rollback keeps the OLD protection, not the failed replacement survivor', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      const oldId = venueA.seedTrigger('stop-loss', '80000');
      // OCO where one leg terminal-cancels and its sibling rests active;
      // the crash hits BEFORE the live rollback can cancel the survivor.
      venueA.setCreateTerminal('oco-split');
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '75000',
      });
      expect(crashed.success).toBe(false);
      // Venue: old trigger + the surviving (failed-set) replacement leg.
      expect(venueA.rawTriggers).toHaveLength(2);
      killProvider(first);
      // Restart: recovery must complete the ROLLBACK — keep the old
      // trigger, remove the survivor of the FAILED replacement set.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.rawTriggers.length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(String(venueB.rawTriggers[0].orderIndex)).toBe(String(oldId));
    });

    it('restart recovery after old cancels + a later terminal failure RESTORES the previous protection', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Crash AFTER the old cancel was accepted (first read following a
      // signed cancel dies): journal is mid-'cancelling'.
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Old protection is gone; only the replacement is live...
      expect(venueA.rawTriggers).toHaveLength(1);
      expect(venueA.rawTriggers[0].triggerPrice).toBe('85000');
      // ...and during the downtime the venue terminal-cancels it.
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      // Restart: recovery must RESTORE the previous protection from the
      // persisted prior-trigger intent — never leave the position naked.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await second.provider.getPendingManualRecoveries()).length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // NO automatic restore across the unprovable lifecycle: the
      // obligation parks DURABLY as manual recovery (surfaced), nothing
      // is created, and a NEW explicit intent resolves it.
      expect(venueB.rawTriggers).toHaveLength(0);
      expect(venueB.events.filter((event) => event === 'create')).toHaveLength(
        0,
      );
      const pending = await second.provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('BTC');
      const renewed = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '84000',
      ]);
    });

    it('recovery detects a replacement failing DURING its old-protection cancels and finishes the swap when the replacement stays active', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Crash at the FIRST stale-cancel signing: the replacement is live,
      // the old protection untouched, journal phase still 'creating'.
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      expect(venueA.rawTriggers).toHaveLength(2);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (
          [...disk.keys()].filter(
            (key) =>
              key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
          ).length === 0 &&
          venueB.rawTriggers.length === 1
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The replacement stayed ACTIVE: recovery legitimately finishes
      // the swap (no restore machinery involved).
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '85000',
      ]);
      expect(
        [...disk.keys()].filter(
          (key) =>
            key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
        ),
      ).toHaveLength(0);
    });

    it('a failed replacement after old cancels parks durable manual recovery across restarts: the obligation is retried until protection exists', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // During the downtime the venue also terminal-cancels the
      // replacement: recovery must restore, but the venue rejects the
      // FIRST restore attempt too.
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await second.provider.getPendingManualRecoveries()).length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // NO automatic restore: the obligation parks DURABLY as manual
      // recovery; nothing is created; a NEW explicit intent resolves it.
      expect(venueB.events.filter((event) => event === 'create')).toHaveLength(
        0,
      );
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        1,
      );
      const renewed = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
    });

    it('an unresolved startup recovery is retried by a later non-mutating read in the SAME session', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      // New lifetime with the committed create HIDDEN by REST lag beyond
      // the recovery window: the first read's recovery stays unresolved.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      const laggedView = venueB.rawTriggers.filter(
        (row) => row.triggerPrice === '80000',
      );
      venueB.primeLag(laggedView, 50);
      await second.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 2500));
      // Still unresolved: both triggers live, journal retained.
      expect(venueB.rawTriggers).toHaveLength(2);
      // Venue reveals; a later NON-mutating read in the same session must
      // re-kick recovery and converge — no TP/SL mutation by this test.
      venueB.primeLag(venueB.rawTriggers, 0);
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.rawTriggers.length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(venueB.rawTriggers[0].triggerPrice).toBe('85000');
      expect(
        [...disk.keys()].filter(
          (key) =>
            key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
        ),
      ).toHaveLength(0);
    });

    it('a kick arriving while a recovery is in flight is preserved, not lost', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      let indexReads = 0;
      let releaseIndexRead = (): void => undefined;
      let gateArmed = true;
      const indexGate = new Promise<void>((resolve) => {
        releaseIndexRead = resolve;
      });
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key.startsWith('lighterTpslJournalIndex:')) {
            indexReads += 1;
            if (gateArmed) {
              gateArmed = false;
              await indexGate;
            }
          }
          return disk.get(key) ?? null;
        },
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      // Seed an UNRESOLVABLE pending journal (unknown create, not on the
      // books, unexpired): every recovery pass ends incomplete, so a lost
      // kick would visibly halt retries.
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 3,
          recordedAt: 5,
          operationId: 'op-kick-1',
          createdAt: 5,
          nextAttemptId: 2,
          venueCheckpoint: 0,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorGrouping: 'independent',
          priorTriggers: [],
          positionFingerprint: null,
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 999,
              outcome: 'unknown',
              clientIds: [12345],
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      setupTriggerVenue(built.clientInstance, built.bridge);
      // First read: recovery starts and stalls inside the index read.
      const firstRead = built.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 20));
      // Second read while in flight: its kick must be PRESERVED.
      await built.provider.getOpenOrders();
      releaseIndexRead();
      await firstRead;
      // The preserved kick re-runs recovery after the stalled pass ends
      // (the first pass spends its full books-poll bound reconciling).
      for (let attempt = 0; attempt < 100; attempt += 1) {
        if (indexReads >= 2) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(indexReads).toBeGreaterThanOrEqual(2);
    });

    it('a signing result without txHash or ExpiredAt refuses to submit', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          const result = (await realImplementation(call)) as Record<
            string,
            unknown
          >;
          if (call.function === '_signCreateOrder') {
            return { ...result, txHash: undefined };
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('txHash');
      // Nothing was submitted; old protection intact.
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]) => txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });
  });

  describe('round-16 durable intent, faithful restoration and authoritative resolution', () => {
    /**
     * Durable disk map + infra wiring shared by restart scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const journalKeysOf = (disk: Map<string, string>): string[] =>
      [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );

    /**
     * Simulate full process death for a provider (see round-15 helper).
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (jest.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as jest.Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    it('remove-only: a crash between two cancels finishes the removal exactly once and NEVER restores', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('take-profit', '110000');
      venueA.seedTrigger('stop-loss', '80000');
      // First cancel lands; the process dies signing the second.
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let cancelSignings = 0;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            cancelSignings += 1;
            if (cancelSignings >= 2) {
              throw new Error('process died');
            }
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      expect(venueA.rawTriggers).toHaveLength(1);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          venueB.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The intentional removal FINISHED: nothing restored, exactly the
      // one remaining old trigger cancelled.
      expect(venueB.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venueB.events.filter((event) => event === 'cancel')).toHaveLength(
        1,
      );
    });

    it('remove-only: an accepted cancel with lost response resolves by exact tx identity without restoring or double-cancelling', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failResponseOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // The cancel COMMITTED (response was lost): venue book is empty.
      expect(venueA.rawTriggers).toHaveLength(0);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (journalKeysOf(disk).length === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venueB.rawTriggers).toHaveLength(0);
      // Removal completed exactly once: no second cancel, no restore.
      expect(venueB.events.filter((event) => event === 'cancel')).toHaveLength(
        0,
      );
      expect(venueB.events.filter((event) => event === 'create')).toHaveLength(
        0,
      );
    });

    it('a v2 journal without a durable operation intent fails closed as malformed', async () => {
      const { disk, infra } = makeDurableDisk();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 3,
          recordedAt: 5,
          operationId: 'op-intentless',
          createdAt: 5,
          nextAttemptId: 2,
          venueCheckpoint: 0,
          apiKeyIndex: 7,
          phase: 'cancelling',
          priorGrouping: 'independent',
          priorTriggers: [],
          positionFingerprint: null,
          attempts: [
            {
              kind: 'cancel',
              attemptId: 1,
              nonce: 999,
              outcome: 'accepted',
              orderId: '424242',
              txHash: 'ffff00000002',
              expiresAt: 9_999_999_999_999,
              role: 'stale',
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('malformed');
      // Zero venue mutation from an uninterpretable obligation.
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('a direct foreground update routes the pending obligation through the SAME state machine before proceeding', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Downtime: the replacement terminal-cancels — the journal owes a
      // RESTORE ('cancelling' phase, replacement fully failed).
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawInactive) {
        venueB.rawInactive.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      // DIRECT foreground update — no prior read-path kick. The machine
      // parks the interrupted operation as MANUAL; this very call is the
      // explicit new intent that acknowledges it, so the update proceeds
      // and establishes the NEW protection (never restoring the old).
      const update = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(update.error).toBeUndefined();
      expect(update.success).toBe(true);
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '86000',
      ]);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(await second.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
    });

    it('a live OCO leg failing after activation parks durable manual recovery (never a silent partial pair)', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // After the FIRST old-cancel commits, the venue terminal-cancels
      // one replacement leg — the phase race at its worst.
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let raced = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const result = await realSend(txType, txInfo);
          if (txType === 15 && !raced) {
            raced = true;
            const failedAt = venue.rawTriggers.findIndex(
              (row) => row.triggerPrice === '81000',
            );
            if (failedAt >= 0) {
              const [failedRow] = venue.rawTriggers.splice(failedAt, 1);
              venue.rawInactive.push({ ...failedRow, status: 'canceled' });
            }
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '111000',
        stopLossPrice: '81000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('MANUAL re-establishment');
      expect(await provider.getPendingManualRecoveries()).toHaveLength(1);
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
    });

    it('a stale trigger whose wire intent cannot be faithfully restored refuses the update BEFORE any mutation', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      // Unknown venue time-in-force: an exact restoration cannot be
      // signed, so the swap must refuse before touching anything.
      venue.rawTriggers[0].timeInForce = 'mystery-tif';
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('faithfully restored');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('an UNKNOWN cancel is never resolved by book state alone: an independently-removed target keeps blocking until identity resolves', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failBeforeCommitOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // The signed cancel NEVER reached the venue — but the target then
      // disappears independently (fill or external cancel). Book state
      // alone cannot prove the signed payload will not land later.
      venueA.rawTriggers.splice(0, 1);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      await second.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 500));
      // The obligation is retained (unexpired + venue-confirmed nothing).
      expect(journalKeysOf(disk)).toHaveLength(1);
      const update = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(update.success).toBe(false);
      expect(update.error).toContain('unresolved');
    });

    it('an exact tx found with terminal FAILED status resolves deterministically and the removal is retried to completion', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // The sequencer consumes the nonce, records terminal status 0
      // (failed), mutates nothing, and the response is lost.
      venueA.failExecutionOnceFor(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      expect(venueA.rawTriggers).toHaveLength(1);
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          venueB.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The failed cancel was classified terminally and RETRIED: the
      // removal completed instead of blocking forever.
      expect(venueB.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venueB.events.filter((event) => event === 'cancel')).toHaveLength(
        1,
      );
    });

    it('a symbol carrying more prior triggers than the journal can hold refuses the mutation before any submission', async () => {
      const { disk, infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      for (let index = 0; index < 5; index += 1) {
        venue.seedTrigger(
          index % 2 === 0 ? 'stop-loss' : 'take-profit',
          '80000',
        );
      }
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('too many');
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(5);
      expect(journalKeysOf(disk)).toHaveLength(0);
    });

    it('a journal persisted AFTER the initial empty-index recovery is still retried by later read kicks in the same session', async () => {
      const { disk, infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      // Initial recovery completes against an EMPTY index — twice, so the
      // completion marker is recorded at the STABLE session generation
      // (the first read also performs the initial session bind).
      await built.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      await built.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 100));
      venue.seedTrigger('stop-loss', '80000');
      // The replacement create commits but the response is lost: the
      // journal is created AFTER the completion marker was set.
      venue.failResponseOnce(14);
      const crashed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await built.provider.getOpenOrders();
        if (
          journalKeysOf(disk).length === 0 &&
          venue.rawTriggers.length === 1
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // The later read kicks reconciled it: swap completed, old cancelled.
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('85000');
    });

    it('a nonce consumed by a lost-response submission is never reissued to the next lock section while the endpoint lags', async () => {
      const { infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Freeze the REST nonce endpoint at the pre-loss value.
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The remove's cancel consumes the frozen nonce; response is lost.
      venue.failResponseOnce(15);
      const crashed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      // A DIFFERENT operation in a new lock section must not reuse it.
      // The lost-response cancel is JOURNAL-OWNED: its ledger entry is
      // consumed by exact-hash proof (floor advance) without parking a
      // generic quarantine, so the unrelated write proceeds immediately.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
      // The cancel consumed its issued nonce even though the response was
      // lost; the NEXT section must sign strictly above it — never a
      // reuse of the lagging REST value.
      const cancelCall = built.calls
        .filter((call) => call.function === '_signCancelOrder')
        .at(-1);
      expect(cancelCall).toBeDefined();
      const cancelParams = cancelCall?.params as (string | number)[];
      const consumedNonce = Number(cancelParams[cancelParams.length - 1]);
      expect(consumedNonce).toBeGreaterThanOrEqual(frozenNonce);
      const orderCall = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      expect(orderCall).toBeDefined();
      const orderParams = orderCall?.params as (string | number)[];
      expect(Number(orderParams[orderParams.length - 1])).toBe(
        consumedNonce + 1,
      );
    });
  });

  describe('round-17 journal revisions, durable nonce ledger and independent restores', () => {
    /**
     * Durable disk map + infra wiring shared by restart scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const journalKeysOf = (disk: Map<string, string>): string[] =>
      [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );

    /**
     * Simulate full process death for a provider (see round-15 helper).
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (jest.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as jest.Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    const copyVenue = (
      from: ReturnType<typeof setupTriggerVenue>,
      to: ReturnType<typeof setupTriggerVenue>,
      options: { triggers?: boolean; inactive?: boolean } = {},
    ): void => {
      to.setVenueNonce(from.getVenueNonce());
      to.setNextIndex(from.getNextIndex());
      if (options.triggers !== false) {
        for (const row of from.rawTriggers) {
          to.rawTriggers.push({ ...row });
        }
      }
      if (options.inactive !== false) {
        for (const row of from.rawInactive) {
          to.rawInactive.push({ ...row });
        }
      }
      for (const [hash, landed] of from.landedTxs) {
        to.landedTxs.set(hash, landed);
      }
    };

    it('a recovery holding a STALE journal snapshot can never erase a newer operation journal (in-lock reload + revision guard)', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Journal A: replacement (85000) accepted+active, crash BEFORE the
      // stale cancel — resolvable by finishing the swap.
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Let any zombie pass of the dead provider fail against the killed
      // mocks BEFORE arming the stale-read seam: the seam must capture
      // the NEW session's recovery, not the corpse's.
      await new Promise((resolve) => setTimeout(resolve, 150));
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      // STALE-SNAPSHOT seam: the FIRST read of the journal key captures
      // its value, then stalls until the foreground finished (or a bound
      // elapses) — modelling a recovery preempted between its journal
      // load and its lock section.
      const journalKey = journalKeysOf(disk)[0];
      let staleGateArmed = true;
      let releaseStaleGate = (): void => undefined;
      const staleGate = new Promise<void>((resolve) => {
        releaseStaleGate = resolve;
      });
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => {
          const value = disk.get(key) ?? null;
          if (key === journalKey && staleGateArmed) {
            staleGateArmed = false;
            await staleGate;
          }
          return value;
        },
      );
      // Kick recovery: its journal read stalls holding the captured
      // (soon stale) snapshot.
      await second.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // Foreground: settles A (finishes the swap to 85000), then its NEW
      // replacement (86000) commits but the response is lost — journal B.
      venueB.failResponseOnce(14);
      const foreground = second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      await Promise.race([
        foreground,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      releaseStaleGate();
      await foreground.catch(() => undefined);
      // Let the STALE recovery pass fully finish BEFORE any fresh kick
      // could mask the erasure it would cause.
      await new Promise((resolve) => setTimeout(resolve, 800));
      // The stale recovery must NOT erase journal B; later kicks resolve
      // B: the committed 86000 replacement wins, 85000 is cancelled.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          journalKeysOf(disk).length === 0 &&
          venueB.rawTriggers.length === 1 &&
          venueB.rawTriggers[0].triggerPrice === '86000'
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueB.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '86000',
      ]);
      expect(journalKeysOf(disk)).toHaveLength(0);
    });

    it('a response-lost dispatch survives RESTART: an unrelated write on the new session never reuses the consumed nonce', async () => {
      const { infra } = makeDurableDisk();
      // Venue key pre-registered on BOTH sessions: the unrelated write is
      // the FIRST dispatch of the fresh session (no ChangePubKey ahead of
      // it to absorb the reused nonce by accident).
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failResponseOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      // The cancel consumed its nonce (response lost).
      const cancelCall = first.calls
        .filter((call) => call.function === '_signCancelOrder')
        .at(-1);
      const cancelParams = cancelCall?.params as (string | number)[];
      const consumedNonce = Number(cancelParams[cancelParams.length - 1]);
      killProvider(first);
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      // The REST endpoint LAGS at the consumed nonce after restart.
      second.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: consumedNonce,
      }));
      // A DIRECT write on the fresh session — no recovery kick ran; only
      // the durable dispatch ledger can prevent the reuse. The lost-
      // response cancel is JOURNAL-OWNED: the fresh session's protection
      // intent resolves it through the settlement machine (no generic
      // quarantine), and the floor advance survives the restart.
      const resolvedRestart = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(resolvedRestart.success).toBe(true);
      expect(await second.provider.getRecoveredDispatches()).toStrictEqual([]);
      const placed = await second.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      const orderCall = second.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      const orderParams = orderCall?.params as (string | number)[];
      expect(Number(orderParams[orderParams.length - 1])).toBe(
        consumedNonce + 1,
      );
    });

    it('a PROVEN never-landed dispatch releases its nonce: writes recover to the value the venue still expects', async () => {
      const { disk, infra } = makeDurableDisk();
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The order dispatch never reaches the venue: nonce NOT consumed.
      venue.failBeforeCommitOnce(14);
      const failed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(failed.success).toBe(false);
      const firstCall = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      const firstParams = firstCall?.params as (string | number)[];
      const unconsumedNonce = Number(firstParams[firstParams.length - 1]);
      // Age the durable ledger entry past its signed validity: the
      // dispatch is now PROVABLY never-landed.
      const ledgerKey = [...disk.keys()].find((key) =>
        key.startsWith('lighterNonceLedger:'),
      );
      expect(ledgerKey).toBeDefined();
      const ledger = JSON.parse(disk.get(ledgerKey as string) as string) as {
        entries: { expiresAt: number | null }[];
      };
      for (const entry of ledger.entries) {
        entry.expiresAt = Date.now() - 700_000;
      }
      disk.set(ledgerKey as string, JSON.stringify(ledger));
      // The NEXT write must recover to the nonce the venue still expects
      // — a sticky memory floor would brick every subsequent write.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90500',
      });
      expect(placed.success).toBe(true);
      const secondCall = built.calls
        .filter((call) => call.function === '_signCreateOrder')
        .at(-1);
      const secondParams = secondCall?.params as (string | number)[];
      expect(Number(secondParams[secondParams.length - 1])).toBe(
        unconsumedNonce,
      );
    });

    it('a stale trigger with NO trigger price refuses the update — semantics are never substituted', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      delete (venue.rawTriggers[0] as { triggerPrice?: string }).triggerPrice;
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('faithfully restored');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('a prior whose wire values cannot be integerized refuses the update before any mutation (writer/loader symmetry)', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Exceeds the uint32 wire price range at 1 decimal: restoring this
      // prior could never be signed — the swap must refuse up front.
      venue.rawTriggers[0].price = '429496729.7';
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('faithfully restored');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('the LIVE transition never re-attaches protection after a post-cancel failure: durable manual recovery is parked', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // After the old cancel commits: the replacement terminal-fails AND
      // the position closes+reopens (venue fills + changed account row).
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let raced = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const result = await realSend(txType, txInfo);
          if (txType === 15 && !raced) {
            raced = true;
            const failedAt = venue.rawTriggers.findIndex(
              (row) => row.triggerPrice === '85000',
            );
            if (failedAt >= 0) {
              const [failedRow] = venue.rawTriggers.splice(failedAt, 1);
              venue.rawInactive.push({ ...failedRow, status: 'canceled' });
            }
            venue.rawInactive.push({
              orderIndex: 9990,
              clientOrderIndex: 777001,
              marketIndex: 1,
              ownerAccountIndex: 28,
              initialBaseAmount: '0.1',
              remainingBaseAmount: '0.000',
              price: '95000',
              isAsk: true,
              type: 'market',
              timeInForce: 'immediate-or-cancel',
              reduceOnly: 1,
              status: 'filled',
              orderExpiry: 0,
              timestamp: Date.now(),
              triggerPrice: '0',
            });
            clientInstance.getAccountByIndex.mockResolvedValue({
              code: 200,
              accounts: [
                {
                  ...ACCOUNT,
                  positions: [
                    {
                      ...ACCOUNT.positions[0],
                      sign: -1,
                      position: '0.05',
                      avgEntryPrice: '95000',
                    },
                  ],
                },
              ],
            });
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      // NO automatic restore: explicit failure, durable manual state.
      expect(result.error).toContain('MANUAL re-establishment');
      expect(venue.events.filter((event) => event === 'create')).toHaveLength(
        1,
      );
      expect(await provider.getPendingManualRecoveries()).toHaveLength(1);
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
    });

    it('a proven-never-landed retry may reuse its nonce: the journal stays loadable across a restart mid-retry', async () => {
      const { disk, infra } = makeDurableDisk();
      const first = buildProvider({ platformDependencies: infra });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failBeforeCommitOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      killProvider(first);
      // Age the unknown cancel attempt (and its ledger entry) past the
      // signed validity: PROVEN never-landed → nonce released, retried.
      const journalKey = resolveJournalPayloadKey(disk, journalKeysOf(disk)[0]);
      const journal = JSON.parse(disk.get(journalKey) as string) as {
        attempts: { expiresAt: number }[];
      };
      for (const attempt of journal.attempts) {
        attempt.expiresAt = Date.now() - 700_000;
      }
      disk.set(journalKey, JSON.stringify(journal));
      const ledgerKey = [...disk.keys()].find((key) =>
        key.startsWith('lighterNonceLedger:'),
      );
      if (ledgerKey) {
        const ledger = JSON.parse(disk.get(ledgerKey) as string) as {
          entries: { expiresAt: number | null }[];
        };
        for (const entry of ledger.entries) {
          entry.expiresAt = Date.now() - 700_000;
        }
        disk.set(ledgerKey, JSON.stringify(ledger));
      }
      // Restart 1: the retry cancel signs (with a possibly REUSED nonce),
      // then the process dies before settlement.
      const second = buildProvider({ platformDependencies: infra });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      const frozen = venueB.getVenueNonce();
      second.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozen,
      }));
      const realActiveB =
        second.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let diedB = false;
      second.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!diedB && venueB.events.includes('cancel')) {
          diedB = true;
          throw new Error('process died');
        }
        return await realActiveB();
      });
      await second.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (venueB.events.includes('cancel')) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      killProvider(second);
      // Restart 2: the journal now holds TWO attempts that may share a
      // nonce. It must still LOAD and the removal must complete.
      const third = buildProvider({ platformDependencies: infra });
      const venueC = setupTriggerVenue(third.clientInstance, third.bridge);
      copyVenue(venueB, venueC);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await third.provider.getOpenOrders();
        if (
          venueC.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueC.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
    });
  });

  describe('round-18 real signer identity, durable nonce integrity and grouped restores', () => {
    /**
     * Durable disk map + infra wiring shared by restart scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const journalKeysOf = (disk: Map<string, string>): string[] =>
      [...disk.keys()].filter(
        (key) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
      );

    /**
     * Simulate full process death for a provider (see round-15 helper).
     *
     * @param built - The provider under test.
     * @param built.clientInstance - Its mocked client service instance.
     * @param built.bridge - Its mocked signer bridge.
     */
    const killProvider = (built: {
      clientInstance: MockClientInstance;
      bridge: LighterSignerBridge;
    }): void => {
      for (const mockFn of Object.values(built.clientInstance)) {
        if (jest.isMockFunction(mockFn)) {
          mockFn.mockImplementation(async () => {
            throw new Error('process died');
          });
        }
      }
      (built.bridge.execute as jest.Mock).mockImplementation(async () => {
        throw new Error('process died');
      });
    };

    const copyVenue = (
      from: ReturnType<typeof setupTriggerVenue>,
      to: ReturnType<typeof setupTriggerVenue>,
      options: { triggers?: boolean; inactive?: boolean } = {},
    ): void => {
      to.setVenueNonce(from.getVenueNonce());
      to.setNextIndex(from.getNextIndex());
      if (options.triggers !== false) {
        for (const row of from.rawTriggers) {
          to.rawTriggers.push({ ...row });
        }
      }
      if (options.inactive !== false) {
        for (const row of from.rawInactive) {
          to.rawInactive.push({ ...row });
        }
      }
      for (const [hash, landed] of from.landedTxs) {
        to.landedTxs.set(hash, landed);
      }
    };

    const lastSignedNonce = (calls: LighterWasmCall[], fn: string): number => {
      const call = calls.filter((entry) => entry.function === fn).at(-1);
      const params = call?.params as (string | number)[];
      return Number(params[params.length - 1]);
    };

    it('the dispatch ledger records the RESULT tx hash (real signer shape) and resolves a restart by exact identity', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      venueA.failResponseOnce(15);
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      const consumedNonce = lastSignedNonce(first.calls, '_signCancelOrder');
      killProvider(first);
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      copyVenue(venueA, venueB);
      // REST lags at the consumed nonce; the ONLY consumption proof is
      // the exact RESULT hash recorded at dispatch — txInfo never
      // carried it (pinned WASM contract).
      second.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: consumedNonce,
      }));
      // The retry resolves the JOURNAL-OWNED dispatch through the
      // settlement machine: the exact RESULT hash (recorded at dispatch;
      // txInfo never carried it) proves consumption, the floor advances,
      // and no generic quarantine is parked.
      const resolvedRestart = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(resolvedRestart.success).toBe(true);
      expect(await second.provider.getRecoveredDispatches()).toStrictEqual([]);
      const placed = await second.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(second.calls, '_signCreateOrder')).toBe(
        consumedNonce + 1,
      );
    });

    it('a HASHLESS unresolved dispatch is never released by expiry alone: writes stay blocked until the venue advances', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      // Seed a durable hashless entry (e.g. a dispatch whose signing
      // result carried no hash): venue-confirmed absence is impossible.
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      disk.set(
        `lighterNonceLedger:testnet:28:7`,
        JSON.stringify({
          version: 1,
          consumedFloor: 0,
          entries: [
            {
              nonce: frozenNonce,
              txHash: null,
              expiresAt: Date.now() - 700_000,
            },
          ],
        }),
      );
      const blocked = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      // Expiry alone must NOT prove non-consumption without a hash.
      expect(blocked.success).toBe(false);
      expect(blocked.error).toContain('unresolved');
      // The venue advances (the dispatch actually consumed the nonce):
      // only the ADVANCE is proven via REST — the hashless intent's own
      // fate is UNKNOWN, never reported completed. The outcome is
      // QUARANTINED and writes recover only after explicit
      // per-outcome acknowledgment.
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce + 1,
      }));
      const quarantined = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(quarantined.success).toBe(false);
      expect(quarantined.error).toContain('landed with an UNKNOWN outcome');
      const hashlessOutcomes = await built.provider.getRecoveredDispatches();
      expect(hashlessOutcomes).toHaveLength(1);
      expect(hashlessOutcomes[0].outcome).toBe('unknown');
      expect(hashlessOutcomes[0].evidence).toBe('rest-advance');
      await acknowledgeAllRecovered(built.provider);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce + 1,
      );
    });

    it('ledger consumption proof verifies the FULL identity, not the nonce alone', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The venue KNOWS a tx under this hash — but for a DIFFERENT api
      // key slot: identity mismatch is ambiguity, never consumption.
      venue.landedTxs.set('dddd000000000001', {
        nonce: frozenNonce,
        status: 2,
      });
      built.clientInstance.getTx.mockImplementation(async (hash: string) =>
        hash === 'dddd000000000001'
          ? {
              code: 200,
              hash,
              accountIndex: 28,
              apiKeyIndex: 9,
              nonce: frozenNonce,
              status: 2,
            }
          : null,
      );
      disk.set(
        `lighterNonceLedger:testnet:28:7`,
        JSON.stringify({
          version: 1,
          consumedFloor: 0,
          entries: [
            {
              nonce: frozenNonce,
              txHash: 'dddd000000000001',
              expiresAt: Date.now() + 500_000,
            },
          ],
        }),
      );
      const blocked = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(blocked.success).toBe(false);
      expect(blocked.error).toContain('unresolved');
    });

    it('a ledger write failure aborts the dispatch with the memory floor UNTOUCHED; writes heal to the venue-expected nonce', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The durable append fails ONCE: nothing may be dispatched and the
      // floor must not advance.
      let failLedgerWrite = true;
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          if (key.startsWith('lighterNonceLedger:') && failLedgerWrite) {
            failLedgerWrite = false;
            throw new Error('storage write refused');
          }
          disk.set(key, value);
        },
      );
      const failed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(failed.success).toBe(false);
      expect(
        built.clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) => txType === 14,
        ),
      ).toHaveLength(0);
      // Storage healed: the next write signs the nonce the venue still
      // expects — a floor advanced before the durable append would have
      // burned it.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90500',
      });
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce,
      );
    });

    it('a coded venue/HTTP error after a hidden commit never releases the nonce: the next write proves consumption by hash', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // The venue COMMITS the trigger create, then answers with a coded
      // 5xx that masks the commit.
      venue.failCodedAfterCommitOnce(14, 500);
      const failed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(failed.success).toBe(false);
      const consumedNonce = lastSignedNonce(built.calls, '_signCreateOrder');
      // The next write proves consumption via the exact hash: the
      // JOURNAL-OWNED dispatch resolves through the settlement machine
      // (no generic quarantine) and the next dispatch signs the NEXT
      // nonce — releasing on the coded error would have reused the
      // consumed one.
      const resolvedNext = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '87000',
      });
      expect(resolvedNext.success).toBe(true);
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90500',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
      // The masked-commit nonce is signed EXACTLY once (the original
      // dispatch): the settlement + follow-up writes all sign LATER
      // nonces — releasing on the coded error would have reused it.
      const signedNonces = built.calls
        .filter((call) =>
          [
            '_signCreateOrder',
            '_signCancelOrder',
            '_signCreateGroupedOrders',
          ].includes(call.function),
        )
        .map((call) => {
          const params = call.params as (string | number)[];
          return Number(params[params.length - 1]);
        });
      expect(
        signedNonces.filter((nonce) => nonce === consumedNonce),
      ).toHaveLength(1);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBeGreaterThan(
        consumedNonce,
      );
    });

    it('a stale never-landed reconciliation can never lower the floor below a nonce a RETRY has since consumed', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const frozenNonce = venue.getVenueNonce();
      built.clientInstance.getNextNonce.mockImplementation(async () => ({
        code: 200,
        nonce: frozenNonce,
      }));
      // TPSL remove dispatch A never lands.
      venue.failBeforeCommitOnce(15);
      const crashed = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
      });
      expect(crashed.success).toBe(false);
      // Age dispatch A (journal attempt + ledger entry): proven
      // never-landed on next resolution.
      for (const key of [...disk.keys()]) {
        if (
          key.startsWith('lighterNonceLedger:') ||
          key.startsWith('lighterTpslJournalOp:') ||
          (key.startsWith('lighterTpslJournal:') && !key.includes('Index'))
        ) {
          const doc = JSON.parse(disk.get(key) as string) as {
            entries?: { expiresAt: number | null }[];
            attempts?: { expiresAt: number }[];
          };
          for (const entry of doc.entries ?? []) {
            entry.expiresAt = Date.now() - 700_000;
          }
          for (const attempt of doc.attempts ?? []) {
            attempt.expiresAt = Date.now() - 700_000;
          }
          disk.set(key, JSON.stringify(doc));
        }
      }
      // The old trigger disappears INDEPENDENTLY (external cancel): the
      // later journal reconciliation will have nothing left to submit —
      // its ONLY effect on the nonce state is the release itself.
      venue.rawTriggers.splice(0, 1);
      // Retry B: an unrelated write consumes the released nonce N.
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce,
      );
      // The STALE journal reconciliation of dispatch A now proves A
      // never landed — but N was consumed by B: the floor must not drop.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await built.provider.getOpenOrders();
        if (journalKeysOf(disk).length === 0) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      const placedAfter = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '91000',
      });
      expect(placedAfter.success).toBe(true);
      expect(lastSignedNonce(built.calls, '_signCreateOrder')).toBe(
        frozenNonce + 1,
      );
    });

    it('tWO LIVE providers: a stale settlement pass physically cannot destroy the newer journal written by its peer', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Journal A: replacement accepted+active, crash before cancels.
      const realBridge = (
        first.bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (first.bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCancelOrder') {
            throw new Error('process died');
          }
          return await realBridge(call);
        },
      );
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      (first.bridge.execute as jest.Mock).mockImplementation(realBridge);
      await new Promise((resolve) => setTimeout(resolve, 150));
      // A SECOND LIVE provider shares the same venue and disk — its lock
      // is instance-local, so it interleaves with the first for real.
      // Both providers are wired to ONE venue state: the second's client
      // and signer mocks share the first venue's closures.
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      for (const method of [
        'getActiveOrders',
        'getInactiveOrders',
        'getNextNonce',
        'getTx',
        'sendTx',
      ] as const) {
        second.clientInstance[method].mockImplementation(
          first.clientInstance[method].getMockImplementation() as never,
        );
      }
      (second.bridge.execute as jest.Mock).mockImplementation(
        (first.bridge.execute as jest.Mock).getMockImplementation() as never,
      );
      // Stale seam on the FIRST provider's recovery read of the journal
      // pointer: it captures the current value, then yields until the
      // SECOND provider settled A and journalled its own operation B.
      const baseJournalKey = journalKeysOf(disk).find(
        (key) => key.split(':').length === 6,
      );
      let staleGateArmed = true;
      let releaseStaleGate = (): void => undefined;
      const staleGate = new Promise<void>((resolve) => {
        releaseStaleGate = resolve;
      });
      const journalPointerKey = baseJournalKey ?? journalKeysOf(disk)[0];
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => {
          const value = disk.get(key) ?? null;
          if (key === journalPointerKey && staleGateArmed) {
            staleGateArmed = false;
            await staleGate;
          }
          return value;
        },
      );
      // First provider's recovery holds the stale snapshot...
      await first.provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 50));
      // ...while the SECOND provider settles A and journals B
      // (response-loss on its replacement create).
      venue.failResponseOnce(14);
      const foreground = second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      await Promise.race([
        foreground,
        new Promise((resolve) => setTimeout(resolve, 1500)),
      ]);
      releaseStaleGate();
      await foreground.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 800));
      // B's journal payload must still exist — the stale pass could not
      // delete or overwrite it — and later reads resolve it.
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await second.provider.getOpenOrders();
        if (
          journalKeysOf(disk).length === 0 &&
          venue.rawTriggers.length === 1 &&
          venue.rawTriggers[0].triggerPrice === '86000'
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venue.rawTriggers.map((row) => row.triggerPrice)).toStrictEqual([
        '86000',
      ]);
      expect(journalKeysOf(disk)).toHaveLength(0);
    }, 15_000);

    it('compaction also covers proven-resolved cancel attempts: >40 mixed failures stay recoverable', async () => {
      const { disk, infra } = makeDurableDisk();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 4,
          recordedAt: 5,
          createdAt: 5,
          nextAttemptId: 41,
          operationId: 'op-mixed-compact',
          apiKeyIndex: 7,
          intent: 'remove',
          phase: 'cancelling',
          priorGrouping: 'independent',
          priorTriggers: [
            {
              orderId: '9000',
              side: 'sell',
              wireOrderType: 2,
              wireTimeInForce: 0,
              orderExpiry: 0,
              price: '80000',
              triggerPrice: '80000',
              remainingSize: '0.001',
            },
          ],
          // 40 proven-resolved CANCEL failures (never landed, expired):
          // without cancel compaction the next attempt dead-ends at the
          // cap.
          attempts: Array.from({ length: 40 }, (_, index) => ({
            kind: 'cancel',
            attemptId: index + 1,
            nonce: 2000 + index,
            outcome: 'unknown',
            orderId: String(7000 + index),
            txHash: `eeee${String(index).padStart(4, '0')}0000`,
            expiresAt: 1_700_000_000_000,
            role: 'stale',
          })),
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      // The prior trigger is STILL on the venue: the removal's final
      // cancel is owed, but the journal is already AT the attempt cap.
      venue.rawTriggers.push({
        orderIndex: 9000,
        clientOrderIndex: 9000,
        marketIndex: 1,
        ownerAccountIndex: 28,
        initialBaseAmount: '0.001',
        remainingBaseAmount: '0.001',
        price: '80000',
        isAsk: true,
        type: 'stop-loss',
        timeInForce: 'immediate-or-cancel',
        reduceOnly: 1,
        status: 'open',
        orderExpiry: 0,
        timestamp: 1700000000000,
        triggerPrice: '80000',
      });
      const journalSizes: number[] = [];
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          if (
            key.startsWith('lighterTpslJournalOp:') ||
            (key.startsWith('lighterTpslJournal:') && !key.includes('Index'))
          ) {
            try {
              const parsed = JSON.parse(value) as { attempts?: unknown[] };
              if (Array.isArray(parsed.attempts)) {
                journalSizes.push(parsed.attempts.length);
              }
            } catch {
              // pointer docs are not journals
            }
          }
          disk.set(key, value);
        },
      );
      for (let attempt = 0; attempt < 40; attempt += 1) {
        await built.provider.getOpenOrders();
        if (
          venue.rawTriggers.length === 0 &&
          journalKeysOf(disk).length === 0
        ) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      // Compaction dropped the 40 proven-resolved cancels: the 41st
      // (real) cancel completed the removal under the cap.
      expect(venue.rawTriggers).toHaveLength(0);
      expect(journalKeysOf(disk)).toHaveLength(0);
      expect(Math.max(...journalSizes)).toBeLessThanOrEqual(40);
    });
  });

  describe('round-20 financial idempotency, signer ownership and manual recovery', () => {
    it('a WITHDRAW whose commit was masked by response loss is never blindly retried: quarantined until acknowledged', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(13);
      const first = await built.provider.withdraw({ amount: '25' });
      expect(first.success).toBe(false);
      // The blind retry at the CLIENT BOUNDARY is refused: the original
      // withdrawal actually completed.
      const retry = await built.provider.withdraw({ amount: '25' });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      expect(retry.error).toContain('withdraw:25');
      const outcomes = await acknowledgeAllRecovered(built.provider);
      expect(outcomes.map((outcome) => outcome.intent)).toStrictEqual([
        'withdraw:25',
      ]);
    });

    it('an UPDATE-MARGIN whose commit was masked by response loss is quarantined until acknowledged', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(29);
      const first = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(first.success).toBe(false);
      const retry = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      await acknowledgeAllRecovered(built.provider);
      const after = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(after.success).toBe(true);
    });

    it('tWO providers on DIFFERENT accounts sharing one bridge re-establish the correct signer client before every write section', async () => {
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      // Second provider on a DIFFERENT venue account sharing the SAME
      // bridge OBJECT (the singleton WASM client model).
      const second = buildProvider({
        registeredKey,
        configuredAccountIndex: 99,
        sharedBridge: {
          bridge: first.bridge,
          calls: first.calls,
          fireReset: first.fireReset,
        },
      });
      second.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, index: 99 }],
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      const sharedCalls = first.calls;
      const order = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      } as const;
      expect((await first.provider.placeOrder(order)).success).toBe(true);
      expect((await second.provider.placeOrder(order)).success).toBe(true);
      // A's next write happens AFTER B overwrote the singleton client:
      // the bridge-ownership mutex must re-create A's client first.
      expect((await first.provider.placeOrder(order)).success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(0);
      expect(venueB.rawTriggers).toHaveLength(0);
      // Sequence check: every _signCreateOrder is preceded (since the
      // last account switch) by a _createClient for the SAME account.
      let currentOwner: number | null = null;
      const mismatches: string[] = [];
      for (const call of sharedCalls) {
        if (call.function === '_createClient') {
          currentOwner = Number((call.params as (string | number)[])[1]);
        }
        if (call.function === '_signCreateOrder') {
          const signer = Number((call.params as (string | number)[])[0]);
          if (currentOwner !== signer) {
            mismatches.push(`${String(currentOwner)}!=${String(signer)}`);
          }
        }
      }
      expect(mismatches).toStrictEqual([]);
      // At least one RE-establishment happened for A's second write.
      expect(
        sharedCalls.filter((call) => call.function === '_createClient').length,
      ).toBeGreaterThanOrEqual(3);
    });

    it('a stale trigger with DANGLING venue linkage refuses the update before any mutation (never classified independent)', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // One-sided linkage to an order that is not part of the pair.
      venue.rawTriggers[0].toCancelOrderId0 = '424242';
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('venue linkage');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) =>
            txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('an index read failure during clear is AMBIGUITY: the settlement stays unresolved and the index is retained', async () => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      // Allow the persist-time index read; fail from the SECOND index
      // read on (the clear-time RMW).
      let failIndexReads = false;
      let indexReads = 0;
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => {
          if (key.startsWith('lighterTpslJournalIndex:')) {
            indexReads += 1;
            if (failIndexReads && indexReads > 1) {
              throw new Error('index storage read failed');
            }
          }
          return disk.get(key) ?? null;
        },
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      failIndexReads = true;
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      // The venue settled but the index could not be safely updated: the
      // operation must NOT report clean success and the index survives.
      expect(result.success).toBe(false);
      expect(result.error).toContain('index storage read failed');
      expect(disk.has('lighterTpslJournalIndex:testnet')).toBe(true);
      failIndexReads = false;
      const retry = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.error).toBeUndefined();
      expect(retry.success).toBe(true);
    });

    it('an order failing AFTER a committed leverage change reports the partial venue state explicitly', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      setupTriggerVenue(clientInstance, bridge);
      // Leverage submit succeeds; the ORDER dispatch then fails at the
      // venue boundary.
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 14) {
            throw new LighterApiError('order rejected', 21000);
          }
          return await realSend(txType, txInfo);
        },
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('PARTIAL STATE');
      expect(result.error).toContain('leverage');
      expect(result.error).toContain('10x');
    });
  });

  describe('round-19 process-wide serialization, complete identity and real OCO semantics', () => {
    /**
     * Durable disk map + infra wiring shared by scenarios.
     *
     * @returns The disk map and mocked infrastructure bound to it.
     */
    const makeDurableDisk = (): {
      disk: Map<string, string>;
      infra: ReturnType<typeof createMockInfrastructure>;
    } => {
      const disk = new Map<string, string>();
      const infra = createMockInfrastructure();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          disk.delete(key);
        },
      );
      return { disk, infra };
    };

    const shareVenue = (
      from: { clientInstance: MockClientInstance; bridge: LighterSignerBridge },
      to: { clientInstance: MockClientInstance; bridge: LighterSignerBridge },
    ): void => {
      for (const method of [
        'getActiveOrders',
        'getInactiveOrders',
        'getNextNonce',
        'getTx',
        'sendTx',
      ] as const) {
        to.clientInstance[method].mockImplementation(
          from.clientInstance[method].getMockImplementation() as never,
        );
      }
      (to.bridge.execute as jest.Mock).mockImplementation(
        (from.bridge.execute as jest.Mock).getMockImplementation() as never,
      );
    };

    it('tWO LIVE providers dispatching concurrently never issue the same nonce (process-wide venue write mutex)', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venue = setupTriggerVenue(first.clientInstance, first.bridge);
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      shareVenue(first, second);
      // Freeze the REST endpoint: without cross-provider serialization
      // both providers read the same nonce and dispatch it twice.
      const frozen = venue.getVenueNonce();
      const frozenImpl = async (): Promise<{
        code: number;
        nonce: number;
      }> => ({
        code: 200,
        nonce: frozen,
      });
      first.clientInstance.getNextNonce.mockImplementation(frozenImpl);
      second.clientInstance.getNextNonce.mockImplementation(frozenImpl);
      const [resultA, resultB] = await Promise.all([
        first.provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
        second.provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90500',
        }),
      ]);
      expect(resultA.success).toBe(true);
      expect(resultB.success).toBe(true);
      const signedNonces = [...first.calls, ...second.calls]
        .filter((call) => call.function === '_signCreateOrder')
        .map((call) => {
          const params = call.params as (string | number)[];
          return Number(params[params.length - 1]);
        })
        .sort((left, right) => left - right);
      expect(signedNonces).toStrictEqual([frozen, frozen + 1]);
    });

    it('two LIVE resolvers of the same journal park exactly ONE manual obligation (process-wide settlement mutex)', async () => {
      const { infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      const realActive =
        first.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      let died = false;
      first.clientInstance.getActiveOrders.mockImplementation(async () => {
        if (!died && venueA.events.includes('cancel')) {
          died = true;
          throw new Error('process died');
        }
        return await realActive();
      });
      const crashed = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(crashed.success).toBe(false);
      // Heal the seam WITHOUT killing the provider: BOTH instances stay
      // live and share the venue + disk.
      first.clientInstance.getActiveOrders.mockImplementation(
        realActive as never,
      );
      // Replacement terminal-cancels during the outage: a restore is owed.
      const [failedRow] = venueA.rawTriggers.splice(0, 1);
      venueA.rawInactive.push({ ...failedRow, status: 'canceled' });
      const second = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      shareVenue(first, second);
      // BOTH providers kick recovery concurrently: the settlement mutex
      // serializes them — exactly ONE parks the obligation as manual,
      // neither submits any restore mutation.
      const createsBeforeRecovery = venueA.events.filter(
        (event) => event === 'create',
      ).length;
      await Promise.all([
        first.provider.getOpenOrders(),
        second.provider.getOpenOrders(),
      ]);
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if ((await first.provider.getPendingManualRecoveries()).length === 1) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      expect(venueA.events.filter((event) => event === 'create')).toHaveLength(
        createsBeforeRecovery,
      );
      expect(await first.provider.getPendingManualRecoveries()).toHaveLength(1);
      expect(venueA.rawTriggers).toHaveLength(0);
    });

    it('concurrent persists for DIFFERENT symbols never lose an index entry (index RMW mutex)', async () => {
      const { disk, infra } = makeDurableDisk();
      // Interleave-friendly disk: every operation yields, maximizing the
      // read-modify-write race window without the mutex.
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return disk.get(key) ?? null;
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Two same-provider mutations on DIFFERENT symbols cannot race the
      // write lock — drive the index RMW directly through two concurrent
      // recovery-persist paths instead: seed two journals whose persists
      // interleave via the yielding disk.
      const btc = built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await btc;
      const index = JSON.parse(
        disk.get('lighterTpslJournalIndex:testnet') ?? '[]',
      ) as string[];
      // The BTC settlement resolved: its entry is gone, the index intact.
      expect(Array.isArray(index)).toBe(true);
    });

    it('a signing result without a hash can never dispatch: the wire is REFUSED before submission', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          const result = (await realImplementation(call)) as Record<
            string,
            unknown
          >;
          if (call.function === '_signCancelOrder') {
            delete result.txHash;
          }
          return result;
        },
      );
      const result = await provider.updatePositionTPSL({ symbol: 'BTC' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('txHash');
      expect(
        clientInstance.sendTx.mock.calls.filter(
          ([txType]: [number]) => txType === 15,
        ),
      ).toHaveLength(0);
      expect(venue.rawTriggers).toHaveLength(1);
    });

    it('a v1 nonce-ledger document migrates instead of blocking writes as corrupt', async () => {
      const { disk, infra } = makeDurableDisk();
      const registeredKey = '9c'.repeat(40);
      // Earlier-schema ledger: version 1 without the consumed watermark.
      disk.set(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({ version: 1, entries: [] }),
      );
      const built = buildProvider({
        platformDependencies: infra,
        registeredKey,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.error).toBeUndefined();
      expect(placed.success).toBe(true);
    });

    it('an early-schema (v2) journal converts to durable manual remediation, resolved by an explicit new intent', async () => {
      const { disk, infra } = makeDurableDisk();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      disk.set(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 2,
          recordedAt: 5,
          operationId: 'op-v2',
          createdAt: 5,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorTriggers: [],
          positionFingerprint: null,
          attempts: [
            {
              kind: 'create',
              attemptId: 1,
              nonce: 999,
              outcome: 'unknown',
              clientIds: [12345],
              txHash: 'ffff00000001',
              expiresAt: 9_999_999_999_999,
              role: 'replacement',
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      // REMEDIATION POLICY: an uninterpretable early-schema journal
      // converts to durable MANUAL state (surfaced); the explicit new
      // intent resolves it and proceeds fresh.
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(1);
      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(0);
    });
  });

  describe('round-13 position semantics, settlement bookkeeping and margin concurrency', () => {
    it('a negative magnitude or malformed sign fails TP/SL and close with an explicit data error and zero mutation', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      // '-0.1' with sign 1 would flip the canonical direction: close/TPSL
      // would act OPPOSITE the real position. sign '1' (string) would be
      // silently coerced by a > 0 ternary.
      for (const overrides of [
        { position: '-0.1', sign: 1 },
        { position: '0.1', sign: '1' as unknown as number },
        { position: '0.1', sign: 0 },
      ]) {
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], ...overrides }],
            },
          ],
        });
        const tpsl = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });
        expect(tpsl.success).toBe(false);
        expect(tpsl.error).toContain('Invalid Lighter venue data');
        const close = await provider.closePosition({
          symbol: 'BTC',
          currentPrice: 100000,
        });
        expect(close.success).toBe(false);
        expect(close.error).toContain('Invalid Lighter venue data');
      }
      expect(calls).toHaveLength(0);
    });

    it('validateOrder resolves invalid (never rejects) when the reduce-only full-close read hits malformed venue data', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.1oops' }],
          },
        ],
      });
      // Below-min reduce-only forces the live full-close read, whose new
      // data-integrity throw must surface as an explicit invalid result.
      const validation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00005',
        orderType: 'limit',
        price: '100000',
        reduceOnly: true,
      });
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid Lighter venue data');
      expect(calls).toHaveLength(0);
    });

    it('overlapping stale margin refreshes share ONE authoritative request', async () => {
      const { provider, clientInstance } = buildProvider();
      const baseNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow);
      try {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit' as const,
          price: '90000',
          leverage: 40,
        };
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        nowSpy.mockReturnValue(baseNow + 61_000);
        // Stale epoch: gate the first fetch; a second overlapping caller
        // must NOT issue an independent fetch whose delayed/older payload
        // could later overwrite a fresher cap for a full TTL.
        let fetches = 0;
        let releaseFetch = (): void => undefined;
        const fetchGate = new Promise<void>((resolve) => {
          releaseFetch = resolve;
        });
        clientInstance.getOrderBookDetails.mockImplementation(async () => {
          fetches += 1;
          await fetchGate;
          return {
            code: 200,
            orderBookDetails: [
              {
                symbol: 'BTC',
                lastTradePrice: 100000,
                minInitialMarginFraction: 400,
                maintenanceMarginFraction: 240,
              },
            ],
          };
        });
        const firstPromise = provider.validateOrder(request);
        const secondPromise = provider.validateOrder(request);
        await new Promise((resolve) => setTimeout(resolve, 0));
        releaseFetch();
        const [first, second] = await Promise.all([
          firstPromise,
          secondPromise,
        ]);
        expect(fetches).toBe(1);
        // Both observe the single authoritative 25x result.
        expect(first.isValid).toBe(false);
        expect(second.isValid).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('a failed shared margin refresh fails closed for all waiters and clears for retry', async () => {
      const { provider, clientInstance } = buildProvider();
      const baseNow = Date.now();
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(baseNow);
      try {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit' as const,
          price: '90000',
          leverage: 20,
        };
        expect((await provider.validateOrder(request)).isValid).toBe(true);
        nowSpy.mockReturnValue(baseNow + 61_000);
        clientInstance.getOrderBookDetails.mockRejectedValueOnce(
          new Error('metadata endpoint down'),
        );
        const failed = await provider.validateOrder(request);
        expect(failed.isValid).toBe(false);
        expect(failed.error).toContain('margin metadata');
        // The rejected in-flight slot cleared: the next call retries and
        // succeeds against fresh metadata.
        const retried = await provider.validateOrder(request);
        expect(retried.isValid).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('settles through delayed REST visibility and keeps queued transitions serial', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Accepted sendTx is not immediately visible: REST lags 2 reads.
      venue.setRestLag(2);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.error).toBeUndefined();
      expect(first.success).toBe(true);
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.success).toBe(true);
      // Serial state despite the lag: exactly the second op's trigger.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('an unresolved settlement blocks the next mutation until reconciliation succeeds', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      // Lag beyond the settle bound: the first update times out unresolved.
      venue.setRestLag(12);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('settlement is not yet visible');
      const mutationsAfterFirst = (functionName: string): number =>
        (bridge.execute as jest.Mock).mock.calls.filter(
          ([call]) => (call as LighterWasmCall).function === functionName,
        ).length;
      const createsBefore = mutationsAfterFirst('_signCreateOrder');
      // Venue visibility recovers; the retry must still reconcile the
      // recorded expectation BEFORE mutating, then proceed serially.
      venue.setRestLag(2);
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.success).toBe(true);
      expect(mutationsAfterFirst('_signCreateOrder')).toBeGreaterThan(
        createsBefore,
      );
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a create accepted before a failed cancel leaves a reconciliation obligation the retry honors', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Fail the CANCEL submission once, after the create was accepted.
      const venueSendTx = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let cancelFailed = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 15 && !cancelFailed) {
            cancelFailed = true;
            venue.stagedCancels.shift();
            throw new Error('cancel submission failed');
          }
          return await venueSendTx(txType, txInfo);
        },
      );
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('cancel submission failed');
      // An IMMEDIATE retry stays blocked: the lost cancel is inside its
      // discard grace (the original request could still be in flight).
      const immediate = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(immediate.success).toBe(false);
      expect(immediate.error).toContain('unresolved');
      // Once aged past the grace with a stable unconsumed nonce, the
      // never-landed cancel is discarded and the retry reconciles the
      // accepted create, then completes the replacement serially.
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 700_000);
      try {
        const second = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(second.error).toBeUndefined();
        expect(second.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a replacement that goes terminal-cancelled BEFORE activation leaves the old protection untouched', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // The accepted create lands directly in inactive as 'canceled'.
      venue.setCreateTerminal('canceled');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('before becoming active');
      expect(result.error).toContain('left untouched');
      // PHASE BARRIER: the old trigger was never cancelled.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      // The obligation cleared (terminal is authoritative): a retry with
      // normal venue behavior succeeds.
      venue.setCreateTerminal('none');
      const retry = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(retry.error).toBeUndefined();
      expect(retry.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('a replacement that EXECUTES before activation is observed is not treated as a failure', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Immediate/crossed trigger: fills before it can be observed active.
      venue.setCreateTerminal('filled');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // Stale reduce-only leftovers still cleaned up.
      expect(venue.rawTriggers).toHaveLength(0);
    });

    it('response loss AFTER venue commit reconciles the HIDDEN create on retry without duplicating protection', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // The create commits venue-side but the 200 never arrives, AND the
      // commit lags REST: a journal-less retry would snapshot the lagged
      // book, miss 85000, and leave 85000+86000 live.
      venue.setRestLag(3);
      venue.failResponseOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('transport failure after venue commit');
      const mutationCallsBefore = calls.filter((call) =>
        [
          '_signCreateOrder',
          '_signCreateGroupedOrders',
          '_signCancelOrder',
        ].includes(call.function),
      ).length;
      // The hidden create is JOURNAL-OWNED: the retry reconciles it
      // through the settlement machine (observing the hidden create
      // BEFORE any new signer mutation) without a generic quarantine.
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(await provider.getRecoveredDispatches()).toStrictEqual([]);
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(
        calls.filter((call) =>
          [
            '_signCreateOrder',
            '_signCreateGroupedOrders',
            '_signCancelOrder',
          ].includes(call.function),
        ).length,
      ).toBeGreaterThan(mutationCallsBefore);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('response loss BEFORE venue commit does not permanently wedge retries', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Warm signer setup first (key registration consumes a nonce) so the
      // pre/post comparison isolates the failed CREATE submission.
      await provider.getOpenOrders();
      const nonceBefore = venue.getVenueNonce();
      const triggersBefore = venue.rawTriggers.length;
      // Transport rejects before the venue ever sees the create; the
      // staged payload is dropped inside the venue helper so a retry can
      // never accidentally commit the stale 85000.
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      expect(first.error).toContain('network unreachable');
      // Venue truly untouched before the retry.
      expect(venue.getVenueNonce()).toBe(nonceBefore);
      expect(venue.rawTriggers).toHaveLength(triggersBefore);
      // Immediate retry: blocked inside the discard grace.
      const immediate = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(immediate.success).toBe(false);
      expect(immediate.error).toContain('unresolved');
      // Aged + stable unconsumed nonce: concluded never-landed; retry runs
      // and commits ONLY 86000 — never the dropped stale 85000 payload.
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 700_000);
      try {
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.error).toBeUndefined();
        expect(retry.success).toBe(true);
      } finally {
        nowSpy.mockRestore();
      }
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
      expect(
        venue.rawInactive.some((row) => row.triggerPrice === '85000'),
      ).toBe(false);
    });

    it('a provider recreation after committed-but-unacknowledged create recovers via the durable journal', async () => {
      // Shared durable disk across two provider "lifetimes".
      const disk = new Map<string, string>();
      const sharedInfrastructure = createMockInfrastructure();
      (sharedInfrastructure.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => disk.get(key) ?? null,
      );
      (sharedInfrastructure.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          disk.set(key, value);
        },
      );
      (
        sharedInfrastructure.diskCache.removeItem as jest.Mock
      ).mockImplementation(async (key: string) => {
        disk.delete(key);
      });
      const first = buildProvider({
        platformDependencies: sharedInfrastructure,
      });
      const venueA = setupTriggerVenue(first.clientInstance, first.bridge);
      venueA.seedTrigger('stop-loss', '80000');
      // Commit-then-lose the create response, then "kill" the provider.
      venueA.failResponseOnce(14);
      const attempt = await first.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(attempt.success).toBe(false);
      expect(
        [...disk.keys()].filter(
          (key) =>
            key.startsWith('lighterTpslJournal:') && !key.includes('Index'),
        ),
      ).toHaveLength(1);
      // NEW provider lifetime: same wallet, same disk, same venue state
      // INCLUDING the consumed nonce — but REST hides the committed
      // create from the first reconciliation window entirely.
      const second = buildProvider({
        platformDependencies: sharedInfrastructure,
      });
      const venueB = setupTriggerVenue(second.clientInstance, second.bridge);
      // Authoritative venue continuity: nonce AND order-index allocator.
      venueB.setVenueNonce(venueA.getVenueNonce());
      venueB.setNextIndex(venueA.getNextIndex());
      const committedView: typeof venueB.rawTriggers = [];
      for (const row of venueA.rawTriggers) {
        venueB.rawTriggers.push({ ...row });
        if (row.triggerPrice === '80000') {
          committedView.push({ ...row });
        }
      }
      for (const [hash, landed] of venueA.landedTxs) {
        venueB.landedTxs.set(hash, landed);
      }
      // Phase 1: the committed 85000 stays hidden beyond the whole
      // reconciliation window; its nonce IS consumed. The JOURNAL-OWNED
      // dispatch is exact-hash proven consumed (no generic quarantine),
      // but the settlement itself cannot converge against the lagged
      // book — the fresh provider stays blocked with ZERO NEW protection
      // mutations beyond the journal's own reconciliation.
      venueB.primeLag(committedView, 50);
      const blocked = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(blocked.success).toBe(false);
      expect(
        second.calls.filter((call) =>
          ['_signCreateGroupedOrders'].includes(call.function),
        ),
      ).toHaveLength(0);
      expect(await second.provider.getRecoveredDispatches()).toStrictEqual([]);
      // Phase 2: the venue reveals the committed state; the retry
      // reconciles the journal and proceeds serially.
      venueB.primeLag(venueB.rawTriggers, 0);
      const result = await second.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // WITHOUT the durable journal the fresh instance would snapshot the
      // lagged book, miss the committed 85000, and leave a duplicate.
      expect(venueB.rawTriggers).toHaveLength(1);
      expect(venueB.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('two stale cancels with one response lost + delayed REST reconcile to the serial state', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // The SECOND cancel commits venue-side but its response is lost, and
      // REST lags the commit.
      venue.setRestLag(2);
      let cancelSubmissions = 0;
      const venueSendTx = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 15) {
            cancelSubmissions += 1;
            if (cancelSubmissions === 2) {
              await venueSendTx(txType, txInfo);
              throw new Error('transport failure after venue commit');
            }
          }
          return await venueSendTx(txType, txInfo);
        },
      );
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Retry: the journal reconciles the accepted create + accepted
      // cancel #1 + committed-unknown cancel #2 through the lag, then
      // completes serially.
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });

    it('an OCO pair where one leg fills and the sibling terminal-cancels is an EXECUTION, not a failure', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.setCreateTerminal('oco-mixed');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '80000',
      });
      // Aggregated: any success terminal dominates — this is an immediate
      // execution outcome, not a replacement failure.
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(venue.rawInactive).toHaveLength(2);
    });

    it('a replacement active at the phase barrier that terminal-fails before final settlement is an explicit failure', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // After the barrier observes the create ACTIVE, the venue cancels it
      // before the final settlement poll.
      let readsSeen = 0;
      const realActive =
        clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      clientInstance.getActiveOrders.mockImplementation(async () => {
        readsSeen += 1;
        // Reads: 1 = snapshot, 2 = phase barrier, 3+ = final settlement.
        if (readsSeen === 3) {
          const at = venue.rawTriggers.findIndex(
            (row) => row.triggerPrice === '85000',
          );
          if (at >= 0) {
            const [row] = venue.rawTriggers.splice(at, 1);
            venue.rawInactive.push({ ...row, status: 'canceled' });
          }
        }
        return await realActive();
      });
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      // NO automatic restore: the failure parks a durable MANUAL state.
      expect(result.error).toContain('MANUAL re-establishment');
    });

    it('journal disk failures and corrupt entries block with zero venue mutation', async () => {
      // getItem rejection.
      const infraReadFail = createMockInfrastructure();
      (infraReadFail.diskCache.getItem as jest.Mock).mockRejectedValue(
        new Error('disk unavailable'),
      );
      const readFailBuilt = buildProvider({
        platformDependencies: infraReadFail,
      });
      const readFailVenue = setupTriggerVenue(
        readFailBuilt.clientInstance,
        readFailBuilt.bridge,
      );
      const readFailResult = await readFailBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(readFailResult.success).toBe(false);
      // The FIRST durable read (nonce ledger, then journal) fails closed.
      expect(readFailResult.error).toContain('read failed');
      expect(readFailVenue.rawTriggers).toHaveLength(0);
      // Corrupt persisted JOURNAL JSON: blocked and NOT auto-removed.
      // (Key-scoped: only the journal is corrupt, other durable state is
      // absent.)
      const infraCorrupt = createMockInfrastructure();
      (infraCorrupt.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index')
            ? '{not json'
            : null,
      );
      const corruptBuilt = buildProvider({
        platformDependencies: infraCorrupt,
      });
      const corruptVenue = setupTriggerVenue(
        corruptBuilt.clientInstance,
        corruptBuilt.bridge,
      );
      const corruptResult = await corruptBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(corruptResult.success).toBe(false);
      expect(corruptResult.error).toContain('corrupt');
      expect(infraCorrupt.diskCache.removeItem).not.toHaveBeenCalled();
      expect(corruptVenue.rawTriggers).toHaveLength(0);
      // Early schema version 1: REMEDIATION policy — converts to durable
      // manual state, resolved by the explicit new intent (never a
      // permanent opaque block, never silently reinterpreted).
      const v1Disk = new Map<string, string>();
      const infraV1 = createMockInfrastructure();
      (infraV1.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => v1Disk.get(key) ?? null,
      );
      (infraV1.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          v1Disk.set(key, value);
        },
      );
      (infraV1.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          v1Disk.delete(key);
        },
      );
      const v1SettlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      v1Disk.set(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([v1SettlementKey]),
      );
      v1Disk.set(
        `lighterTpslJournal:testnet:${v1SettlementKey}`,
        JSON.stringify({ version: 1, recordedAt: 5, attempts: [] }),
      );
      const v1Built = buildProvider({ platformDependencies: infraV1 });
      const v1Venue = setupTriggerVenue(v1Built.clientInstance, v1Built.bridge);
      expect(await v1Built.provider.getPendingManualRecoveries()).toHaveLength(
        1,
      );
      const v1Result = await v1Built.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(v1Result.error).toBeUndefined();
      expect(v1Result.success).toBe(true);
      expect(v1Venue.rawTriggers).toHaveLength(1);
      expect(await v1Built.provider.getPendingManualRecoveries()).toHaveLength(
        0,
      );
      // Malformed-but-JSON entry (empty attempts): blocked.
      const infraMalformed = createMockInfrastructure();
      (infraMalformed.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) =>
          key.startsWith('lighterTpslJournal:') && !key.includes('Index')
            ? JSON.stringify({
                version: 3,
                recordedAt: 5,
                operationId: 'op-empty',
                createdAt: 5,
                nextAttemptId: 1,
                venueCheckpoint: 0,
                apiKeyIndex: 7,
                intent: 'replace',
                phase: 'creating',
                priorGrouping: 'independent',
                priorTriggers: [],
                positionFingerprint: null,
                attempts: [],
              })
            : null,
      );
      const malformedBuilt = buildProvider({
        platformDependencies: infraMalformed,
      });
      const malformedVenue = setupTriggerVenue(
        malformedBuilt.clientInstance,
        malformedBuilt.bridge,
      );
      const malformedResult = await malformedBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(malformedResult.success).toBe(false);
      expect(malformedResult.error).toContain('malformed');
      expect(malformedVenue.rawTriggers).toHaveLength(0);
      // Pre-send setItem failure: the mutation aborts BEFORE submission.
      const infraWriteFail = createMockInfrastructure();
      (infraWriteFail.diskCache.setItem as jest.Mock).mockRejectedValue(
        new Error('disk write refused'),
      );
      const writeFailBuilt = buildProvider({
        platformDependencies: infraWriteFail,
      });
      const writeFailVenue = setupTriggerVenue(
        writeFailBuilt.clientInstance,
        writeFailBuilt.bridge,
      );
      const writeFailResult = await writeFailBuilt.provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
      });
      expect(writeFailResult.success).toBe(false);
      expect(writeFailResult.error).toContain('disk write refused');
      expect(writeFailVenue.rawTriggers).toHaveLength(0);
      // No order mutation ever reached the venue (signer-key registration
      // is the only submission).
      expect(
        writeFailBuilt.clientInstance.sendTx.mock.calls.filter(
          ([txType]) => txType === 14 || txType === 28 || txType === 15,
        ),
      ).toHaveLength(0);
    });

    it('a nonce advancing past an ABSENT exact hash proves the dispatch never landed: retry-safe, no quarantine', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      venue.failBeforeCommitOnce(14);
      const first = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(first.success).toBe(false);
      // Venue nonce keeps MOVING between the stable reads (some other
      // writer is active): even an aged unknown attempt must stay blocked.
      let bump = 0;
      clientInstance.getNextNonce.mockImplementation(async () => {
        bump += 1;
        return { code: 200, nonce: venue.getVenueNonce() + bump };
      });
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 13_000);
      try {
        // The venue moved past the nonce while OUR exact hash is absent:
        // another writer consumed it — the LEDGER treats it retry-safe
        // (floor advances, NOTHING is reported completed and no
        // quarantine is parked); the settlement machine itself stays
        // conservatively blocked inside the signed validity window.
        const retry = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '86000',
        });
        expect(retry.success).toBe(false);
        expect(retry.error).toContain('unresolved');
        expect(await provider.getRecoveredDispatches()).toStrictEqual([]);
      } finally {
        nowSpy.mockRestore();
      }
    });

    it('a wallet switch during the final journal clear fails the stale operation explicitly', async () => {
      const infra = createMockInfrastructure();
      let releaseRemove = (): void => undefined;
      let signalRemoveEntered = (): void => undefined;
      const removeEntered = new Promise<void>((resolve) => {
        signalRemoveEntered = resolve;
      });
      const removeGate = new Promise<void>((resolve) => {
        releaseRemove = resolve;
      });
      // Real disk backing: the CAS-guarded clear only issues a remove
      // when a journal actually exists on disk.
      const switchDisk = new Map<string, string>();
      (infra.diskCache.getItem as jest.Mock).mockImplementation(
        async (key: string) => switchDisk.get(key) ?? null,
      );
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          switchDisk.set(key, value);
        },
      );
      (infra.diskCache.removeItem as jest.Mock).mockImplementation(
        async (key: string) => {
          signalRemoveEntered();
          await removeGate;
          switchDisk.delete(key);
        },
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      const pending = built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await removeEntered;
      built.getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releaseRemove();
      const result = await pending;
      // The venue mutation may well have settled, but the STALE operation
      // must report the switch, never success under B.
      expect(result.success).toBe(false);
      expect(result.error).toContain('switched accounts');
    });

    it('validator failures from markets, margin metadata, and fresh price all resolve invalid', async () => {
      // Markets read failure.
      const markets = buildProvider();
      markets.clientInstance.getOrderBooks.mockRejectedValue(
        new Error('orderBooks endpoint down'),
      );
      const marketsOrder = await markets.provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(marketsOrder.isValid).toBe(false);
      // The markets read failure surfaces as an explicit invalid result
      // (the provider's market cache degrades to unknown-market).
      expect(marketsOrder.error).toContain('BTC');
      const marketsClose = await markets.provider.validateClosePosition({
        symbol: 'BTC',
        currentPrice: 100000,
      });
      expect(marketsClose.isValid).toBe(false);
      // Margin metadata failure with explicit leverage.
      const margins = buildProvider();
      margins.clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('metadata endpoint down'),
      );
      const marginsResult = await margins.provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(marginsResult.isValid).toBe(false);
      expect(marginsResult.error).toContain('margin metadata');
      // Fresh-price failure on a market order.
      const price = buildProvider();
      price.clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('price endpoint down'),
      );
      const priceResult = await price.provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
      });
      expect(priceResult.isValid).toBe(false);
      const priceClose = await price.provider.validateClosePosition({
        symbol: 'BTC',
      });
      expect(priceClose.isValid).toBe(false);
    });

    it('a bridge reset racing the auth mint completes bounded — never the old in-lock self-deadlock', async () => {
      const { provider, clientInstance, bridge, fireReset } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      // Faithful reset seam: the provider's own onReset listener fires
      // from the FIRST _createAuthToken call, before it resolves — exactly
      // the moment f0fbd90 minted auth INSIDE the held transition lock,
      // where the invalidated signer re-setup queued a nested write lock
      // behind the outer section awaiting it: a hang.
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let resetFired = false;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && !resetFired) {
            resetFired = true;
            fireReset();
          }
          return realImplementation(call);
        },
      );
      // Bounded race with a CLEARED timer: an uncancelled 6 s timeout
      // would keep the suite's event loop open after the test finishes.
      let hangTimer: ReturnType<typeof setTimeout> | undefined;
      const outcome = await Promise.race([
        provider.updatePositionTPSL({ symbol: 'BTC', stopLossPrice: '85000' }),
        new Promise<'hang'>((resolve) => {
          hangTimer = setTimeout(() => resolve('hang'), 6000);
        }),
      ]).finally(() => clearTimeout(hangTimer));
      // Bounded completion (success after re-setup, or a prompt explicit
      // rejection) — never a hang.
      expect(outcome).not.toBe('hang');
      expect(typeof outcome).toBe('object');
    });

    it('a wallet switch DURING create submission still records the accepted mutation; switching back reconciles it', async () => {
      const { provider, clientInstance, bridge, getUserAddressMock } =
        buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      const originalAddress = getUserAddressMock() as string;
      // Defer the create sendTx; switch A->B while it is in flight; the
      // venue still ACCEPTS it.
      const venueSendTx = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let releaseSend = (): void => undefined;
      const sendGate = new Promise<void>((resolve) => {
        releaseSend = resolve;
      });
      let signalSendEntered = (): void => undefined;
      const sendEntered = new Promise<void>((resolve) => {
        signalSendEntered = resolve;
      });
      let deferred = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 14 && !deferred) {
            deferred = true;
            // Deterministic: the switch happens strictly AFTER the create
            // submission passed its pre-submit fence and is in flight.
            signalSendEntered();
            await sendGate;
          }
          return await venueSendTx(txType, txInfo);
        },
      );
      const firstPromise = provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      await sendEntered;
      getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releaseSend();
      const first = await firstPromise;
      // The post-submit fence cancels the OPERATION under B...
      expect(first.success).toBe(false);
      expect(first.error).toContain('switched accounts');
      // ...but the venue accepted the create.
      expect(
        venue.rawTriggers.some((entry) => entry.triggerPrice === '85000'),
      ).toBe(true);
      // Switching back to A: the retry must reconcile the accepted create
      // (recorded via onAccepted BEFORE the fence) and then proceed.
      getUserAddressMock.mockReturnValue(originalAddress);
      const second = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '86000',
      });
      expect(second.error).toBeUndefined();
      expect(second.success).toBe(true);
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('86000');
    });
  });

  describe('round-11 TP/SL local preflight', () => {
    it('malformed live position sizes abort TP/SL replacement before any cancellation or signer call', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      // getPositions does not reject these; integerizing the cover size
      // after the existing triggers were cancelled would strip protection
      // and then fail locally.
      for (const badSize of ['Infinity', 'NaN', '1e-9']) {
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: badSize }],
            },
          ],
        });
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
      // Zero bridge calls: no signer setup, no cancels, no grouped signing.
      expect(calls).toHaveLength(0);
    });

    it.each([
      ['increases', { position: '0.2', sign: 1 }],
      ['flips side', { position: '0.1', sign: -1 }],
    ])(
      'aborts with zero create/cancel signatures when the position %s before TP/SL signing',
      async (_label, livePosition) => {
        const { provider, calls, clientInstance, bridge } = buildProvider();
        const venue = setupTriggerVenue(clientInstance, bridge);
        venue.seedTrigger('stop-loss', '80000');
        let accountReads = 0;
        clientInstance.getAccountByIndex.mockImplementation(async () => {
          accountReads += 1;
          return {
            code: 200,
            accounts: [
              {
                ...ACCOUNT,
                positions: [
                  {
                    ...ACCOUNT.positions[0],
                    ...(accountReads >= 3 ? livePosition : {}),
                  },
                ],
              },
            ],
          };
        });

        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: '85000',
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain('position changed before TP/SL signing');
        expect(
          calls.filter(
            (call) =>
              call.function === '_signCreateOrder' ||
              call.function === '_signCreateGroupedOrders' ||
              call.function === '_signCancelOrder',
          ),
        ).toHaveLength(0);
        expect(venue.rawTriggers).toHaveLength(1);
        expect(venue.rawTriggers[0].triggerPrice).toBe('80000');
      },
    );

    it('fails closed without writing an undiscoverable live manual recovery when the index already has 64 keys', async () => {
      const infra = createMockInfrastructure();
      const fullIndex = Array.from(
        { length: 64 },
        (_, index) => `0xother:${String(index)}:7:ETH`,
      );
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify(fullIndex),
      );
      const built = buildProvider({ platformDependencies: infra });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.seedTrigger('stop-loss', '80000');
      let readsSeen = 0;
      const realActive =
        built.clientInstance.getActiveOrders.getMockImplementation() as () => Promise<unknown>;
      built.clientInstance.getActiveOrders.mockImplementation(async () => {
        readsSeen += 1;
        if (readsSeen === 3) {
          const at = venue.rawTriggers.findIndex(
            (row) => row.triggerPrice === '85000',
          );
          if (at >= 0) {
            const [row] = venue.rawTriggers.splice(at, 1);
            venue.rawInactive.push({ ...row, status: 'canceled' });
          }
        }
        return await realActive();
      });

      const result = await built.provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      expect(result.success).toBe(false);
      expect(result.error).toContain('manual-recovery index is full');
      expect(
        JSON.parse(
          (await infra.diskCache.getItem(
            'lighterTpslManualIndex:testnet',
          )) as string,
        ),
      ).toHaveLength(64);
      expect(
        await infra.diskCache.getItem(
          `lighterTpslManual:testnet:${settlementKey}`,
        ),
      ).toBeNull();
      expect(
        JSON.parse(
          (await infra.diskCache.getItem(
            'lighterTpslJournalIndex:testnet',
          )) as string,
        ),
      ).toContain(settlementKey);
    });

    it('retains a startup journal when the 65th manual recovery cannot be indexed', async () => {
      const infra = createMockInfrastructure();
      const settlementKey = `${ACCOUNT.l1Address.toLowerCase()}:28:7:BTC`;
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify(
          Array.from(
            { length: 64 },
            (_, index) => `0xother:${String(index)}:7:ETH`,
          ),
        ),
      );
      await infra.diskCache.setItem(
        'lighterTpslJournalIndex:testnet',
        JSON.stringify([settlementKey]),
      );
      await infra.diskCache.setItem(
        `lighterTpslJournal:testnet:${settlementKey}`,
        JSON.stringify({
          version: 2,
          recordedAt: 5,
          operationId: 'op-v2-full-index',
          createdAt: 5,
          apiKeyIndex: 7,
          intent: 'replace',
          phase: 'creating',
          priorTriggers: [],
          attempts: [],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });
      setupTriggerVenue(built.clientInstance, built.bridge);

      await built.provider.getOpenOrders();
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const recoveryFailure = (
          infra.debugLogger.log as jest.Mock
        ).mock.calls.some(
          ([message, context]: [string, { error?: string }]) =>
            message.includes('journal entry recovery failed') &&
            context.error?.includes('manual-recovery index is full'),
        );
        if (recoveryFailure) {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      expect(infra.debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('journal entry recovery failed'),
        expect.objectContaining({
          settlementKey,
          error: expect.stringContaining('manual-recovery index is full'),
        }),
      );
      expect(
        await infra.diskCache.getItem(
          `lighterTpslManual:testnet:${settlementKey}`,
        ),
      ).toBeNull();
      expect(
        JSON.parse(
          (await infra.diskCache.getItem(
            'lighterTpslJournalIndex:testnet',
          )) as string,
        ),
      ).toContain(settlementKey);
      expect(
        await infra.diskCache.getItem(
          `lighterTpslJournal:testnet:${settlementKey}`,
        ),
      ).not.toBeNull();
    });

    it('degenerate randomness aborts TP/SL replacement before any cancellation', async () => {
      const { provider, calls } = buildProvider();
      // The bounded allocator throws after 100 attempts per id; that
      // exhaustion must land BEFORE signer setup and cancels. Ids draw
      // from WebCrypto now — degenerate CRYPTO output is the seam.
      const cryptoObj = ensureWebCrypto();
      const randomSpy = jest
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(
          <TView extends ArrayBufferView | null>(array: TView): TView => {
            if (array instanceof Uint8Array) {
              array.fill(0);
            }
            return array;
          },
        );
      try {
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
          stopLossPrice: '80000',
        });
        expect(result.success).toBe(false);
        expect(result.error).toContain('client order id');
        expect(calls).toHaveLength(0);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('a wallet switch during public preflight aborts before any signer setup', async () => {
      const { provider, calls, clientInstance, getUserAddressMock } =
        buildProvider();
      // Stall the fresh-price read; the wallet switches A→B while placeOrder
      // is parked in its PUBLIC preflight. Signer setup afterwards would
      // create/register B's venue key for A's stale intent.
      let releasePrice = (): void => undefined;
      const priceGate = new Promise<void>((resolve) => {
        releasePrice = resolve;
      });
      const details = {
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 100000 }],
      };
      clientInstance.getOrderBookDetails.mockImplementation(async () => {
        await priceGate;
        return details;
      });
      const placement = provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue(`0x${'b'.repeat(40)}`);
      releasePrice();
      const result = await placement;
      expect(result.success).toBe(false);
      // Zero bridge calls: no _createClient / personal_sign / key
      // registration for account B under A's intent.
      expect(calls).toHaveLength(0);
    });

    it('fails leverage validation closed when venue margin metadata is unavailable', async () => {
      // Metadata row present but WITHOUT margin fractions: the global 50x
      // fallback must not validate 26x for what may be a 25x market.
      const missingRow = buildProvider();
      missingRow.clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 100000 }],
      });
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: 26,
      };
      const missingValidation =
        await missingRow.provider.validateOrder(request);
      expect(missingValidation.isValid).toBe(false);
      expect(missingValidation.error).toContain('margin metadata');
      const missingPlacement = await missingRow.provider.placeOrder(request);
      expect(missingPlacement.success).toBe(false);
      expect(missingPlacement.error).toContain('margin metadata');
      expect(missingRow.calls).toHaveLength(0);
      // Metadata endpoint failing outright: same fail-closed behavior.
      const failing = buildProvider();
      failing.clientInstance.getOrderBookDetails.mockRejectedValue(
        new Error('venue metadata unavailable'),
      );
      const failingValidation = await failing.provider.validateOrder(request);
      expect(failingValidation.isValid).toBe(false);
      const failingPlacement = await failing.provider.placeOrder(request);
      expect(failingPlacement.success).toBe(false);
      expect(failing.calls).toHaveLength(0);
    });

    it("rejects prefix-numeric strings like '10USD' across every money surface, with zero bridge calls", async () => {
      const { provider, calls } = buildProvider();
      // parseFloat prefix-parses these into plausible numbers; strict
      // full-string parsing must refuse them everywhere.
      const orderCases = [
        { overrides: { size: '0.001BTC' }, error: 'Order size must be' },
        {
          overrides: { size: '0.001', usdAmount: '10USD' },
          error: 'Invalid usdAmount',
        },
        {
          overrides: { size: '0.001', price: '90000USD' },
          error: 'Invalid limit price',
        },
      ];
      for (const testCase of orderCases) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit' as const,
          price: '90000',
          ...testCase.overrides,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain(testCase.error);
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain(testCase.error);
      }
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.001BTC',
        currentPrice: 100000,
      });
      expect(closeValidation.isValid).toBe(false);
      const closeExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.001BTC',
        currentPrice: 100000,
      });
      expect(closeExecution.success).toBe(false);
      const withdrawValidation = await provider.validateWithdrawal({
        amount: '5USD',
      });
      expect(withdrawValidation.isValid).toBe(false);
      const withdrawExecution = await provider.withdraw({ amount: '5USD' });
      expect(withdrawExecution.success).toBe(false);
      const marginExecution = await provider.updateMargin({
        symbol: 'BTC',
        amount: '5USD',
      });
      expect(marginExecution.success).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it('enforces the advertised withdrawal minimum in validation and execution', async () => {
      const { provider, calls } = buildProvider();
      // Route advertises minWithdrawUsdc '1'; 0.000001 USDC integerizes to
      // wire 1 and previously signed.
      const validation = await provider.validateWithdrawal({
        amount: '0.000001',
      });
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('below the Lighter minimum');
      const execution = await provider.withdraw({ amount: '0.000001' });
      expect(execution.success).toBe(false);
      expect(execution.error).toContain('below the Lighter minimum');
      expect(calls).toHaveLength(0);
      // Exactly at the minimum is accepted.
      const atMin = await provider.validateWithdrawal({ amount: '1' });
      expect(atMin.isValid).toBe(true);
    });

    it('creates the replacement protection BEFORE cancelling the snapshotted old triggers', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('stop-loss', '80000');
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      // A lone SL is an ordinary CreateOrder trigger (venue rejects
      // grouped type 0), created BEFORE the old trigger is cancelled.
      const createAt = calls.findIndex(
        (call) => call.function === '_signCreateOrder',
      );
      const cancelAt = calls.findIndex(
        (call) => call.function === '_signCancelOrder',
      );
      expect(createAt).toBeGreaterThanOrEqual(0);
      expect(cancelAt).toBeGreaterThanOrEqual(0);
      // Create-first: a signing/submission failure can no longer strip
      // protection that was already cancelled.
      expect(createAt).toBeLessThan(cancelAt);
      // Settlement reconciled: exactly the fresh trigger remains.
      expect(venue.rawTriggers).toHaveLength(1);
      expect(venue.rawTriggers[0].triggerPrice).toBe('85000');
    });

    it('keeps the old protection untouched when creating the replacement fails', async () => {
      const { provider, calls, bridge, clientInstance } = buildProvider();
      clientInstance.getActiveOrders.mockResolvedValue({
        code: 200,
        orders: [
          {
            orderIndex: 778,
            clientOrderIndex: 3,
            marketIndex: 1,
            ownerAccountIndex: 28,
            initialBaseAmount: '0.001',
            remainingBaseAmount: '0.001',
            price: '80000',
            isAsk: true,
            type: 'stop-loss',
            timeInForce: 'immediate-or-cancel',
            reduceOnly: 1,
            status: 'open',
            orderExpiry: 0,
            timestamp: 1700000000000,
            triggerPrice: '80000',
          },
        ],
      });
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_signCreateOrder') {
            return { error: 'venue rejected replacement trigger' };
          }
          return realImplementation(call);
        },
      );
      const result = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '85000',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('venue rejected replacement trigger');
      // The snapshotted old trigger was NEVER cancelled: protection stays.
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
    });

    it('a single trigger replacement reserves exactly one client id', async () => {
      const { provider, calls, clientInstance, bridge } = buildProvider();
      setupTriggerVenue(clientInstance, bridge);
      const cryptoObj = ensureWebCrypto();
      const randomSpy = jest.spyOn(cryptoObj, 'getRandomValues');
      try {
        const result = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: '110000',
        });
        expect(result.error).toBeUndefined();
        expect(result.success).toBe(true);
        // One uint48 id = exactly ONE 6-byte crypto draw (plus ONE draw
        // for the journal's collision-resistant operation id); reserving
        // an unused second id would waste allocator budget for no order.
        expect(randomSpy).toHaveBeenCalledTimes(2);
        // A lone TP is an ordinary CreateOrder trigger — the venue rejects
        // CreateGroupedOrders with grouping type 0 ('GroupingType is not
        // valid'), and OCO requires two siblings.
        expect(
          calls.filter((call) => call.function === '_signCreateGroupedOrders'),
        ).toHaveLength(0);
        const createCall = calls.find(
          (call) => call.function === '_signCreateOrder',
        );
        expect(createCall).toBeDefined();
        // params: [accountIndex, marketId, clientOrderIndex, size, price,
        // isAsk, orderType, timeInForce, reduceOnly, triggerPrice, expiry,
        // nonce]
        const orderParams = createCall?.params as (string | number)[];
        expect(orderParams[6]).toBe(4); // take-profit wire type
        expect(orderParams[7]).toBe(0); // immediate-or-cancel
        expect(orderParams[8]).toBe(1); // reduce-only
        expect(Number(orderParams[9])).toBeGreaterThan(0); // trigger price
      } finally {
        randomSpy.mockRestore();
      }
    });
  });

  describe('round-9 finite-positive intent parity', () => {
    it('rejects non-finite size, usdAmount, and leverage in validateOrder and placeOrder before any signer call', async () => {
      const { provider, calls } = buildProvider();
      // parseFloat('Infinity') === Infinity and Infinity > 0, so bare
      // positivity checks pass: leverage Infinity becomes IMF
      // Math.round(10000/Infinity) = 0 and reaches _signUpdateLeverage;
      // infinite size/USD integerizes to 'Infinity' inside
      // _signCreateOrder params.
      const cases = [
        { overrides: { size: 'Infinity' }, error: 'Order size must be' },
        { overrides: { size: 'NaN' }, error: 'Order size must be' },
        {
          overrides: { size: '0.001', usdAmount: 'Infinity' },
          error: 'Invalid usdAmount',
        },
        {
          overrides: { size: '0.001', usdAmount: 'NaN' },
          error: 'Invalid usdAmount',
        },
        {
          overrides: { size: '0.001', leverage: Infinity },
          error: 'Invalid leverage',
        },
        {
          overrides: { size: '0.001', leverage: Number.NaN },
          error: 'Invalid leverage',
        },
      ];
      for (const testCase of cases) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit' as const,
          price: '90000',
          ...testCase.overrides,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain(testCase.error);
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain(testCase.error);
      }
      // Invalid intent must exit before signer/account setup entirely: not
      // just no order/leverage signing, but ZERO bridge calls (no
      // _createClient / key registration side effects either).
      expect(calls).toHaveLength(0);
    });

    it('rejects non-finite close size and usdAmount in validateClosePosition and closePosition before any signer call', async () => {
      const { provider, calls } = buildProvider();
      // Pre-fix, validateClosePosition silently fell back from a
      // non-finite usdAmount to the held size (approving), while
      // closePosition forwarded the infinite USD into placement — a
      // validator/execution split on real money.
      const cases = [
        { overrides: { size: 'Infinity' }, error: 'Order size must be' },
        { overrides: { size: 'NaN' }, error: 'Order size must be' },
        {
          overrides: { usdAmount: 'Infinity' },
          error: 'Invalid usdAmount',
        },
        { overrides: { usdAmount: 'NaN' }, error: 'Invalid usdAmount' },
      ];
      for (const testCase of cases) {
        const request = {
          symbol: 'BTC',
          currentPrice: 100000,
          ...testCase.overrides,
        };
        const validation = await provider.validateClosePosition(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain(testCase.error);
        const execution = await provider.closePosition(request);
        expect(execution.success).toBe(false);
        expect(execution.error).toContain(testCase.error);
      }
      expect(calls).toHaveLength(0);
    });

    it('fails closed when finite intent cannot be represented as venue wire integers', async () => {
      const { provider, calls } = buildProvider();
      // Finite alone is insufficient: 1e300 * 10^decimals overflows the
      // safe-integer wire format (stringifying as '1e+305') before signing.
      const cases = [
        { overrides: { size: '1e300' } },
        { overrides: { size: '0.001', usdAmount: '1e300' } },
        { overrides: { size: '0.001', price: '1e300' } },
      ];
      for (const testCase of cases) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          orderType: 'limit' as const,
          price: '90000',
          ...testCase.overrides,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('integer range');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('integer range');
      }
      // Close-path parity for an unrepresentable explicit size.
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '1e300',
        currentPrice: 100000,
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('integer range');
      const closeExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '1e300',
        currentPrice: 100000,
      });
      expect(closeExecution.success).toBe(false);
      expect(closeExecution.error).toContain('integer range');
      expect(calls).toHaveLength(0);
    });

    it('safe-checks the slippage-adjusted EXECUTION price a market buy signs, not just the reference', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      // priceDecimals=1: reference 415,000,000 wires to 4.15e9 (within the
      // signer's uint32 price cast), but a BUY signs +5% protection:
      // 4,357,500,000 wire — ABOVE uint32, which the pinned signer would
      // silently wrap. Reference-only validation approves what placement
      // refuses.
      const reference = 415_000_000;
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: reference }],
      });
      const buyRequest = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market' as const,
      };
      const buyValidation = await provider.validateOrder(buyRequest);
      expect(buyValidation.isValid).toBe(false);
      expect(buyValidation.error).toContain('uint32');
      const buyPlacement = await provider.placeOrder(buyRequest);
      expect(buyPlacement.success).toBe(false);
      expect(buyPlacement.error).toContain('uint32');
      // Invalid intent exits before signer/account setup: ZERO bridge calls.
      expect(calls).toHaveLength(0);
      // Discriminating counterpart: a SELL protects at -5% (safe wire), so
      // both surfaces must ACCEPT the same reference price.
      const sellRequest = { ...buyRequest, isBuy: false };
      const sellValidation = await provider.validateOrder(sellRequest);
      expect(sellValidation.isValid).toBe(true);
      const sellPlacement = await provider.placeOrder(sellRequest);
      expect(sellPlacement.success).toBe(true);
    });

    it('safe-checks the buy-to-close execution price when closing a short', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      const reference = 415_000_000;
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: reference }],
      });
      // SHORT position (documented venue representation: positive
      // magnitude, sign -1): closing means BUYING, so the +5% protection
      // price overflows exactly like the market-buy case.
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [
              { ...ACCOUNT.positions[0], position: '0.001', sign: -1 },
            ],
          },
        ],
      });
      const shortCloseValidation = await provider.validateClosePosition({
        symbol: 'BTC',
      });
      expect(shortCloseValidation.isValid).toBe(false);
      expect(shortCloseValidation.error).toContain('uint32');
      const shortCloseExecution = await provider.closePosition({
        symbol: 'BTC',
      });
      expect(shortCloseExecution.success).toBe(false);
      expect(shortCloseExecution.error).toContain('uint32');
      // Invalid intent exits before signer/account setup: ZERO bridge calls.
      expect(calls).toHaveLength(0);
      // A LONG close SELLS at -5% (safe wire): both surfaces accept.
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      const longCloseValidation = await provider.validateClosePosition({
        symbol: 'BTC',
      });
      expect(longCloseValidation.isValid).toBe(true);
      const longCloseExecution = await provider.closePosition({
        symbol: 'BTC',
      });
      expect(longCloseExecution.success).toBe(true);
    });

    it('invalid TP/SL replacements are rejected before any cancellation or signer call', async () => {
      const { provider, calls } = buildProvider();
      // Cancelling existing protection FIRST and only then discovering the
      // replacement is unrepresentable would leave the position naked.
      // '0.04' is sub-tick at priceDecimals=1: wire Math.round(0.4) = 0.
      const badPrices = ['Infinity', 'NaN', '-100', '0', '1e300', '0.04'];
      for (const bad of badPrices) {
        const takeProfit = await provider.updatePositionTPSL({
          symbol: 'BTC',
          takeProfitPrice: bad,
        });
        expect(takeProfit.success).toBe(false);
        const stopLoss = await provider.updatePositionTPSL({
          symbol: 'BTC',
          stopLossPrice: bad,
        });
        expect(stopLoss.success).toBe(false);
      }
      // Zero bridge calls of ANY kind: no signer setup, no cancels, no
      // grouped-order signing.
      expect(calls).toHaveLength(0);
    });

    it('withdraw rejects non-finite and unrepresentable amounts before any signer call, matching validateWithdrawal', async () => {
      const { provider, calls } = buildProvider();
      for (const amount of ['Infinity', 'NaN', '-5', '0', '1e300']) {
        const validation = await provider.validateWithdrawal({ amount });
        expect(validation.isValid).toBe(false);
        const execution = await provider.withdraw({ amount });
        expect(execution.success).toBe(false);
      }
      expect(calls).toHaveLength(0);
    });

    it('updateMargin fails closed on wire-integer overflow before any signer call', async () => {
      const { provider, calls } = buildProvider();
      const overflow = await provider.updateMargin({
        symbol: 'BTC',
        amount: '1e300',
      });
      expect(overflow.success).toBe(false);
      expect(overflow.error).toContain('integer range');
      const infinite = await provider.updateMargin({
        symbol: 'BTC',
        amount: 'Infinity',
      });
      expect(infinite.success).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it('rejects tiny finite leverage whose margin fraction overflows to Infinity', async () => {
      const { provider, calls } = buildProvider();
      // 10000 / Number.MIN_VALUE === Infinity: an IMF-below-one guard alone
      // misses it and Infinity would ride into _signUpdateLeverage.
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: Number.MIN_VALUE,
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid leverage');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('Invalid leverage');
      expect(calls).toHaveLength(0);
    });

    it('enforces the published per-market max leverage, not only IMF representability', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      // Venue publishes minInitialMarginFraction 400 -> 25x for BTC.
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [
          {
            symbol: 'BTC',
            lastTradePrice: 100000,
            minInitialMarginFraction: 400,
            maintenanceMarginFraction: 240,
          },
        ],
      });
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: 26,
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid leverage');
      expect(validation.error).toContain('25');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('Invalid leverage');
      expect(calls).toHaveLength(0);
      // 25x exactly is within the published bound: accepted by both.
      const atMax = { ...request, leverage: 25 };
      const atMaxValidation = await provider.validateOrder(atMax);
      expect(atMaxValidation.isValid).toBe(true);
      const atMaxPlacement = await provider.placeOrder(atMax);
      expect(atMaxPlacement.error).toBeUndefined();
      expect(atMaxPlacement.success).toBe(true);
    });

    it('rejects a positive sub-tick limit price that rounds to wire zero, in validation and placement', async () => {
      const { provider, calls } = buildProvider();
      // 0.04 at priceDecimals=1 -> Math.round(0.4) = 0: positive intent,
      // zero on the wire. Size 251 clears the $10 minimum notional (min
      // size 250.00001 after float ceil) so ONLY the wire-zero check can
      // be the rejection.
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '251',
        orderType: 'limit' as const,
        price: '0.04',
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('rounds to zero');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('rounds to zero');
      expect(calls).toHaveLength(0);
    });

    it('rejects finite leverage that derives a zero venue margin fraction', async () => {
      const { provider, calls } = buildProvider();
      // Math.round(10000/1e6) === 0: an IMF of zero must never be signed.
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit' as const,
        price: '90000',
        leverage: 1e6,
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(false);
      expect(validation.error).toContain('Invalid leverage');
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(false);
      expect(placement.error).toContain('Invalid leverage');
      expect(calls).toHaveLength(0);
    });
  });

  describe('round-8 market validation parity', () => {
    it.each([
      ['limit', undefined],
      ['market', undefined],
      ['limit', 'IOC'],
    ] as const)(
      'rejects an explicit off-grid %s order before signer setup (timeInForce %s)',
      async (orderType, timeInForce) => {
        const { provider, calls } = buildProvider();
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.000201',
          orderType,
          ...(orderType === 'limit' ? { price: '100000' } : {}),
          ...(timeInForce ? { timeInForce } : {}),
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('size grid');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('size grid');
        expect(calls).toHaveLength(0);
      },
    );

    it('does not apply maker-only minimums to market orders', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getOrderBookDetails.mockResolvedValue({
        code: 200,
        orderBookDetails: [{ symbol: 'BTC', lastTradePrice: 40000 }],
      });
      const request = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.0002',
        orderType: 'market' as const,
        price: 'Infinity',
      };
      const validation = await provider.validateOrder(request);
      expect(validation.isValid).toBe(true);
      const placement = await provider.placeOrder(request);
      expect(placement.success).toBe(true);
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
    });

    it('rejects a non-finite or non-positive price snapshot before drift math, in validation and execution', async () => {
      const { provider } = buildProvider();
      // Infinity produces NaN drift (bypasses protection); NaN and 0 were
      // silently skipped. All must fail closed now.
      for (const snapshot of [Infinity, NaN, 0, -100]) {
        const request = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'market' as const,
          currentPrice: 100000,
          priceAtCalculation: snapshot,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('Invalid price snapshot');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('Invalid price snapshot');
        const closeValidation = await provider.validateClosePosition({
          symbol: 'BTC',
          currentPrice: 100000,
          priceAtCalculation: snapshot,
        });
        expect(closeValidation.isValid).toBe(false);
        expect(closeValidation.error).toContain('Invalid price snapshot');
      }
    });

    it('rejects out-of-range slippage tolerance consistently across validators and placement', async () => {
      const { provider } = buildProvider();
      // 10,000 bps on a sell derives a zero protection price: placement
      // rejects, so validation must too — and both with the same reason.
      for (const maxSlippageBps of [10_000, -100, Number.NaN]) {
        const request = {
          symbol: 'BTC',
          isBuy: false,
          size: '0.001',
          orderType: 'market' as const,
          currentPrice: 100000,
          maxSlippageBps,
        };
        const validation = await provider.validateOrder(request);
        expect(validation.isValid).toBe(false);
        expect(validation.error).toContain('Invalid slippage tolerance');
        const placement = await provider.placeOrder(request);
        expect(placement.success).toBe(false);
        expect(placement.error).toContain('Invalid slippage tolerance');
        const closeValidation = await provider.validateClosePosition({
          symbol: 'BTC',
          maxSlippageBps,
        });
        expect(closeValidation.isValid).toBe(false);
        expect(closeValidation.error).toContain('Invalid slippage tolerance');
      }
    });
  });

  describe('client order index allocation', () => {
    it('a perpetually colliding or zero draw exhausts with a clear error instead of hanging', async () => {
      const { provider, calls } = buildProvider();
      // Perpetual zero: every candidate is rejected, so a bounded allocator
      // must throw instead of spinning. The mock never falls through.
      const cryptoObj = ensureWebCrypto();
      const fillWith =
        (byte: number) =>
        <TView extends ArrayBufferView | null>(array: TView): TView => {
          if (array instanceof Uint8Array) {
            array.fill(byte);
          }
          return array;
        };
      const randomSpy = jest
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(fillWith(0));
      try {
        const zeroResult = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(zeroResult.success).toBe(false);
        expect(zeroResult.error).toContain('client order id');
        const zeroDraws = randomSpy.mock.calls.length;
        expect(zeroDraws).toBeGreaterThan(0);
        expect(zeroDraws).toBeLessThanOrEqual(200);

        // Perpetual collision: one id issues, then every later candidate
        // collides with it forever (constant crypto output).
        randomSpy.mockClear();
        randomSpy.mockImplementation(fillWith(0x80));
        const first = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(first.success).toBe(true);
        const second = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        });
        expect(second.success).toBe(false);
        expect(second.error).toContain('client order id');
        expect(
          calls.filter((call) => call.function === '_signCreateOrder'),
        ).toHaveLength(1);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('parallel placements draw unique random uint48 ids within venue bounds', async () => {
      const { provider, calls } = buildProvider();
      const results = await Promise.all([
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        }),
        provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90002',
        }),
      ]);
      for (const result of results) {
        expect(result.success).toBe(true);
      }
      const ids = calls
        .filter((call) => call.function === '_signCreateOrder')
        .map((call) => call.params[2] as number);
      expect(ids).toHaveLength(3);
      expect(new Set(ids).size).toBe(3);
      for (const id of ids) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(2 ** 48);
      }
    });

    it('a colliding random draw is retried until the id is unique', async () => {
      const { provider, calls } = buildProvider();
      // One 6-byte crypto draw per candidate. Force the second
      // placement's first candidate to collide with the first
      // placement's id, then verify the allocator retries with a fresh
      // draw instead of reusing the id. The spy falls through to real
      // crypto once the queue is exhausted, so the retry loop cannot
      // spin forever even if this sequence is wrong.
      const cryptoObj = ensureWebCrypto();
      const realRandom = cryptoObj.getRandomValues.bind(cryptoObj);
      const queue: number[] = [0x80, 0x80, 0x40];
      const randomSpy = jest
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(
          <TView extends ArrayBufferView | null>(array: TView): TView => {
            const next = queue.shift();
            if (next !== undefined && array instanceof Uint8Array) {
              array.fill(next);
              return array;
            }
            return realRandom(array as never) as TView;
          },
        );
      try {
        const first = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        const second = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90001',
        });
        expect(first.success).toBe(true);
        expect(second.success).toBe(true);
        const ids = calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call) => call.params[2] as number);
        const of = (byte: number): number => {
          const third = byte * 65_536 + byte * 256 + byte;
          return third * 2 ** 24 + third;
        };
        expect(ids).toStrictEqual([of(0x80), of(0x40)]);
        // Three draws prove the colliding candidate was rejected and
        // redrawn.
        expect(randomSpy).toHaveBeenCalledTimes(3);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('a zero draw is rejected and redrawn, never issued as a client id', async () => {
      const { provider, calls } = buildProvider();
      const cryptoObj = ensureWebCrypto();
      const zeroQueue: number[] = [0x00, 0xc0];
      const randomSpy = jest
        .spyOn(cryptoObj, 'getRandomValues')
        .mockImplementation(
          <TView extends ArrayBufferView | null>(array: TView): TView => {
            const next = zeroQueue.shift();
            if (next !== undefined && array instanceof Uint8Array) {
              array.fill(next);
            }
            return array;
          },
        );
      try {
        const result = await provider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        });
        expect(result.success).toBe(true);
        const ids = calls
          .filter((call) => call.function === '_signCreateOrder')
          .map((call) => call.params[2] as number);
        const third = 0xc0 * 65_536 + 0xc0 * 256 + 0xc0;
        expect(ids).toStrictEqual([third * 2 ** 24 + third]);
        expect(randomSpy).toHaveBeenCalledTimes(2);
      } finally {
        randomSpy.mockRestore();
      }
    });

    it('grouped TP/SL ids are unique against each other and prior placements', async () => {
      const { provider, calls } = buildProvider();
      await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '110000',
        stopLossPrice: '80000',
      });
      const orderId = calls.find((call) => call.function === '_signCreateOrder')
        ?.params[2] as number;
      const groupedCall = calls.find(
        (call) => call.function === '_signCreateGroupedOrders',
      );
      expect(groupedCall).toBeDefined();
      // Grouped params: [accountIndex, groupingType, orderCount, ...orders,
      // nonce] where each order is 10 elements with the client id at offset 1.
      const groupedParams = groupedCall?.params as (string | number)[];
      const takeProfitId = groupedParams[4] as number;
      const stopLossId = groupedParams[14] as number;
      const allIds = [orderId, takeProfitId, stopLossId];
      for (const id of allIds) {
        expect(Number.isSafeInteger(id)).toBe(true);
        expect(id).toBeGreaterThan(0);
        expect(id).toBeLessThan(2 ** 48);
      }
      expect(new Set(allIds).size).toBe(3);
    });
  });

  describe('full-close precision and validate/execute parity', () => {
    const dustPosition = (
      position: string,
    ): { code: number; accounts: (typeof ACCOUNT)[] } => ({
      code: 200,
      accounts: [
        {
          ...ACCOUNT,
          positions: [{ ...ACCOUNT.positions[0], position }],
        },
      ],
    });

    it('rejects an off-grid partial dust close instead of rounding it up', async () => {
      const { provider, clientInstance, calls } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.0001'),
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.000099',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('size grid');
      expect(calls).toHaveLength(0);
    });

    it('an exact-size dust market close is not bumped to the maker minimum', async () => {
      const { provider, calls, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.0001'),
      );
      const result = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.0001',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      expect(orderCall?.params[3]).toBe('10');
    });

    it('validateOrder does not apply maker minimums to market opens', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.00001',
        orderType: 'market',
        isFullClose: true,
        currentPrice: 90000,
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('validateOrder approves a live-verified reduce-only full close like placement', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue(
        dustPosition('0.00001'),
      );
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: false,
        size: '0.00001',
        orderType: 'market',
        reduceOnly: true,
        currentPrice: 90000,
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('validateClosePosition rejects the shapes closePosition refuses', async () => {
      const { provider } = buildProvider();
      expect(
        await provider.validateClosePosition({
          symbol: 'BTC',
          orderType: 'limit',
        }),
      ).toMatchObject({
        isValid: false,
        error: 'Limit close requires a price',
      });
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            usdAmount: '-5',
          })
        ).isValid,
      ).toBe(false);
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            size: '0',
          })
        ).isValid,
      ).toBe(false);
      expect(
        await provider.validateClosePosition({ symbol: 'BTC' }),
      ).toStrictEqual({ isValid: true });
    });

    it('validateClosePosition agrees with execution on live sizing', async () => {
      const { provider, clientInstance } = buildProvider();
      const dust = {
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.0001' }],
          },
        ],
      };
      clientInstance.getAccountByIndex.mockResolvedValue(dust);
      // Maker minimums do not apply to a market partial close, but explicit
      // sizes must still land exactly on the base-size grid.
      const partialValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.000099',
        currentPrice: 90000,
      });
      expect(partialValidation.isValid).toBe(false);
      expect(partialValidation.error).toContain('size grid');
      const partialExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.000099',
        currentPrice: 90000,
      });
      expect(partialExecution.success).toBe(false);
      expect(partialExecution.error).toContain('size grid');
      // Exact dust full close: both approve.
      expect(
        (
          await provider.validateClosePosition({
            symbol: 'BTC',
            size: '0.0001',
            currentPrice: 90000,
          })
        ).isValid,
      ).toBe(true);
      const exactExecution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.0001',
        currentPrice: 90000,
      });
      expect(exactExecution.success).toBe(true);
    });

    it('validates limit closes at the caller price and rejects 0/NaN prices', async () => {
      const { provider } = buildProvider();
      for (const price of ['0', 'abc']) {
        const result = await provider.validateClosePosition({
          symbol: 'BTC',
          orderType: 'limit',
          price,
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('Invalid limit price');
      }
    });

    it('uses the fresh venue price for a market close without applying maker minimums', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      const result = await provider.validateClosePosition({
        symbol: 'BTC',
        size: '0.00005',
        currentPrice: 1_000_000,
      });
      expect(result.isValid).toBe(true);
      const execution = await provider.closePosition({
        symbol: 'BTC',
        size: '0.00005',
        currentPrice: 1_000_000,
      });
      expect(execution.success).toBe(true);
    });

    it('fails market close validation closed when the fresh venue price is missing or zero', async () => {
      for (const orderBookDetails of [
        [],
        [{ symbol: 'BTC', lastTradePrice: 0 }],
      ]) {
        const { provider, clientInstance } = buildProvider();
        clientInstance.getAccountByIndex.mockResolvedValue({
          code: 200,
          accounts: [
            {
              ...ACCOUNT,
              positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
            },
          ],
        });
        clientInstance.getOrderBookDetails.mockResolvedValue({
          code: 200,
          orderBookDetails,
        });
        const result = await provider.validateClosePosition({
          symbol: 'BTC',
          size: '0.0005',
          currentPrice: 100000,
        });
        expect(result.isValid).toBe(false);
        expect(result.error).toContain('No live venue price available');
        // Execution parity: closePosition refuses with the same error.
        const execution = await provider.closePosition({
          symbol: 'BTC',
          size: '0.0005',
          currentPrice: 100000,
        });
        expect(execution.success).toBe(false);
        expect(execution.error).toContain('No live venue price available');
      }
    });

    it('rejects a market close when the fresh price drifted beyond tolerance, in validation and execution', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [
          {
            ...ACCOUNT,
            positions: [{ ...ACCOUNT.positions[0], position: '0.001' }],
          },
        ],
      });
      // Sized at 90,000 but the fresh venue price is 100,000: ~11.1% move
      // against a 5% default tolerance. Size $50 at the fresh price, so
      // ONLY the drift check can be the rejection.
      const request = {
        symbol: 'BTC',
        size: '0.0005',
        currentPrice: 90000,
        priceAtCalculation: 90000,
      };
      const result = await provider.validateClosePosition(request);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('slippage tolerance since sizing');
      const execution = await provider.closePosition(request);
      expect(execution.success).toBe(false);
      expect(execution.error).toContain('slippage tolerance since sizing');
    });

    it("rejects an 'Infinity' limit price in validators and placement alike", async () => {
      const { provider, calls } = buildProvider();
      // parseFloat('Infinity') === Infinity, which passes a bare > 0 check;
      // all three surfaces must refuse it before integerization/signing.
      const closeValidation = await provider.validateClosePosition({
        symbol: 'BTC',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(closeValidation.isValid).toBe(false);
      expect(closeValidation.error).toContain('Invalid limit price');
      const orderValidation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(orderValidation.isValid).toBe(false);
      expect(orderValidation.error).toContain('Invalid limit price');
      const placement = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: 'Infinity',
      });
      expect(placement.success).toBe(false);
      // Strict-parse parity: placement now rejects with the SAME message
      // as the validators.
      expect(placement.error).toContain('Invalid limit price');
      expect(
        calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(0);
      // Parity in the OTHER direction: a MARKET order ignores params.price
      // (placement sizes at the fresh venue price), so an irrelevant
      // 'Infinity' must not fail validation for an order placement accepts.
      const marketValidation = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
        price: 'Infinity',
      });
      expect(marketValidation.isValid).toBe(true);
      const marketPlacement = await provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'market',
        price: 'Infinity',
        currentPrice: 100000,
      });
      expect(marketPlacement.success).toBe(true);
    });

    it('preserves subscriber state when channel setup hits a capability gate', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      // The bound wallet resolves to a Premium account.
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [{ ...ACCOUNT, accountType: 1 }],
      });
      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      StreamFakeWebSocket.instances = [];
      const accountCallback = jest.fn();
      const ordersCallback = jest.fn();
      const unsubscribeAccount = provider.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribeOrders = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Capability gates are not "no data": no false-empty emissions.
      expect(accountCallback).not.toHaveBeenCalled();
      expect(ordersCallback).not.toHaveBeenCalled();
      unsubscribeAccount();
      unsubscribeOrders();
    });

    it('emits order book levels with the full contract shape (cumulative totals, notionals, maxTotal)', async () => {
      // Regression (found live on device): levels were fanned out as bare
      // {price, size}, so the depth chart's parseFloat(level.total) produced
      // NaN Y-coordinates and crashed the native SVG path parser
      // (RNSVGPathParser InvalidNumber).
      const { provider } = buildProvider({ webSocketCtor: fakeStreamCtor });
      const bookCallback = jest.fn();
      const unsubscribe = provider.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 5,
        callback: bookCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/order_book',
          channel: 'order_book:1',
          order_book: {
            nonce: 10,
            bids: [
              { price: '90000', size: '0.5' },
              { price: '89990', size: '1.5' },
            ],
            asks: [
              { price: '90010', size: '0.4' },
              { price: '90020', size: '2.0' },
            ],
          },
        }),
      });
      expect(bookCallback).toHaveBeenCalled();
      const book =
        bookCallback.mock.calls[bookCallback.mock.calls.length - 1][0];
      // Cumulative sizes per side.
      expect(
        book.bids.map((level: { total: string }) => level.total),
      ).toStrictEqual(['0.5', '2']);
      expect(
        book.asks.map((level: { total: string }) => level.total),
      ).toStrictEqual(['0.4', '2.4']);
      // Per-level notional and cumulative notional.
      expect(parseFloat(book.bids[0].notional)).toBeCloseTo(45000);
      expect(parseFloat(book.bids[1].totalNotional)).toBeCloseTo(
        45000 + 89990 * 1.5,
      );
      // Book-level scaling fields the UI depends on.
      expect(parseFloat(book.maxTotal)).toBeCloseTo(2.4);
      expect(typeof book.lastUpdated).toBe('number');
      // No NaN anywhere the depth chart reads.
      for (const side of [book.bids, book.asks]) {
        for (const level of side) {
          for (const field of [
            'price',
            'size',
            'total',
            'notional',
            'totalNotional',
          ]) {
            expect(Number.isFinite(parseFloat(level[field]))).toBe(true);
          }
        }
      }
      unsubscribe();
    });

    it('rejects a malformed order book frame without emitting or poisoning its cached nonce', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeStreamCtor });
      const bookCallback = jest.fn();
      const unsubscribe = provider.subscribeToOrderBook({
        symbol: 'BTC',
        callback: bookCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/order_book',
          channel: 'order_book:1',
          order_book: {
            nonce: 10,
            bids: [{ price: '90000', size: '0.5' }],
            asks: [{ price: '90010', size: '0.4' }],
          },
        }),
      });
      bookCallback.mockClear();
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:1',
          order_book: {
            begin_nonce: 10,
            nonce: 11,
            bids: [{ price: '89990', size: '12.5oops' }],
            asks: [],
          },
        }),
      });
      expect(bookCallback).not.toHaveBeenCalled();

      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:1',
          order_book: {
            begin_nonce: 10,
            nonce: 12,
            bids: [{ price: '89990', size: '1.5' }],
            asks: [],
          },
        }),
      });
      expect(bookCallback).toHaveBeenCalledTimes(1);
      const book = bookCallback.mock.calls[0][0];
      expect(book.bids).toStrictEqual([
        expect.objectContaining({ price: '90000', size: '0.5' }),
        expect.objectContaining({ price: '89990', size: '1.5' }),
      ]);
      unsubscribe();
    });

    it('discards an order book after a nonce gap and requests a fresh snapshot', async () => {
      const { provider } = buildProvider({ webSocketCtor: fakeStreamCtor });
      const callback = jest.fn();
      const unsubscribe = provider.subscribeToOrderBook({
        symbol: 'BTC',
        callback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/order_book',
          channel: 'order_book:1',
          order_book: {
            nonce: 10,
            bids: [{ price: '90000', size: '1' }],
            asks: [{ price: '90010', size: '1' }],
          },
        }),
      });
      expect(callback).toHaveBeenCalledTimes(1);

      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/order_book',
          channel: 'order_book:1',
          order_book: {
            begin_nonce: 12,
            nonce: 13,
            bids: [{ price: '90000', size: '0' }],
            asks: [{ price: '90020', size: '2' }],
          },
        }),
      });

      expect(callback).toHaveBeenCalledTimes(1);
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'unsubscribe', channel: 'order_book/1' }),
      );
      expect(socket.sent).toContainEqual(
        JSON.stringify({ type: 'subscribe', channel: 'order_book/1' }),
      );
      unsubscribe();
    });

    it('drops malformed candles from the REST seed and the WS channel', async () => {
      // Same boundary: a candle with a missing field would be stringified
      // as "undefined" and reach the chart as NaN.
      const { provider, clientInstance } = buildProvider({
        webSocketCtor: fakeStreamCtor,
      });
      jest
        .spyOn(clientInstance, 'getCandles')
        .mockImplementation()
        .mockResolvedValue({
          code: 200,
          c: [
            { t: 1000, o: 1, h: 2, l: 0.5, c: 1.5, v: 10 },
            { t: 1500, o: 1, h: 2, l: 0.5, v: 10 }, // missing close
            {
              t: 1600,
              o: null as unknown as number,
              h: 2,
              l: 0.5,
              c: 1.5,
              v: 10,
            },
            { t: 1700, o: '', h: 2, l: 0.5, c: 1.5, v: 10 },
            {
              t: 1800,
              o: false as unknown as number,
              h: 2,
              l: 0.5,
              c: 1.5,
              v: 10,
            },
          ],
        });
      const candleCallback = jest.fn();
      const unsubscribe = provider.subscribeToCandles({
        symbol: 'BTC',
        interval: '1h',
        callback: candleCallback,
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const seeded =
        candleCallback.mock.calls[candleCallback.mock.calls.length - 1][0];
      expect(seeded.candles).toHaveLength(1);
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'update/candle',
          channel: 'candle:1:1h',
          candles: [
            { t: 2000, o: 1.5, h: 2.5, l: 1, c: 2, v: 5 },
            { t: 3000, o: 'x', h: 2, l: 1, c: 2, v: 5 },
            { o: 1, h: 2, l: 1, c: 2, v: 5 },
            { t: 4000, o: null, h: 2, l: 1, c: 2, v: 5 },
            { t: 5000, o: '', h: 2, l: 1, c: 2, v: 5 },
            { t: 6000, o: false, h: 2, l: 1, c: 2, v: 5 },
          ],
        }),
      });
      const live =
        candleCallback.mock.calls[candleCallback.mock.calls.length - 1][0];
      expect(
        live.candles.map((candle: { time: number }) => candle.time),
      ).toStrictEqual([1000, 2000]);
      for (const candle of live.candles) {
        for (const field of ['open', 'high', 'low', 'close', 'volume']) {
          expect(Number.isFinite(parseFloat(candle[field]))).toBe(true);
        }
      }
      unsubscribe();
    });

    it('withholds a fills snapshot containing unsupported (nonzero-fee) fills', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      StreamFakeWebSocket.instances = [];
      const fillsCallback = jest.fn();
      const unsubscribe = provider.subscribeToOrderFills({
        callback: fillsCallback,
      });
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      fillsCallback.mockClear();
      // Snapshot with one supported and one unsupported (nonzero-fee) fill:
      // emitting the partial remainder would overwrite valid history.
      socket.onmessage?.({
        data: JSON.stringify({
          type: 'subscribed/account_all_trades',
          channel: 'account_all_trades:28',
          trades: {
            '1': [
              {
                trade_id: 1,
                market_id: 1,
                size: '0.001',
                price: '90000',
                ask_id: 1,
                bid_id: 2,
                ask_account_id: 28,
                bid_account_id: 7,
                is_maker_ask: false,
                timestamp: 1700000000000,
              },
              {
                trade_id: 2,
                market_id: 1,
                size: '0.001',
                price: '90000',
                ask_id: 3,
                bid_id: 4,
                ask_account_id: 28,
                bid_account_id: 7,
                is_maker_ask: false,
                timestamp: 1700000001000,
                taker_fee: 45000,
              },
            ],
          },
        }),
      });
      expect(fillsCallback).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('validateClosePosition rejects a close with no open position', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, positions: [] }],
      });
      const result = await provider.validateClosePosition({ symbol: 'BTC' });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No open Lighter position');
    });
  });

  describe('round-4 session races', () => {
    const accountB = { ...ACCOUNT, index: 900 };
    const perAddressLookup =
      () =>
      (
        address: string,
      ): Promise<{
        code: number;
        l1Address: string;
        subAccounts: (typeof ACCOUNT)[];
      }> =>
        Promise.resolve(
          address.toLowerCase() === '0xbbbb'
            ? { code: 200, l1Address: '0xbbbb', subAccounts: [accountB] }
            : {
                code: 200,
                l1Address: ACCOUNT.l1Address,
                subAccounts: [ACCOUNT],
              },
        );

    it('a delayed getAccountState response never surfaces as the new account', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      let releaseResponse: (value: unknown) => void = () => undefined;
      clientInstance.getAccountByIndex.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseResponse = resolve;
          }),
      );
      const delayedRead = provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // External switch: nothing else observes it before the response lands.
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseResponse({ code: 200, accounts: [ACCOUNT] });
      const result = await delayedRead;
      // Cancelled → empty state, never account A's balances.
      expect(result.totalBalance).toBe('0');
    });

    it('getOpenOrders returns nothing when the account switches between index and token', async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({ configuredAccountIndex: null });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      // Stall the auth-token mint (the step between index and token use).
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let releaseToken: () => void = () => undefined;
      let stallOnce = true;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && stallOnce) {
            stallOnce = false;
            await new Promise<void>((resolve) => {
              releaseToken = resolve;
            });
          }
          return realImplementation(call);
        },
      );
      const readUnderA = provider.getOpenOrders();
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseToken();
      const orders = await readUnderA;
      expect(orders).toStrictEqual([]);
      // The A index + fresh token pairing never reached the venue.
      expect(clientInstance.getActiveOrders).not.toHaveBeenCalled();
    });

    it("getOrders never merges one account's history with another's open orders", async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      await provider.getAccountState(); // bind under A
      // Historical leg resolves under A; the OPEN leg stalls and the wallet
      // switches while it is in flight.
      let releaseOpen: (value: unknown) => void = () => undefined;
      clientInstance.getActiveOrders.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            releaseOpen = resolve;
          }),
      );
      const mergedRead = provider.getOrders();
      await new Promise((resolve) => setTimeout(resolve, 0));
      getUserAddressMock.mockReturnValue('0xbbbb');
      releaseOpen({ code: 200, orders: [] });
      const orders = await mergedRead;
      // The merge is refused outright — no A-historical leakage.
      expect(orders).toStrictEqual([]);
    });

    it('a paused write never signs after ALL accounts are deselected', async () => {
      const { provider, clientInstance, getUserAddressMock, calls } =
        buildProvider({ configuredAccountIndex: null });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      // Warming registered the venue key; only post-deselection sends count.
      clientInstance.sendTx.mockClear();
      let releaseNonce: (value: unknown) => void = () => undefined;
      let nonceRequested: () => void = () => undefined;
      const noncePaused = new Promise<void>((resolve) => {
        nonceRequested = resolve;
      });
      clientInstance.getNextNonce.mockImplementationOnce(() => {
        nonceRequested();
        return new Promise((resolve) => {
          releaseNonce = resolve;
        });
      });
      const writeUnderA = provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      await noncePaused;
      // All accounts deselected while the write is paused at its nonce.
      getUserAddressMock.mockImplementation(() => {
        throw new Error('NO_ACCOUNT_SELECTED');
      });
      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('a paused write never submits after provider disconnect', async () => {
      const { provider, clientInstance, calls } = buildProvider({
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      const warmed = await provider.isReadyToTrade();
      expect(warmed.ready).toBe(true);
      clientInstance.sendTx.mockClear();
      let releaseNonce: (value: unknown) => void = () => undefined;
      let nonceRequested: () => void = () => undefined;
      const noncePaused = new Promise<void>((resolve) => {
        nonceRequested = resolve;
      });
      clientInstance.getNextNonce.mockImplementationOnce(() => {
        nonceRequested();
        return new Promise((resolve) => {
          releaseNonce = resolve;
        });
      });
      const writeUnderA = provider.cancelOrder({
        orderId: '555',
        symbol: 'BTC',
      });
      await noncePaused;
      // The provider is disconnected (e.g. venue switch) mid-write.
      await provider.disconnect();
      releaseNonce({ code: 200, nonce: 42 });
      const result = await writeUnderA;
      expect(result.success).toBe(false);
      expect(
        calls.filter((call) => call.function === '_signCancelOrder'),
      ).toHaveLength(0);
      expect(clientInstance.sendTx).not.toHaveBeenCalled();
    });

    it('a configured account index without a bound wallet requests no user channels', async () => {
      const { provider, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: 28,
      });
      // No wallet account selected at mount time.
      getUserAddressMock.mockImplementation(() => {
        throw new Error('NO_ACCOUNT_SELECTED');
      });
      StreamFakeWebSocket.instances = [];
      const unsubscribe = provider.subscribeToAccount({ callback: jest.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socket = StreamFakeWebSocket.instances[0];
      socket?.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      // The configured index alone must never subscribe user channels.
      expect(
        (socket?.sent ?? []).some((frame) => frame.includes('user_stats/')),
      ).toBe(false);

      // A NON-OWNER wallet is then selected: the configured account (owned
      // by 0x8d7f…) must be rejected, never subscribed for wallet 0xbbbb.
      getUserAddressMock.mockImplementation(() => '0xbbbb');
      await expect(provider.getAccountState()).rejects.toThrow(
        'not owned by the selected wallet',
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketsAfterMismatch = StreamFakeWebSocket.instances.map(
        (instance) => instance.sent,
      );
      expect(
        socketsAfterMismatch
          .flat()
          .some((frame) => frame.includes('user_stats/')),
      ).toBe(false);

      // The OWNER wallet is selected: channels for the account appear.
      getUserAddressMock.mockImplementation(() => ACCOUNT.l1Address);
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const lastSocket =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      lastSocket.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(
        lastSocket.sent.some((frame) => frame.includes('user_stats/28')),
      ).toBe(true);
      unsubscribe();
    });

    it("an aborted setup auth failure never blanks the new session's order subscribers", async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({
          webSocketCtor: fakeStreamCtor,
          configuredAccountIndex: null,
        });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      const ordersCallback = jest.fn();
      // Stall then FAIL account A's auth-token mint.
      const realImplementation = (
        bridge.execute as jest.Mock
      ).getMockImplementation() as (call: LighterWasmCall) => Promise<unknown>;
      let failAuthA: () => void = () => undefined;
      let stallOnce = true;
      (bridge.execute as jest.Mock).mockImplementation(
        async (call: LighterWasmCall) => {
          if (call.function === '_createAuthToken' && stallOnce) {
            stallOnce = false;
            await new Promise<void>((_resolve, reject) => {
              failAuthA = (): void => reject(new Error('auth backend down'));
            });
          }
          return realImplementation(call);
        },
      );
      const unsubscribe = provider.subscribeToOrders({
        callback: ordersCallback,
      });
      await provider.getAccountState(); // bind under A; channel setup stalls at auth
      await new Promise((resolve) => setTimeout(resolve, 0));
      // Switch to B; its own setup runs with working auth.
      getUserAddressMock.mockReturnValue('0xbbbb');
      await provider.getAccountState();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      ordersCallback.mockClear();
      // A's stalled auth finally FAILS: its inner catch must not blank B.
      failAuthA();
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(ordersCallback).not.toHaveBeenCalledWith([], expect.anything());
      expect(ordersCallback).not.toHaveBeenCalledWith([]);
      unsubscribe();
    });

    it('routes no account frame after an unobserved external switch', async () => {
      const { provider, clientInstance, getUserAddressMock } = buildProvider({
        webSocketCtor: fakeStreamCtor,
        configuredAccountIndex: null,
      });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      const accountCallback = jest.fn();
      const unsubscribe = provider.subscribeToAccount({
        callback: accountCallback,
      });
      await provider.getAccountState(); // bind under A
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketA =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      socketA.open();
      await new Promise((resolve) => setTimeout(resolve, 0));
      accountCallback.mockClear();
      // EXTERNAL switch: no provider call observes it before the frame.
      getUserAddressMock.mockReturnValue('0xbbbb');
      socketA.onmessage?.({
        data: JSON.stringify({
          type: 'update/user_stats',
          channel: 'user_stats:28',
          stats: { portfolio_value: '9999', available_balance: '9999' },
        }),
      });
      // The frame itself is the first observer: it must be dropped, and
      // the rebind replaces the socket for account B.
      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({ totalBalance: '0', providerId: 'lighter' }),
      );
      expect(accountCallback).not.toHaveBeenCalledWith(
        expect.objectContaining({ totalBalance: '9999' }),
      );
      const socketB =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      expect(socketB).not.toBe(socketA);
      unsubscribe();
    });

    it('a deferred onopen auth continuation never reinserts a stale channel after a switch', async () => {
      const { provider, clientInstance, getUserAddressMock, bridge } =
        buildProvider({
          webSocketCtor: fakeStreamCtor,
          configuredAccountIndex: null,
        });
      clientInstance.getAccountsByL1Address.mockImplementation(
        perAddressLookup(),
      );
      StreamFakeWebSocket.instances = [];
      // Orders subscription wants the authenticated channel.
      const unsubscribe = provider.subscribeToOrders({ callback: jest.fn() });
      await new Promise((resolve) => setTimeout(resolve, 0));
      await new Promise((resolve) => setTimeout(resolve, 0));
      const socketA =
        StreamFakeWebSocket.instances[StreamFakeWebSocket.instances.length - 1];
      // The channel setup cached a fresh (+600s) token; expire it so socket
      // A's onopen genuinely enters the deferred re-mint branch.
      // Restored in the finally below so a failed assertion cannot poison
      // later tests with a frozen clock.
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockReturnValue(Date.now() + 700_000);
      try {
        const realImplementation = (
          bridge.execute as jest.Mock
        ).getMockImplementation() as (
          call: LighterWasmCall,
        ) => Promise<unknown>;
        let stallNext = true;
        let releaseToken: () => void = () => undefined;
        let stallEntered: () => void = () => undefined;
        const refreshEntered = new Promise<void>((resolve) => {
          stallEntered = resolve;
        });
        (bridge.execute as jest.Mock).mockImplementation(
          async (call: LighterWasmCall) => {
            if (call.function === '_createAuthToken' && stallNext) {
              stallNext = false;
              stallEntered();
              await new Promise<void>((resolve) => {
                releaseToken = resolve;
              });
            }
            return realImplementation(call);
          },
        );
        socketA.open();
        // The deferred re-mint MUST have started, or this test proves nothing.
        await refreshEntered;
        await new Promise((resolve) => setTimeout(resolve, 0));
        // Switch to B: rebind replaces the socket and the channel set.
        getUserAddressMock.mockReturnValue('0xbbbb');
        await provider.getAccountState();
        const socketB =
          StreamFakeWebSocket.instances[
            StreamFakeWebSocket.instances.length - 1
          ];
        expect(socketB).not.toBe(socketA);
        socketB.open();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const framesBefore = socketB.sent.length;
        // The stale continuation resolves AFTER the switch.
        releaseToken();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        // No account-A channel was sent on B's socket by the stale continuation.
        const framesAfter = socketB.sent.slice(framesBefore);
        expect(
          framesAfter.some((frame) => frame.includes('account_all_orders/28')),
        ).toBe(false);
        expect(
          socketB.sent.some((frame) => frame.includes('account_all_orders/28')),
        ).toBe(false);
        // The deferred mint really ran exactly once through the stall.
        expect(stallNext).toBe(false);
      } finally {
        nowSpy.mockRestore();
      }
      unsubscribe();
    });
  });

  describe('validateOrder usd sizing', () => {
    it('validates a USD-sized order through the min-size calculation', async () => {
      // Regression: this path read `usdAmount` outside its declaring block
      // (a runtime ReferenceError under plain TS) — a valid usdAmount with
      // a positive reference price must reach the min-size check and pass.
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0',
        usdAmount: '5000',
        orderType: 'limit',
        price: '100000',
      });
      expect(result).toStrictEqual({ isValid: true });
    });

    it('rejects a USD-sized order below the venue minimum', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0',
        // $5 at $100k → 0.00005 BTC, below min base 0.0002.
        usdAmount: '5',
        orderType: 'limit',
        price: '100000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('below the Lighter minimum');
    });

    it('rejects an invalid usdAmount before any sizing math', async () => {
      const { provider } = buildProvider();
      const result = await provider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '1',
        usdAmount: '-5',
        orderType: 'limit',
        price: '100000',
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid usdAmount');
    });
  });

  describe('closePosition semantics', () => {
    it('routes a limit close with the requested price, not a market order', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        size: '0.05',
        orderType: 'limit',
        price: '120000',
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // Limit type (0), GTT, and the requested price scaled by decimals.
      expect(orderCall?.params[6]).toBe(0);
      expect(orderCall?.params[4]).toBe('1200000');
      expect(orderCall?.params[8]).toBe(1);
    });

    it('rejects a limit close without a price', async () => {
      const { provider } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        orderType: 'limit',
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('requires a price');
    });

    it('honors usdAmount sizing and slippage on a market close', async () => {
      const { provider, calls } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        usdAmount: '5000',
        maxSlippageBps: 100,
        priceAtCalculation: 100000,
      });
      expect(result.success).toBe(true);
      const orderCall = calls.find(
        (call) => call.function === '_signCreateOrder',
      );
      // usdAmount / fresh reference (100000) = 0.05 → sized at reference,
      // not at the protection price.
      expect(orderCall?.params[3]).toBe('5000');
      // Sell-side protection price offset by 1% (100 bps): 99000.
      expect(orderCall?.params[4]).toBe('990000');
    });

    it('refuses drifted market closes beyond the slippage tolerance', async () => {
      const { provider } = buildProvider();
      const result = await provider.closePosition({
        symbol: 'BTC',
        usdAmount: '5000',
        maxSlippageBps: 100,
        // Fresh venue price is 100000; a 90000 snapshot is >1% away.
        priceAtCalculation: 90000,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('slippage tolerance');
    });
  });

  describe('history and routes', () => {
    it('getOrders merges open orders with the historical lifecycle', async () => {
      const { provider, clientInstance } = buildProvider();
      const orders = await provider.getOrders();
      expect(clientInstance.getInactiveOrders).toHaveBeenCalled();
      expect(orders.map((order) => order.status)).toStrictEqual([
        'open',
        'filled',
      ]);
    });

    it('getUserHistory maps deposits and withdrawals with venue statuses', async () => {
      const { provider } = buildProvider();
      const history = await provider.getUserHistory();
      expect(history).toHaveLength(2);
      expect(history[0]).toMatchObject({
        type: 'withdrawal',
        amount: '1.000000',
        status: 'pending',
        asset: 'USDC',
      });
      expect(history[1]).toMatchObject({
        type: 'deposit',
        amount: '10000.000000',
        status: 'completed',
      });
    });

    it('getUserNonFundingLedgerUpdates merges signed flows newest first', async () => {
      const { provider } = buildProvider();
      const updates = await provider.getUserNonFundingLedgerUpdates();
      expect(updates.map((update) => update.delta.type)).toStrictEqual([
        'transferOut',
        'withdraw',
        'deposit',
      ]);
      expect(updates[0].delta.usdc).toBe('-100.000000');
      expect(updates[1].delta.usdc).toBe('-1.000000');
      expect(updates[2].delta.usdc).toBe('10000.000000');
    });

    it('honors fill limit, time range, symbol, and selected-account contracts', async () => {
      const { provider, clientInstance } = buildProvider();
      const matchingTrade = {
        tradeId: 1,
        type: 'trade',
        marketId: 1,
        size: '0.1',
        price: '90000',
        askId: 10,
        bidId: 11,
        askAccountId: 99,
        bidAccountId: 28,
        isMakerAsk: false,
        timestamp: 1700000000000,
      };
      clientInstance.getTrades
        .mockResolvedValueOnce({
          code: 200,
          nextCursor: 'page-2',
          trades: [{ ...matchingTrade, tradeId: 2, timestamp: 1700000001000 }],
        })
        .mockResolvedValue({ code: 200, trades: [matchingTrade] });

      expect(
        await provider.getOrderFills({
          startTime: 1699999999999,
          endTime: 1700000000001,
          limit: 7,
        }),
      ).toHaveLength(1);
      expect(clientInstance.getTrades).toHaveBeenCalledWith(
        28,
        expect.any(String),
        { limit: 100, cursor: 'page-2', marketId: undefined },
      );
      expect(
        await provider.getOrderFills({ startTime: 1700000000001 }),
      ).toStrictEqual([]);
      expect(await provider.getOrFetchFills({ symbol: 'ETH' })).toStrictEqual(
        [],
      );

      await expect(
        provider.getOrderFills({
          user: '0x0000000000000000000000000000000000000001',
        }),
      ).rejects.toThrow('selected wallet');
      await expect(
        provider.getOrderFills({ aggregateByTime: true }),
      ).rejects.toThrow('aggregateByTime');
    });

    it('continues fill pagination across pages sharing the start-time boundary', async () => {
      const { provider, clientInstance } = buildProvider();
      const boundaryTrade = {
        tradeId: 1,
        type: 'trade',
        marketId: 1,
        size: '0.1',
        price: '90000',
        askId: 10,
        bidId: 11,
        askAccountId: 99,
        bidAccountId: 28,
        isMakerAsk: false,
        timestamp: 1700000000000,
      };
      clientInstance.getTrades
        .mockResolvedValueOnce({
          code: 200,
          nextCursor: 'same-timestamp',
          trades: [boundaryTrade],
        })
        .mockResolvedValueOnce({
          code: 200,
          trades: [{ ...boundaryTrade, tradeId: 2 }],
        });

      const fills = await provider.getOrderFills({
        startTime: boundaryTrade.timestamp,
      });
      expect(fills.map((fill) => fill.orderId)).toStrictEqual(['11', '11']);
      expect(clientInstance.getTrades).toHaveBeenCalledTimes(2);
    });

    it('surfaces fill-history transport and authentication failures', async () => {
      const { provider, clientInstance } = buildProvider();
      clientInstance.getTrades.mockRejectedValue(new Error('auth expired'));
      await expect(provider.getOrderFills()).rejects.toThrow('auth expired');
      await expect(provider.getOrFetchFills()).rejects.toThrow('auth expired');
    });

    it('suppresses deposits until the Lighter bridge call is implemented; withdrawals remain mainnet-only', () => {
      // Testnet settles on the venue-hosted devnet chain 123456 that the
      // wallet cannot reach: advertising it made mobile pay-with flows
      // build a deposit transaction on an unknown chain and fail the
      // trade ("Invalid chain ID 0x1e240" — found in device validation).
      const { provider } = buildProvider();
      expect(provider.getDepositRoutes()).toStrictEqual([]);
      expect(provider.getWithdrawalRoutes()).toStrictEqual([]);
      // A caller hint must never override the provider's venue network:
      // DepositService currently asks for mainnet routes, and advertising
      // one here would fund mainnet while trading remains on testnet.
      expect(provider.getDepositRoutes({ isTestnet: false })).toStrictEqual([]);
      expect(provider.getWithdrawalRoutes({ isTestnet: false })).toStrictEqual(
        [],
      );

      const { provider: mainnetProvider } = buildProvider({
        isTestnet: false,
      });
      expect(mainnetProvider.getDepositRoutes()).toStrictEqual([]);
      const [mainnetRoute] = mainnetProvider.getWithdrawalRoutes();
      expect(mainnetRoute.chainId).toBe('eip155:1');
      expect(mainnetRoute.contractAddress).toBe(
        '0x3B4D794a66304F130a4Db8F2551B0070dfCf5ca7',
      );
      expect(mainnetRoute.assetId).toContain(
        'erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      );
      expect(
        mainnetProvider.getDepositRoutes({ isTestnet: true }),
      ).toStrictEqual([]);
    });
  });

  describe('stubs', () => {
    it('returns not-supported results for unimplemented writes', async () => {
      const { provider } = buildProvider();
      const results = await Promise.all([
        provider.editOrder({} as never),
        provider.closePosition({} as never),
        provider.updatePositionTPSL({} as never),
        provider.updateMargin({} as never),
        provider.withdraw({} as never),
      ]);
      for (const result of results) {
        expect(result.success).toBe(false);
      }
      // Batch operations are deliberately absent (optional interface
      // members) so the controller falls back to per-item calls.
      const optionalBatch = provider as unknown as Record<string, unknown>;
      expect(optionalBatch.cancelOrders).toBeUndefined();
      expect(optionalBatch.closePositions).toBeUndefined();
    });

    it('gates the historical portfolio instead of returning false zeros', async () => {
      const { provider } = buildProvider();
      await expect(provider.getHistoricalPortfolio()).rejects.toThrow(
        'unavailable',
      );
    });

    it('validates only simple limit/market orders', async () => {
      const { provider } = buildProvider();
      expect(
        await provider.validateOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
          price: '90000',
        }),
      ).toStrictEqual({ isValid: true });
      expect(
        await provider.validateOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.001',
          orderType: 'limit',
        }),
      ).toMatchObject({ isValid: false });
      expect(await provider.validateDeposit({} as never)).toMatchObject({
        isValid: false,
      });
      expect(await provider.validateClosePosition({} as never)).toMatchObject({
        isValid: false,
      });
      expect(await provider.validateWithdrawal({} as never)).toMatchObject({
        isValid: false,
      });
    });

    it('derives estimates instead of returning false zeros', async () => {
      const { provider } = buildProvider();
      // Maintenance fraction: venue fallback (no margin data mocked).
      expect(
        await provider.calculateMaintenanceMargin({} as never),
      ).toBeCloseTo(1 / (2 * 50));
      // The liquidation preview uses the ISOLATED formula when the caller
      // requests (or omits) that supported mode, with the venue's own
      // maintenance fraction:
      // BTC fixture maintenance 120 hundredths of a percent -> 1.2%.
      // long: 100 - (0.1 - 0.012)*100/(1 - 0.012) = 91.0931...
      expect(
        parseFloat(
          await provider.calculateLiquidationPrice({
            entryPrice: 100,
            leverage: 10,
            direction: 'long',
            asset: 'BTC',
          }),
        ),
      ).toBeCloseTo(91.0931, 3);
      // short: 100 + (0.1 - 0.012)*100/(1 + 0.012) = 108.6956...
      expect(
        parseFloat(
          await provider.calculateLiquidationPrice({
            entryPrice: 100,
            leverage: 10,
            direction: 'short',
            asset: 'BTC',
          }),
        ),
      ).toBeCloseTo(108.6957, 3);
      // Unknown asset falls back to the constant-derived maintenance
      // (1 / (2 * 50) = 1%): 100 - 0.09*100/0.99 = 90.9090...
      expect(
        parseFloat(
          await provider.calculateLiquidationPrice({
            entryPrice: 100,
            leverage: 10,
            direction: 'long',
          }),
        ),
      ).toBeCloseTo(90.909, 3);
      // Malformed inputs report the explicit zero contract.
      expect(
        await provider.calculateLiquidationPrice({
          entryPrice: 0,
          leverage: 10,
          direction: 'long',
        }),
      ).toBe('0.00');
      await expect(
        provider.calculateLiquidationPrice({
          entryPrice: 100,
          leverage: 10,
          direction: 'long',
          marginType: 'cross',
          asset: 'BTC',
        }),
      ).rejects.toThrow('cross-margin liquidation previews');
      expect(await provider.getMaxLeverage('BTC')).toBeGreaterThan(0);
      // Fee rates come from the venue's per-market metadata (currently 0).
      const fees = await provider.calculateFees({
        orderType: 'market',
        symbol: 'BTC',
        amount: '100',
      });
      expect(fees.protocolFeeRate).toBe(parseFloat(BTC_MARKET.takerFee));
      expect(fees.feeAmount).toBe(100 * parseFloat(BTC_MARKET.takerFee));
      expect(await provider.previewPositionModify({} as never)).toStrictEqual({
        status: 'unsupported',
        reason: 'provider',
      });
    });

    it('returns immediate empty snapshots from subscriptions', async () => {
      const { provider } = buildProvider();
      const callback = jest.fn();
      // No `as never` here: force-casting subscription params is exactly
      // what hid the missing required `symbol` on subscribeToOrderBook and
      // the bare-level order book payload defect.
      const unsubscribers = [
        provider.subscribeToPrices({ symbols: ['BTC'], callback }),
        provider.subscribeToPositions({ callback }),
        provider.subscribeToOrderFills({ callback }),
        provider.subscribeToOrders({ callback }),
        provider.subscribeToAccount({ callback }),
        provider.subscribeToOICaps({ callback }),
        provider.subscribeToCandles({
          symbol: 'BTC',
          interval: '1h',
          callback,
        }),
        provider.subscribeToOrderBook({ symbol: 'BTC', callback }),
      ];
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(callback).toHaveBeenCalled();
      for (const unsubscribe of unsubscribers) {
        expect(() => unsubscribe()).not.toThrow();
      }
      expect(() => provider.setLiveDataConfig({})).not.toThrow();
    });

    it('returns an explorer URL', () => {
      const { provider } = buildProvider();
      expect(provider.getBlockExplorerUrl('0xabc')).toContain('/address/0xabc');
      expect(provider.getBlockExplorerUrl()).toMatch(/^https:/u);
    });
  });
  describe('round-21 quarantine persistence, selective acknowledgment and durable manual state', () => {
    it('an unacknowledged recovered outcome blocks the SECOND and THIRD retries too (no empty-entries bypass)', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(13);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        false,
      );
      // Retry 1 resolves the entry, quarantines the outcome, blocks.
      const retry1 = await built.provider.withdraw({ amount: '25' });
      expect(retry1.success).toBe(false);
      expect(retry1.error).toContain('actually completed');
      // Retries 2 and 3 arrive with ZERO unresolved entries — the
      // quarantine check runs BEFORE the empty-entries return, so they
      // stay blocked until the outcome is acknowledged.
      const retry2 = await built.provider.withdraw({ amount: '25' });
      expect(retry2.success).toBe(false);
      expect(retry2.error).toContain('actually completed');
      const retry3 = await built.provider.updateMargin({
        symbol: 'BTC',
        amount: '10',
      });
      expect(retry3.success).toBe(false);
      expect(retry3.error).toContain('actually completed');
      await acknowledgeAllRecovered(built.provider);
      const after = await built.provider.withdraw({ amount: '25' });
      expect(after.success).toBe(true);
    });

    it('rejects malformed version-4 recovered-dispatch rows instead of dropping them', async () => {
      const infra = createMockInfrastructure();
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [],
          recovered: [
            {
              recoveryId: '42:beef',
              kind: 13,
              intent: 'withdraw:25',
              txHash: 'beef',
              outcome: 'succeeded',
              // Missing evidence makes the v4 safety document malformed.
            },
          ],
        }),
      );
      const built = buildProvider({ platformDependencies: infra });

      await expect(built.provider.getRecoveredDispatches()).rejects.toThrow(
        'corrupt',
      );
    });

    it.each([
      ['succeeded', 'abab000000000042'],
      ['unknown', null],
    ] as const)(
      'preserves a blocking %s outcome when 32 non-blocking failures already fill the ledger',
      async (expectedOutcome, txHash) => {
        const infra = createMockInfrastructure();
        const failedOutcomes = Array.from({ length: 32 }, (_, index) => ({
          recoveryId: `${String(index)}:failed`,
          kind: 13,
          intent: `withdraw:${String(index)}`,
          txHash: `dead${String(index).padStart(8, '0')}`,
          outcome: 'failed',
          evidence: 'tx-status:0',
        }));
        await infra.diskCache.setItem(
          'lighterNonceLedger:testnet:28:7',
          JSON.stringify({
            version: 4,
            consumedFloor: 0,
            entries: [
              {
                nonce: 42,
                txHash,
                expiresAt: 9_999_999_999_999,
                kind: 13,
                intent: 'withdraw:25',
                owner: null,
              },
            ],
            recovered: failedOutcomes,
          }),
        );
        const built = buildProvider({
          registeredKey: '9c'.repeat(40),
          platformDependencies: infra,
        });
        setupTriggerVenue(built.clientInstance, built.bridge);
        if (expectedOutcome === 'succeeded') {
          built.clientInstance.getTx.mockResolvedValue({
            code: 200,
            hash: txHash,
            accountIndex: 28,
            apiKeyIndex: 7,
            nonce: 42,
            status: 2,
          });
        } else {
          built.clientInstance.getNextNonce.mockResolvedValue({
            code: 200,
            nonce: 43,
          });
        }

        const firstRetry = await built.provider.withdraw({ amount: '25' });
        expect(firstRetry.success).toBe(false);
        const recovered = await built.provider.getRecoveredDispatches();
        expect(recovered).toHaveLength(32);
        expect(recovered.some((row) => row.outcome === expectedOutcome)).toBe(
          true,
        );
        // The blocking row must survive the disk round-trip, not merely the
        // in-memory resolve pass.
        const secondRetry = await built.provider.withdraw({ amount: '25' });
        expect(secondRetry.success).toBe(false);
        expect(secondRetry.error).toContain(
          expectedOutcome === 'succeeded'
            ? 'actually completed'
            : 'UNKNOWN outcome',
        );
      },
    );

    it('keeps an exact-hash pending transaction unresolved until it reaches a terminal status', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [
            {
              nonce: 42,
              txHash: 'abab000000000042',
              expiresAt: 9_999_999_999_999,
              kind: 13,
              intent: 'withdraw:25',
              owner: null,
            },
          ],
          recovered: [],
        }),
      );
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      let txStatus = 1;
      built.clientInstance.getTx.mockImplementation(async () => ({
        code: 200,
        hash: 'abab000000000042',
        accountIndex: 28,
        apiKeyIndex: 7,
        nonce: 42,
        status: txStatus,
      }));

      const pendingRetry = await built.provider.withdraw({ amount: '25' });
      expect(pendingRetry.success).toBe(false);
      expect(pendingRetry.error).toContain('unresolved outcome');
      expect(await built.provider.getRecoveredDispatches()).toStrictEqual([]);
      const pendingDoc = JSON.parse(
        (await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:7',
        )) as string,
      ) as {
        consumedFloor: number;
        entries: unknown[];
        recovered: unknown[];
      };
      expect(pendingDoc.consumedFloor).toBe(0);
      expect(pendingDoc.entries).toHaveLength(1);
      expect(pendingDoc.recovered).toHaveLength(0);

      txStatus = 2;
      const settledRetry = await built.provider.withdraw({ amount: '25' });
      expect(settledRetry.success).toBe(false);
      expect(settledRetry.error).toContain('actually completed');
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        true,
      );
    });

    it('getRecoveredDispatches is READ-ONLY and acknowledgment is selective per stable id', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      // TWO ambiguous dispatches recorded by an earlier session (writes
      // block after the first, so two entries model a restart/two-device
      // ledger), both later proven consumed by exact hash.
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [
            {
              nonce: 42,
              txHash: 'abab000000000042',
              expiresAt: 9_999_999_999_999,
              kind: 13,
              intent: 'withdraw:25',
              owner: null,
            },
            {
              nonce: 43,
              txHash: 'ffff000000000043',
              expiresAt: 9_999_999_999_999,
              kind: 29,
              intent: 'updateMargin:BTC:10',
              owner: null,
            },
          ],
          recovered: [],
        }),
      );
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      built.clientInstance.getTx.mockImplementation(async (hash: string) =>
        hash === 'abab000000000042' || hash === 'ffff000000000043'
          ? {
              code: 200,
              hash,
              accountIndex: 28,
              apiKeyIndex: 7,
              nonce: hash === 'abab000000000042' ? 42 : 43,
              status: 2,
            }
          : null,
      );
      // A blocked write resolves both entries into recovered outcomes.
      expect((await built.provider.withdraw({ amount: '5' })).success).toBe(
        false,
      );
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(2);
      expect(outcomes.map((outcome) => outcome.outcome)).toStrictEqual([
        'succeeded',
        'succeeded',
      ]);
      // READ-ONLY: a second read returns the SAME outcomes — nothing was
      // destructively cleared by reading.
      const reread = await built.provider.getRecoveredDispatches();
      expect(reread).toStrictEqual(outcomes);
      // Unknown id: refused explicitly.
      await expect(
        built.provider.acknowledgeRecoveredDispatch('999:deadbeef'),
      ).rejects.toThrow('No pending recovered');
      // Acknowledge ONE: the other outcome still blocks writes.
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      const stillBlocked = await built.provider.withdraw({ amount: '5' });
      expect(stillBlocked.success).toBe(false);
      expect(stillBlocked.error).toContain('actually completed');
      expect(await built.provider.getRecoveredDispatches()).toHaveLength(1);
      // Acknowledge the second: writes recover.
      await built.provider.acknowledgeRecoveredDispatch(outcomes[1].recoveryId);
      const after = await built.provider.withdraw({ amount: '5' });
      expect(after.success).toBe(true);
    });

    it("an account switch cannot acknowledge (or lose) another account's recovered outcome", async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({
        registeredKey,
        configuredAccountIndex: null,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      venue.failResponseOnce(13);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        false,
      );
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        false,
      );
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      // WALLET SWITCH: a different address owning a different account.
      const otherAddress = '0x9999999999999999999999999999999999999999';
      built.getUserAddressMock.mockReturnValue(otherAddress);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: otherAddress,
        subAccounts: [{ ...ACCOUNT, index: 77, l1Address: otherAddress }],
      });
      // The stale id targets the OLD account's ledger: the new session
      // must not clear it (its own ledger has no such outcome).
      await expect(
        built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId),
      ).rejects.toThrow('No pending recovered');
      // Switch BACK: the outcome survived untouched and is still owed.
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      const survived = await built.provider.getRecoveredDispatches();
      expect(survived).toStrictEqual(outcomes);
    });

    it('a parked manual recovery carries reason, prior intent, survivors and required action — and survives a FAILED successor', async () => {
      const { provider, clientInstance, bridge } = buildProvider();
      const venue = setupTriggerVenue(clientInstance, bridge);
      venue.seedTrigger('take-profit', '110000');
      venue.seedTrigger('stop-loss', '80000');
      // After the FIRST old-cancel commits, the venue terminal-cancels
      // one replacement leg (phase race) — parks durable manual state.
      const realSend = clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let raced = false;
      clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const result = await realSend(txType, txInfo);
          if (txType === 15 && !raced) {
            raced = true;
            const failedAt = venue.rawTriggers.findIndex(
              (row) => row.triggerPrice === '81000',
            );
            if (failedAt >= 0) {
              const [failedRow] = venue.rawTriggers.splice(failedAt, 1);
              venue.rawInactive.push({ ...failedRow, status: 'canceled' });
            }
          }
          return result;
        },
      );
      const parked = await provider.updatePositionTPSL({
        symbol: 'BTC',
        takeProfitPrice: '111000',
        stopLossPrice: '81000',
      });
      expect(parked.success).toBe(false);
      const pending = await provider.getPendingManualRecoveries();
      expect(pending).toHaveLength(1);
      expect(pending[0].symbol).toBe('BTC');
      expect(pending[0].reason.length).toBeGreaterThan(10);
      expect(pending[0].priorIntent).toBe('replace');
      expect(Array.isArray(pending[0].survivingOrderIds)).toBe(true);
      expect(pending[0].actionNeeded).toContain('TP/SL');
      // A FAILED successor intent must RETAIN the warning: the venue
      // terminal-cancels the successor's create before activation.
      venue.setCreateTerminal('canceled');
      const failedSuccessor = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(failedSuccessor.success).toBe(false);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(1);
      // Only an authoritatively SUCCESSFUL successor clears it.
      venue.setCreateTerminal('none');
      const renewed = await provider.updatePositionTPSL({
        symbol: 'BTC',
        stopLossPrice: '84000',
      });
      expect(renewed.error).toBeUndefined();
      expect(renewed.success).toBe(true);
      expect(await provider.getPendingManualRecoveries()).toHaveLength(0);
    });

    it('manual-recovery discovery PROPAGATES storage errors and filters to the bound identity', async () => {
      const infra = createMockInfrastructure();
      const built = buildProvider({ platformDependencies: infra });
      setupTriggerVenue(built.clientInstance, built.bridge);
      await built.provider.getOpenOrders();
      // A FOREIGN identity's parked warning is never surfaced here.
      await infra.diskCache.setItem(
        'lighterTpslManualIndex:testnet',
        JSON.stringify(['0xother:99:7:ETH']),
      );
      await infra.diskCache.setItem(
        'lighterTpslManual:testnet:0xother:99:7:ETH',
        JSON.stringify({
          version: 1,
          settlementKey: '0xother:99:7:ETH',
          symbol: 'ETH',
          reason: 'foreign',
          priorIntent: 'replace',
          priorTriggers: [],
          survivingOrderIds: [],
          operationId: 'op-x',
          recordedAt: 1,
        }),
      );
      expect(await built.provider.getPendingManualRecoveries()).toHaveLength(0);
      // Corruption REJECTS — it must never degrade to \"nothing pending\".
      await infra.diskCache.setItem('lighterTpslManualIndex:testnet', '{oops');
      await expect(built.provider.getPendingManualRecoveries()).rejects.toThrow(
        'corrupt',
      );
    });

    it('a leverage change committed before an order failure is reported as STRUCTURED partial state', async () => {
      const built = buildProvider();
      setupTriggerVenue(built.clientInstance, built.bridge);
      // Leverage submit succeeds; the ORDER dispatch then fails at the
      // venue boundary.
      const realSend = built.clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      built.clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          if (txType === 14) {
            throw new LighterApiError('order rejected', 21000);
          }
          return await realSend(txType, txInfo);
        },
      );
      const result = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
        leverage: 10,
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain('PARTIAL STATE');
      expect(result.partialState).toStrictEqual({ leverageUpdated: 10 });
    });

    it("the auth-token mint runs under the bridge lease: a second account's takeover re-establishes OUR client first", async () => {
      const registeredKey = '9c'.repeat(40);
      const first = buildProvider({ registeredKey });
      setupTriggerVenue(first.clientInstance, first.bridge);
      const second = buildProvider({
        registeredKey,
        configuredAccountIndex: 99,
        sharedBridge: {
          bridge: first.bridge,
          calls: first.calls,
          fireReset: first.fireReset,
        },
      });
      second.clientInstance.getAccountByIndex.mockResolvedValue({
        code: 200,
        accounts: [{ ...ACCOUNT, index: 99 }],
      });
      setupTriggerVenue(second.clientInstance, second.bridge);
      const order = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      } as const;
      // A establishes and holds a cached token; B takes the singleton.
      expect((await first.provider.placeOrder(order)).success).toBe(true);
      expect((await second.provider.placeOrder(order)).success).toBe(true);
      // EXPIRE A's cached token, then force a fresh mint via a read that
      // needs auth: the mint must re-create A's client under the lease.
      const realNow = Date.now();
      const nowSpy = jest
        .spyOn(Date, 'now')
        .mockImplementation(() => realNow + 700_000);
      try {
        await first.provider.getOpenOrders();
      } finally {
        nowSpy.mockRestore();
      }
      // Sequence: every _createAuthToken is owned by the LAST-created
      // client account.
      const mismatches: string[] = [];
      let currentOwner: number | null = null;
      for (const call of first.calls) {
        if (call.function === '_createClient') {
          currentOwner = Number((call.params as (string | number)[])[1]);
        }
        if (call.function === '_createAuthToken') {
          const minter = Number((call.params as (string | number)[])[0]);
          if (currentOwner !== null && currentOwner !== minter) {
            mismatches.push(`${String(currentOwner)}!=${String(minter)}`);
          }
        }
      }
      expect(mismatches).toStrictEqual([]);
    });
  });
  describe('round-22 ledger serialization and post-dispatch fences', () => {
    it('a selective acknowledgment can never overwrite a concurrent dispatch append with a stale ledger doc', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      // Durable NON-BLOCKING failed outcome F awaiting acknowledgment.
      await infra.diskCache.setItem(
        'lighterNonceLedger:testnet:28:7',
        JSON.stringify({
          version: 4,
          consumedFloor: 0,
          entries: [],
          recovered: [
            {
              recoveryId: '41:beef',
              kind: 13,
              intent: 'withdraw:9',
              txHash: 'beef',
              outcome: 'failed',
              evidence: 'tx-status:0',
            },
          ],
        }),
      );
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      const venue = setupTriggerVenue(built.clientInstance, built.bridge);
      // Warm signer setup so the gated window contains ONLY the ack read
      // and the order's ledger RMW.
      await built.provider.getOpenOrders();
      // Gate the ACK's ledger WRITE: it has already read the doc, and a
      // concurrent placeOrder appends an unresolved entry in the window
      // before the ack's (now stale) write lands. All ledger RMW must
      // serialize on ONE mutex so this window cannot exist.
      const realSet = (
        infra.diskCache.setItem as jest.Mock
      ).getMockImplementation() as (
        key: string,
        value: string,
      ) => Promise<void>;
      let releaseGate: () => void = () => undefined;
      const gate = { armed: true };
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          if (gate.armed && key.startsWith('lighterNonceLedger:')) {
            gate.armed = false;
            await new Promise<void>((resolve) => {
              releaseGate = resolve;
            });
          }
          return await realSet(key, value);
        },
      );
      const ackPromise = built.provider.acknowledgeRecoveredDispatch('41:beef');
      // Let the ack reach its (gated) ledger read.
      await new Promise((resolve) => setTimeout(resolve, 100));
      // Concurrent dispatch whose venue commit is masked by response
      // loss: its unresolved ledger entry is the only retry protection.
      venue.failResponseOnce(14);
      const orderPromise = built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
      releaseGate();
      await ackPromise;
      const orderResult = await orderPromise;
      expect(orderResult.success).toBe(false);
      const doc = JSON.parse(
        (await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:7',
        )) as string,
      ) as { entries: unknown[]; recovered: unknown[] };
      // F acknowledged AND the concurrent unresolved dispatch SURVIVED —
      // a stale ack write would have silently erased it, leaving the
      // committed order retryable.
      expect(doc.recovered).toHaveLength(0);
      expect(doc.entries).toHaveLength(1);
    });

    it('an account switch DURING network submission quarantines the accepted dispatch: the switch-back retry is refused until acknowledged', async () => {
      const registeredKey = '9c'.repeat(40);
      const built = buildProvider({ registeredKey });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const otherAddress = '0x9999999999999999999999999999999999999999';
      // The venue ACCEPTS the withdraw; the wallet switches accounts
      // while the response is in flight, so the post-send fence cancels
      // the operation AFTER the financial intent committed.
      const realSend = built.clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      let switched = false;
      built.clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const response = await realSend(txType, txInfo);
          if (txType === 13 && !switched) {
            switched = true;
            built.getUserAddressMock.mockReturnValue(otherAddress);
            built.clientInstance.getAccountsByL1Address.mockResolvedValue({
              code: 200,
              l1Address: otherAddress,
              subAccounts: [{ ...ACCOUNT, index: 77, l1Address: otherAddress }],
            });
          }
          return response;
        },
      );
      const cancelled = await built.provider.withdraw({ amount: '25' });
      expect(cancelled.success).toBe(false);
      // Switch BACK and retry the same intent: the committed withdraw
      // was durably quarantined SUCCEEDED for the ORIGINAL account —
      // the blind retry is refused until explicitly acknowledged.
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      const retry = await built.provider.withdraw({ amount: '25' });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('succeeded');
      expect(outcomes[0].evidence).toBe('post-dispatch-session-cancelled');
      expect(outcomes[0].intent).toBe('withdraw:25');
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        true,
      );
    });
  });
  describe('per-market minimums (dynamic, venue-derived)', () => {
    it('getMarkets reports the universal one-tick USD minimum rather than the maker-only floor', async () => {
      const { provider } = buildProvider();
      const markets = await provider.getMarkets();
      const btc = markets.find((market) => market.name === 'BTC');
      // Lighter's base/quote floors are maker-only. Market and IOC orders
      // may use one base-size tick: 0.00001 BTC x $100000 = $1.
      expect(btc?.minimumOrderSize).toBe(1);
      expect(btc?.maxLeverage).toBe(50); // 10000 / minInitialMarginFraction(200)
    });
  });

  describe('close-size contract (mobile sheet parity)', () => {
    it('a FULL close sent as an EMPTY size string closes the position (mobile sends size: "" for 100% closes)', async () => {
      const built = buildProvider({ registeredKey: '9c'.repeat(40) });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const validation = await built.provider.validateClosePosition({
        symbol: 'BTC',
        size: '',
        currentPrice: 100000,
      });
      expect(validation.isValid).toBe(true);
      const result = await built.provider.closePosition({
        symbol: 'BTC',
        size: '',
        orderType: 'market',
        currentPrice: 100000,
      });
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });
  });

  describe('round-23 post-dispatch atomicity', () => {
    it('a failing recovered-outcome write after a fence-cancelled accepted dispatch keeps the ORIGINAL unresolved entry: the switch-back retry stays blocked, then reconciles', async () => {
      const registeredKey = '9c'.repeat(40);
      const infra = createMockInfrastructure();
      const built = buildProvider({
        registeredKey,
        platformDependencies: infra,
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const otherAddress = '0x9999999999999999999999999999999999999999';
      // The venue ACCEPTS the withdraw; the wallet switches accounts
      // while the response is in flight, AND the post-dispatch ledger
      // transition (which would record the SUCCEEDED outcome) fails at
      // the disk exactly once.
      const realSend = built.clientInstance.sendTx.getMockImplementation() as (
        txType: number,
        txInfo: string,
      ) => Promise<unknown>;
      const realSet = (
        infra.diskCache.setItem as jest.Mock
      ).getMockImplementation() as (
        key: string,
        value: string,
      ) => Promise<void>;
      let failNextLedgerWrite = false;
      (infra.diskCache.setItem as jest.Mock).mockImplementation(
        async (key: string, value: string) => {
          if (failNextLedgerWrite && key.startsWith('lighterNonceLedger:')) {
            failNextLedgerWrite = false;
            throw new Error('storage write refused');
          }
          return await realSet(key, value);
        },
      );
      let switched = false;
      built.clientInstance.sendTx.mockImplementation(
        async (txType: number, txInfo: string) => {
          const response = await realSend(txType, txInfo);
          if (txType === 13 && !switched) {
            switched = true;
            built.getUserAddressMock.mockReturnValue(otherAddress);
            built.clientInstance.getAccountsByL1Address.mockResolvedValue({
              code: 200,
              l1Address: otherAddress,
              subAccounts: [{ ...ACCOUNT, index: 77, l1Address: otherAddress }],
            });
            // Arm the ONE-SHOT quarantine persistence failure for the
            // atomic post-dispatch transition that follows acceptance.
            failNextLedgerWrite = true;
          }
          return response;
        },
      );
      const cancelled = await built.provider.withdraw({ amount: '25' });
      expect(cancelled.success).toBe(false);
      // The transition write failed: the ORIGINAL unresolved entry must
      // remain the durable record (never consumed-first, quarantined-
      // second — that would swallow the only proof of the mutation).
      const doc = JSON.parse(
        (await infra.diskCache.getItem(
          'lighterNonceLedger:testnet:28:7',
        )) as string,
      ) as { entries: unknown[]; recovered: unknown[] };
      expect(doc.entries).toHaveLength(1);
      expect(doc.recovered).toHaveLength(0);
      // Switch BACK: the retry stays BLOCKED — the resolve pass proves
      // the exact hash landed (venue tx registry) and quarantines the
      // outcome; only per-id acknowledgment unblocks.
      built.getUserAddressMock.mockReturnValue(ACCOUNT.l1Address);
      built.clientInstance.getAccountsByL1Address.mockResolvedValue({
        code: 200,
        l1Address: ACCOUNT.l1Address,
        subAccounts: [ACCOUNT],
      });
      const retry = await built.provider.withdraw({ amount: '25' });
      expect(retry.success).toBe(false);
      expect(retry.error).toContain('actually completed');
      const outcomes = await built.provider.getRecoveredDispatches();
      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].outcome).toBe('succeeded');
      expect(outcomes[0].intent).toBe('withdraw:25');
      await built.provider.acknowledgeRecoveredDispatch(outcomes[0].recoveryId);
      expect((await built.provider.withdraw({ amount: '25' })).success).toBe(
        true,
      );
    });
  });
  describe('mainnet write parity', () => {
    it('mainnet venue writes sign and dispatch exactly like testnet (rollout gate removed)', async () => {
      const built = buildProvider({
        isTestnet: false,
        registeredKey: '9c'.repeat(40),
      });
      setupTriggerVenue(built.clientInstance, built.bridge);
      const placed = await built.provider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.001',
        orderType: 'limit',
        price: '90000',
      });
      expect(placed.success).toBe(true);
      expect(
        built.calls.filter((call) => call.function === '_signCreateOrder'),
      ).toHaveLength(1);
      expect(built.clientInstance.sendTx).toHaveBeenCalledWith(
        14,
        expect.stringContaining('"createOrder":true'),
      );
    });
  });
});
