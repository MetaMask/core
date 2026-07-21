import { jest } from '@jest/globals';
/* eslint-disable */
/**
 * Unit tests for HyperLiquidSubscriptionService
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CaipAccountId, Hex } from '@metamask/utils';

import { ABSTRACTION_MODE_REFRESH_THROTTLE_MS } from '../../../src/constants/perpsConfig';
import type { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService';
import type { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService';
import type {
  SubscribeOrderBookParams,
  SubscribeOrderFillsParams,
  SubscribePositionsParams,
  SubscribePricesParams,
} from '../../../src/types';
import {
  adaptAccountStateFromSDK,
  parseAssetName,
} from '../../../src/utils/hyperLiquidAdapter';
import { createMockInfrastructure } from '../../helpers/serviceMocks';

// Mock HyperLiquid SDK types
interface MockSubscription {
  unsubscribe: jest.Mock;
}

// Mock adapter
jest.mock('../../../src/utils/hyperLiquidAdapter', () => ({
  adaptPositionFromSDK: jest.fn((assetPos: any) => ({
    symbol: 'BTC',
    size: assetPos.position.szi,
    entryPrice: '50000',
    positionValue: '5000',
    unrealizedPnl: '100',
    marginUsed: '2500',
    leverage: { type: 'isolated', value: 2 },
    liquidationPrice: '40000',
    maxLeverage: 100,
    returnOnEquity: '4.0',
    cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
    takeProfitCount: 0,
    stopLossCount: 0,
  })),
  adaptOrderFromSDK: jest.fn((order: any) => ({
    orderId: order.oid.toString(),
    symbol: order.coin,
    side: order.side === 'B' ? 'buy' : 'sell',
    orderType: 'limit',
    size: order.sz,
    originalSize: order.sz,
    price: order.limitPx || order.triggerPx || '0',
    filledSize: '0',
    remainingSize: order.sz,
    status: 'open',
    timestamp: Date.now(),
    detailedOrderType: order.orderType || 'Limit',
    isTrigger: order.isTrigger ?? false,
    reduceOnly: order.reduceOnly ?? false,
    triggerPrice: order.triggerPx,
    ...(typeof order.isPositionTpsl === 'boolean'
      ? { isPositionTpsl: order.isPositionTpsl }
      : {}),
  })),
  adaptAccountStateFromSDK: jest.fn(() => ({
    spendableBalance: '1000.00',
    withdrawableBalance: '1000.00',
    marginUsed: '500.00',
    unrealizedPnl: '100.00',
    returnOnEquity: '20.0',
    totalBalance: '10100.00',
  })),
  parseAssetName: jest.fn((symbol: string) => ({
    symbol,
    dex: null,
  })),
}));

// Mock DevLogger
jest.mock(
  '../../../../core/SDKConnect/utils/DevLogger',
  () => ({
    DevLogger: {
      log: jest.fn(),
    },
  }),
  { virtual: true },
);

// Mock trace utilities
jest.mock(
  '../../../../util/trace',
  () => ({
    trace: jest.fn(),
    TraceName: {
      PerpsWebSocketConnected: 'Perps WebSocket Connected',
      PerpsWebSocketDisconnected: 'Perps WebSocket Disconnected',
    },
    TraceOperation: {
      PerpsMarketData: 'perps.market_data',
    },
  }),
  { virtual: true },
);

// Mock Sentry
jest.mock(
  '@sentry/react-native',
  () => ({
    setMeasurement: jest.fn(),
  }),
  { virtual: true },
);

describe('HyperLiquidSubscriptionService', () => {
  let service: HyperLiquidSubscriptionService;
  let mockClientService: jest.Mocked<HyperLiquidClientService>;
  let mockWalletService: jest.Mocked<HyperLiquidWalletService>;
  let mockSubscriptionClient: any;
  let mockWalletAdapter: any;
  let mockDeps: ReturnType<typeof createMockInfrastructure>;
  let mockSpotClearinghouseState: jest.Mock;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockDeps = createMockInfrastructure();
    jest.mocked(parseAssetName).mockImplementation((symbol: string) => ({
      symbol,
      dex: null,
    }));
    const hyperLiquidAdapter = jest.requireMock(
      '../../../src/utils/hyperLiquidAdapter',
    );
    hyperLiquidAdapter.adaptPositionFromSDK.mockImplementation(
      (assetPos: any) => ({
        symbol: 'BTC',
        size: assetPos.position.szi,
        entryPrice: '50000',
        positionValue: '5000',
        unrealizedPnl: '100',
        marginUsed: '2500',
        leverage: { type: 'isolated', value: 2 },
        liquidationPrice: '40000',
        maxLeverage: 100,
        returnOnEquity: '4.0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      }),
    );
    hyperLiquidAdapter.adaptOrderFromSDK.mockImplementation((order: any) => ({
      orderId: order.oid.toString(),
      symbol: order.coin,
      side: order.side === 'B' ? 'buy' : 'sell',
      orderType: 'limit',
      size: order.sz,
      originalSize: order.sz,
      price: order.limitPx || order.triggerPx || '0',
      filledSize: '0',
      remainingSize: order.sz,
      status: 'open',
      timestamp: Date.now(),
      detailedOrderType: order.orderType || 'Limit',
      isTrigger: order.isTrigger ?? false,
      reduceOnly: order.reduceOnly ?? false,
      triggerPrice: order.triggerPx,
      ...(typeof order.isPositionTpsl === 'boolean'
        ? { isPositionTpsl: order.isPositionTpsl }
        : {}),
    }));
    hyperLiquidAdapter.adaptAccountStateFromSDK.mockImplementation(() => ({
      spendableBalance: '1000.00',
      withdrawableBalance: '1000.00',
      marginUsed: '500.00',
      unrealizedPnl: '100.00',
      returnOnEquity: '20.0',
      totalBalance: '10100.00',
    }));

    // Mock subscription client
    const mockSubscription: MockSubscription = {
      unsubscribe: jest.fn().mockResolvedValue(undefined),
    };

    mockSubscriptionClient = {
      allMids: jest.fn((paramsOrCallback: any, maybeCallback?: any) => {
        const callback =
          typeof paramsOrCallback === 'function'
            ? paramsOrCallback
            : maybeCallback;
        // Simulate allMids data
        setTimeout(() => {
          callback({
            mids: {
              BTC: 50000,
              ETH: 3000,
            },
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      activeAssetCtx: jest.fn((params: any, callback: any) => {
        // Simulate activeAssetCtx data
        setTimeout(() => {
          callback({
            coin: params.coin,
            ctx: {
              prevDayPx: '49000',
              funding: '0.01',
              openInterest: '1000000', // Raw token units from API
              dayNtlVlm: '50000000',
              oraclePx: '50100',
              midPx: '50000', // Price used for openInterest USD conversion: 1M tokens * $50K = $50B
            },
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      webData3: jest.fn((_params: any, callback: any) => {
        // Simulate webData3 data with perpDexStates structure
        // First callback immediately
        setTimeout(() => {
          callback({
            perpDexStates: [
              {
                clearinghouseState: {
                  assetPositions: [
                    {
                      position: { szi: '0.1' },
                      coin: 'BTC',
                    },
                  ],
                },
                openOrders: [
                  {
                    oid: 12345,
                    coin: 'BTC',
                    side: 'B',
                    sz: '0.5',
                    origSz: '1.0',
                    limitPx: '50000',
                    orderType: 'Limit',
                    timestamp: 1234567890000,
                    isTrigger: false,
                    reduceOnly: false,
                  },
                ],
                perpsAtOpenInterestCap: [],
              },
            ],
          });
        }, 0);

        // Second callback with changed data to ensure updates are triggered
        setTimeout(() => {
          callback({
            perpDexStates: [
              {
                clearinghouseState: {
                  assetPositions: [
                    {
                      position: { szi: '0.2' }, // Changed position size
                      coin: 'BTC',
                    },
                  ],
                },
                openOrders: [
                  {
                    oid: 12346, // Changed order ID
                    coin: 'BTC',
                    side: 'S',
                    sz: '0.3',
                    origSz: '0.5',
                    limitPx: '51000',
                    orderType: 'Limit',
                    timestamp: 1234567890001,
                    isTrigger: false,
                    reduceOnly: false,
                  },
                ],
                perpsAtOpenInterestCap: [],
              },
            ],
          });
        }, 10);

        return Promise.resolve(mockSubscription);
      }),
      webData2: jest.fn((_params: any, callback: any) => {
        // Simulate webData2 data with clearinghouseState (HIP-3 disabled)
        setTimeout(() => {
          callback({
            clearinghouseState: {
              assetPositions: [
                {
                  position: { szi: '0.1' },
                  coin: 'BTC',
                },
              ],
              marginSummary: {
                accountValue: '10000',
                totalMarginUsed: '500',
              },
              withdrawable: '9500',
            },
            openOrders: [
              {
                oid: 12345,
                coin: 'BTC',
                side: 'B',
                sz: '0.5',
                origSz: '1.0',
                limitPx: '50000',
                orderType: 'Limit',
                timestamp: 1234567890000,
                isTrigger: false,
                reduceOnly: false,
              },
            ],
            perpsAtOpenInterestCap: [],
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      userFills: jest.fn((_params: any, callback: any) => {
        // Simulate order fill data
        setTimeout(() => {
          callback({
            fills: [
              {
                oid: 12345,
                coin: 'BTC',
                side: 'B',
                sz: '0.1',
                px: '50000',
                fee: '5',
                time: Date.now(),
              },
            ],
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      l2Book: jest.fn((_params: any, callback: any) => {
        // Simulate l2Book data
        setTimeout(() => {
          callback({
            coin: _params.coin,
            levels: { bids: [], asks: [] },
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      bbo: jest.fn((_params: any, callback: any) => {
        // Simulate BBO data
        setTimeout(() => {
          callback({
            coin: _params.coin,
            time: Date.now(),
            bbo: [
              { px: '49900', sz: '1.5', n: 1 },
              { px: '50100', sz: '2.0', n: 1 },
            ],
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      activeAsset: jest.fn((params: any, callback: any) => {
        // Simulate activeAsset data (similar to activeAssetCtx)
        setTimeout(() => {
          callback({
            coin: params.coin,
            data: 'test',
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      clearinghouseState: jest.fn((_params: any, callback: any) => {
        // Simulate clearinghouseState data for individual subscription
        setTimeout(() => {
          callback({
            dex: _params.dex || '',
            clearinghouseState: {
              assetPositions: [
                {
                  position: { szi: '0.1' },
                  coin: 'BTC',
                },
              ],
              marginSummary: {
                accountValue: '10000',
                totalMarginUsed: '500',
              },
              withdrawable: '9500',
            },
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      openOrders: jest.fn((_params: any, callback: any) => {
        // Simulate openOrders data for individual subscription
        setTimeout(() => {
          callback({
            dex: _params.dex || '',
            orders: [
              {
                oid: 12345,
                coin: 'BTC',
                side: 'B',
                sz: '0.5',
                origSz: '1.0',
                limitPx: '50000',
                orderType: 'Limit',
                timestamp: 1234567890000,
                isTrigger: false,
                reduceOnly: false,
                triggerCondition: '',
                triggerPx: '',
                children: [],
                isPositionTpsl: false,
                tif: null,
                cloid: null,
              },
            ],
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      assetCtxs: jest.fn(() => Promise.resolve(mockSubscription)),
      spotState: jest.fn((_params: any, _callback: any) =>
        Promise.resolve(mockSubscription),
      ),
    };

    mockWalletAdapter = {
      request: jest.fn(),
    };

    // Mock client service
    mockSpotClearinghouseState = jest.fn().mockResolvedValue({
      balances: [{ coin: 'USDC', total: '100.76531791' }],
    });

    mockClientService = {
      ensureSubscriptionClient: jest.fn().mockResolvedValue(undefined),
      getSubscriptionClient: jest.fn(() => mockSubscriptionClient),
      getInfoClient: jest.fn(() => ({
        spotClearinghouseState: mockSpotClearinghouseState,
        // Mode-aware fold gate reads userAbstraction; default to unifiedAccount
        // so existing spot-fold assertions behave as before the gate was added.
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
      })),
      isTestnetMode: jest.fn(() => false),
      ensureTransportReady: jest.fn().mockResolvedValue(undefined),
      getConnectionState: jest.fn(() => 'connected'),
    } as any;

    // Mock wallet service
    mockWalletService = {
      createWalletAdapter: jest.fn(() => mockWalletAdapter),
      getUserAddressWithDefault: jest.fn().mockResolvedValue('0x123' as Hex),
    } as any;

    service = new HyperLiquidSubscriptionService(
      mockClientService,
      mockWalletService,
      mockDeps,
      true, // hip3Enabled - test expects webData3
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });
  describe('OI Cap Subscriptions', () => {
    it('subscribes to OI cap updates successfully', async () => {
      const mockCallback = jest.fn();

      const unsubscribe = service.subscribeToOICaps({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.webData3).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('immediately provides cached OI caps if available', async () => {
      const mockCallback = jest.fn();

      // Mock webData3 to provide OI caps data
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              perpDexStates: [
                {
                  clearinghouseState: { assetPositions: [] },
                  openOrders: [],
                  perpsAtOpenInterestCap: ['BTC', 'ETH'],
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // First subscription to populate cache
      const unsubscribe1 = service.subscribeToOICaps({ callback: jest.fn() });
      await jest.runAllTimersAsync();

      // Second subscription should get cached data immediately
      const unsubscribe2 = service.subscribeToOICaps({
        callback: mockCallback,
      });

      expect(mockCallback).toHaveBeenCalledWith(['BTC', 'ETH']);

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe('Account Subscriptions', () => {
    it('subscribes to account updates successfully', async () => {
      const mockCallback = jest.fn();

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.webData3).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('immediately provides cached account state if available', async () => {
      const mockCallback = jest.fn();

      // First subscription to populate cache
      const unsubscribe1 = service.subscribeToAccount({
        callback: jest.fn(),
      });
      await jest.runAllTimersAsync();

      // Second subscription should get cached data immediately
      const unsubscribe2 = service.subscribeToAccount({
        callback: mockCallback,
      });

      expect(mockCallback).toHaveBeenCalled();

      unsubscribe1();
      unsubscribe2();
    });
  });

  describe('spotState WebSocket Subscription', () => {
    it('establishes a spotState subscription on subscribeToAccount', async () => {
      const unsubscribe = service.subscribeToAccount({
        callback: jest.fn(),
      });
      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.spotState).toHaveBeenCalledWith(
        expect.objectContaining({ user: expect.stringMatching(/^0x/) }),
        expect.any(Function),
      );

      unsubscribe();
    });

    it('does not re-subscribe spotState for the same user', async () => {
      const unsubscribe1 = service.subscribeToAccount({
        callback: jest.fn(),
      });
      const unsubscribe2 = service.subscribeToAccount({
        callback: jest.fn(),
      });
      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.spotState).toHaveBeenCalledTimes(1);

      unsubscribe1();
      unsubscribe2();
    });

    it('re-notifies account subscribers when a spotState push arrives', async () => {
      const firstCallback = jest.fn();
      const firstUnsubscribe = service.subscribeToAccount({
        callback: firstCallback,
      });
      await jest.runAllTimersAsync();

      const notifyCallback = jest.fn();
      const unsubscribe = service.subscribeToAccount({
        callback: notifyCallback,
      });
      await jest.runAllTimersAsync();

      const callsBefore = notifyCallback.mock.calls.length;

      const spotListener = mockSubscriptionClient.spotState.mock.calls[0][1];
      spotListener({
        user: '0x123',
        spotState: {
          balances: [
            {
              coin: 'USDC',
              token: 0,
              hold: '0',
              total: '123.45',
              entryNtl: '123.45',
            },
          ],
        },
      });

      expect(notifyCallback.mock.calls.length).toBeGreaterThan(callsBefore);

      firstUnsubscribe();
      unsubscribe();
    });

    it('preserves the abstraction REST result when WS spot push arrives first, and re-aggregates with the correct fold', async () => {
      // Setup: first userAbstraction call hangs until we manually resolve it.
      // This simulates a slow REST response while the WS spot subscription
      // pushes a snapshot first, bumping #spotStateGeneration so the in-flight
      // refresh would otherwise discard the abstraction result.
      let resolveAbstraction: (mode: 'unifiedAccount') => void = jest.fn();
      const abstractionPromise = new Promise<'unifiedAccount'>((resolve) => {
        resolveAbstraction = resolve;
      });
      let resolveAbstractionStarted: () => void = jest.fn();
      const abstractionStarted = new Promise<void>((resolve) => {
        resolveAbstractionStarted = resolve;
      });
      const userAbstractionMock = jest.fn().mockImplementationOnce(() => {
        resolveAbstractionStarted();
        return abstractionPromise;
      });

      let spotListener: ((event: any) => void) | undefined;
      let resolveSpotStateSubscribed: () => void = jest.fn();
      const spotStateSubscribed = new Promise<void>((resolve) => {
        resolveSpotStateSubscribed = resolve;
      });
      mockSubscriptionClient.spotState.mockImplementationOnce(
        (_params: any, callback: any) => {
          spotListener = callback;
          resolveSpotStateSubscribed();
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockClientService.getInfoClient = jest.fn(() => ({
        spotClearinghouseState: mockSpotClearinghouseState,
        userAbstraction: userAbstractionMock,
      })) as never;

      const accountCallback = jest.fn();
      const unsubscribe = service.subscribeToAccount({
        callback: accountCallback,
      });
      await Promise.all([abstractionStarted, spotStateSubscribed]);
      expect(userAbstractionMock).toHaveBeenCalledTimes(1);

      // Simulate the WS spot push arriving before REST userAbstraction
      // resolves. The WS callback bumps #spotStateGeneration so the
      // in-flight refresh's spot result would be discarded by the
      // generation guard.
      expect(spotListener).toBeDefined();
      spotListener?.({
        user: '0x123',
        spotState: {
          balances: [
            {
              coin: 'USDC',
              token: 0,
              hold: '0',
              total: '123.45',
              entryNtl: '123.45',
            },
          ],
        },
      });
      await jest.runAllTimersAsync();

      // Resolve the REST userAbstraction. The refresh path must record the
      // mode (it's user-keyed, independent of spot generation) and trigger
      // a re-aggregation so the active subscriber sees folded balance —
      // not wait for another subscribe/action to repair the state.
      accountCallback.mockClear();
      resolveAbstraction('unifiedAccount');
      await jest.runAllTimersAsync();

      expect(accountCallback).toHaveBeenCalled();
      const recoveredCall = accountCallback.mock.calls.at(-1)?.[0];
      // unifiedAccount → fold=true → spot USDC ($123.45) folds into
      // spendable/withdrawable (default $1000 perps + $123.45 spot ≈ $1123.45).
      expect(parseFloat(recoveredCall?.spendableBalance)).toBeCloseTo(
        1123.45,
        2,
      );
      expect(parseFloat(recoveredCall?.withdrawableBalance)).toBeCloseTo(
        1123.45,
        2,
      );

      // A subsequent subscribe must take the fast path — the cache is now
      // sealed for this user, so no redundant userAbstraction REST round-trip.
      service.subscribeToAccount({ callback: jest.fn() });
      await jest.runAllTimersAsync();
      expect(userAbstractionMock).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('ignores spotState events for a different user', async () => {
      const unsubscribe = service.subscribeToAccount({
        callback: jest.fn(),
      });
      await jest.runAllTimersAsync();

      const observerCallback = jest.fn();
      const observerUnsubscribe = service.subscribeToAccount({
        callback: observerCallback,
      });
      await jest.runAllTimersAsync();

      const callsBefore = observerCallback.mock.calls.length;

      const spotListener = mockSubscriptionClient.spotState.mock.calls[0][1];
      spotListener({
        user: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
        spotState: { balances: [] },
      });

      expect(observerCallback.mock.calls.length).toBe(callsBefore);

      observerUnsubscribe();
      unsubscribe();
    });

    it('refreshes abstraction mode per user when spotState ticks overlap account switches', async () => {
      const userA = '0xaaa';
      const userB = '0xbbb';
      const accountA = 'eip155:42161:0xaaa' as CaipAccountId;
      const accountB = 'eip155:42161:0xbbb' as CaipAccountId;
      const spotState = {
        balances: [
          {
            coin: 'USDC',
            token: 0,
            hold: '0',
            total: '100',
            entryNtl: '100',
          },
        ],
      };
      const spotListeners = new Map<string, (event: any) => void>();
      let resolveUserARefresh: (mode: 'unifiedAccount') => void = () =>
        undefined;
      let userACalls = 0;
      let userBCalls = 0;
      const userAbstraction = jest.fn(({ user }: { user: string }) => {
        const normalizedUser = user.toLowerCase();

        if (normalizedUser === userA) {
          userACalls += 1;
          if (userACalls === 1) {
            return Promise.resolve('unifiedAccount');
          }
          return new Promise<'unifiedAccount'>((resolve) => {
            resolveUserARefresh = resolve;
          });
        }

        if (normalizedUser === userB) {
          userBCalls += 1;
          if (userBCalls === 1) {
            return Promise.reject(new Error('transient userAbstraction error'));
          }
          return Promise.resolve('disabled');
        }

        return Promise.resolve('unifiedAccount');
      });

      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '1000.00',
        withdrawableBalance: '1000.00',
        totalBalance: '10100.00',
        marginUsed: '500.00',
        unrealizedPnl: '100.00',
        returnOnEquity: '20.0',
      }));
      mockSpotClearinghouseState.mockResolvedValue(spotState);
      mockClientService.getInfoClient.mockReturnValue({
        spotClearinghouseState: mockSpotClearinghouseState,
        userAbstraction,
      } as any);
      mockWalletService.getUserAddressWithDefault.mockImplementation(
        async (accountId?: CaipAccountId) =>
          accountId === accountB ? (userB as Hex) : (userA as Hex),
      );
      mockSubscriptionClient.spotState.mockImplementation(
        (_params: any, callback: any) => {
          spotListeners.set(_params.user.toLowerCase(), callback);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribeA = service.subscribeToAccount({
        accountId: accountA,
        callback: jest.fn(),
      });
      await jest.runAllTimersAsync();

      jest.advanceTimersByTime(ABSTRACTION_MODE_REFRESH_THROTTLE_MS + 1);
      spotListeners.get(userA)?.({ user: userA, spotState });
      expect(userACalls).toBe(2);

      const callbackB = jest.fn();
      const unsubscribeB = service.subscribeToAccount({
        accountId: accountB,
        callback: callbackB,
      });
      await jest.runAllTimersAsync();

      const bCallsBeforeTick = userBCalls;
      spotListeners.get(userB)?.({ user: userB, spotState });
      await jest.runAllTimersAsync();

      expect(bCallsBeforeTick).toBe(1);
      expect(userBCalls).toBe(2);
      expect(userAbstraction).toHaveBeenLastCalledWith({ user: userB });
      expect(callbackB.mock.calls.at(-1)[0].spendableBalance).toBe('1000');
      expect(callbackB.mock.calls.at(-1)[0].withdrawableBalance).toBe('1000');

      resolveUserARefresh('unifiedAccount');
      await jest.runAllTimersAsync();

      unsubscribeB();
      unsubscribeA();
    });

    it('refreshes abstraction mode on the first spotState tick even inside the throttle window', async () => {
      const user = '0xaaa';
      const accountId = 'eip155:42161:0xaaa' as CaipAccountId;
      const callback = jest.fn();
      const spotState = {
        balances: [
          {
            coin: 'USDC',
            token: 0,
            hold: '0',
            total: '100',
            entryNtl: '100',
          },
        ],
      };
      const userAbstraction = jest
        .fn()
        .mockResolvedValueOnce('unifiedAccount')
        .mockResolvedValueOnce('disabled');

      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '1000.00',
        withdrawableBalance: '1000.00',
        totalBalance: '10100.00',
        marginUsed: '500.00',
        unrealizedPnl: '100.00',
        returnOnEquity: '20.0',
      }));
      mockSpotClearinghouseState.mockResolvedValue(spotState);
      mockClientService.getInfoClient.mockReturnValue({
        spotClearinghouseState: mockSpotClearinghouseState,
        userAbstraction,
      } as any);
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        user as Hex,
      );

      service.subscribeToAccount({ accountId, callback });
      await jest.runAllTimersAsync();

      expect(userAbstraction).toHaveBeenCalledTimes(1);

      const spotListener = mockSubscriptionClient.spotState.mock.calls[0][1];
      spotListener({ user, spotState });
      await jest.runAllTimersAsync();

      expect(userAbstraction).toHaveBeenCalledTimes(2);
      expect(userAbstraction).toHaveBeenLastCalledWith({ user });
    });

    it('unsubscribes spotState when the last account subscriber leaves', async () => {
      const unsubSpot = jest.fn().mockResolvedValue(undefined);
      mockSubscriptionClient.spotState.mockResolvedValueOnce({
        unsubscribe: unsubSpot,
      });

      const unsubscribe = service.subscribeToAccount({
        callback: jest.fn(),
      });
      await jest.runAllTimersAsync();

      unsubscribe();
      await jest.runAllTimersAsync();

      expect(unsubSpot).toHaveBeenCalled();
    });
  });

  describe('setUserAbstractionMode', () => {
    it('does not throw for an address with no prior cache entry', async () => {
      expect(() =>
        service.setUserAbstractionMode('0x123', 'unifiedAccount'),
      ).not.toThrow();
    });

    it('lowercases the key so checksummed addresses hit the cached entry', async () => {
      expect(() =>
        service.setUserAbstractionMode(
          '0xABCDEF1234567890ABCDEF1234567890ABCDEF12',
          'unifiedAccount',
        ),
      ).not.toThrow();
    });

    it('flips the fold state and notifies subscribers when the mode changes', async () => {
      // Start without a resolved mode — the spot WS push and REST fetch run
      // through the standard subscribeToAccount path. The default mock
      // resolves userAbstraction = 'unifiedAccount' so the initial subscribe
      // already records that mode and folds spot. Setting back to
      // dexAbstraction should flip the fold off and re-notify.
      mockClientService.getInfoClient = jest.fn(() => ({
        spotClearinghouseState: mockSpotClearinghouseState,
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
      })) as never;

      const accountCallback = jest.fn();
      const unsubscribe = service.subscribeToAccount({
        callback: accountCallback,
      });
      await jest.runAllTimersAsync();

      expect(accountCallback).toHaveBeenCalled();
      accountCallback.mockClear();

      // Switch the recorded mode to dexAbstraction (no fold). Account state
      // hash flips because spendable/withdrawable drop the folded spot.
      service.setUserAbstractionMode('0x123', 'dexAbstraction');
      await jest.runAllTimersAsync();

      expect(accountCallback).toHaveBeenCalled();
      const lastCall = accountCallback.mock.calls.at(-1)?.[0];
      expect(lastCall?.spendableBalance).toBeDefined();
      expect(lastCall?.withdrawableBalance).toBeDefined();

      unsubscribe();
    });
  });

  describe('userAbstraction fetch failure handling', () => {
    it('does not seal the spot cache when userAbstraction fails, so the next refresh retries', async () => {
      // Without this guard, a transient userAbstraction failure leaves
      // #cachedSpotStateUserAddress set, the early-return in #ensureSpotState
      // takes the fast path forever, and Standard / dexAbstraction users
      // keep seeing spot folded into availableToTradeBalance via the
      // fail-open Unified default.
      const userAbstractionMock = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient HL outage'))
        .mockResolvedValueOnce('dexAbstraction');

      mockClientService.getInfoClient = jest.fn(() => ({
        spotClearinghouseState: mockSpotClearinghouseState,
        userAbstraction: userAbstractionMock,
      })) as never;

      const unsub1 = service.subscribeToAccount({ callback: jest.fn() });
      await jest.runAllTimersAsync();
      expect(userAbstractionMock).toHaveBeenCalledTimes(1);

      // Second subscribe (same user) must trigger another refresh because
      // the prior failure left the cache unsealed.
      const unsub2 = service.subscribeToAccount({ callback: jest.fn() });
      await jest.runAllTimersAsync();
      expect(userAbstractionMock).toHaveBeenCalledTimes(2);

      unsub1();
      unsub2();
    });

    it('seals the cache normally once a prior abstraction mode has been resolved', async () => {
      // Sanity check: when userAbstraction has already resolved successfully,
      // a subsequent refresh failure must not force pointless retries.
      const userAbstractionMock = jest
        .fn()
        .mockResolvedValueOnce('dexAbstraction')
        .mockRejectedValueOnce(new Error('transient HL outage'));

      mockClientService.getInfoClient = jest.fn(() => ({
        spotClearinghouseState: mockSpotClearinghouseState,
        userAbstraction: userAbstractionMock,
      })) as never;

      const unsub1 = service.subscribeToAccount({ callback: jest.fn() });
      await jest.runAllTimersAsync();
      expect(userAbstractionMock).toHaveBeenCalledTimes(1);

      // Subsequent subscribe takes the early-return path; the second mock
      // entry (the rejection) is never consumed.
      const unsub2 = service.subscribeToAccount({ callback: jest.fn() });
      await jest.runAllTimersAsync();
      expect(userAbstractionMock).toHaveBeenCalledTimes(1);

      unsub1();
      unsub2();
    });
  });

  describe('spot-adjusted account balance parity', () => {
    it('includes spot balance exactly once in streamed totalBalance across multiple DEXs', async () => {
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '0',
        withdrawableBalance: '0',
        totalBalance: '0',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      }));

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [],
                marginSummary: {
                  accountValue: '0',
                  totalMarginUsed: '0',
                },
                withdrawable: '0',
              },
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );
      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => callback({ dex: _params.dex || '', orders: [] }), 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const hip3Service = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true,
      );

      await hip3Service.updateFeatureFlags(true, ['xyz'], [], []);

      const mockCallback = jest.fn();
      const unsubscribe = hip3Service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls.at(-1)[0];
      // Unified-mode default: spot USDC folds into total, spendable, and
      // withdrawable (all three carry the same value when perps balances
      // are zero). Per-DEX subAccountBreakdown entries stay perps-only —
      // the fold is applied once at the aggregation level, not per DEX.
      expect(accountState.totalBalance).toBe('100.76531791');
      expect(accountState.spendableBalance).toBe('100.76531791');
      expect(accountState.withdrawableBalance).toBe('100.76531791');
      expect(accountState.subAccountBreakdown).toEqual({
        main: {
          spendableBalance: '0',
          withdrawableBalance: '0',
          totalBalance: '0',
        },
        xyz: {
          spendableBalance: '0',
          withdrawableBalance: '0',
          totalBalance: '0',
        },
      });
      expect(mockSpotClearinghouseState).toHaveBeenCalledTimes(1);

      unsubscribe();
    });

    it('does not use non-USDC spot coins in streamed spendable/withdrawable', async () => {
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '0',
        withdrawableBalance: '0',
        totalBalance: '0',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      }));

      const infoClient = {
        spotClearinghouseState: jest.fn().mockResolvedValue({
          balances: [
            { coin: 'mUSD', hold: '10', total: '100' },
            { coin: 'HYPE', hold: '0', total: '999' },
          ],
        }),
        userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
      };
      mockClientService.getInfoClient = jest.fn(() => infoClient) as never;

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [],
                marginSummary: {
                  accountValue: '0',
                  totalMarginUsed: '0',
                },
                withdrawable: '0',
              },
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );
      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => callback({ dex: _params.dex || '', orders: [] }), 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const hip3Service = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true,
      );

      await hip3Service.updateFeatureFlags(true, ['xyz'], [], []);

      const mockCallback = jest.fn();
      const unsubscribe = hip3Service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      const accountState = mockCallback.mock.calls.at(-1)[0];
      expect(accountState.spendableBalance).toBe('0');
      expect(accountState.withdrawableBalance).toBe('0');
      expect(accountState.totalBalance).toBe('0');

      unsubscribe();
    });

    it('includes spot balance in single-DEX account updates without flickering', async () => {
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '50',
        withdrawableBalance: '50',
        totalBalance: '200',
        marginUsed: '10',
        unrealizedPnl: '5',
        returnOnEquity: '0.05',
      }));

      // HIP-3 disabled now uses the per-DEX clearinghouseState subscription
      // (not the deprecated webData2 channel) for account updates.
      const clearinghouseData = {
        dex: '',
        clearinghouseState: {
          assetPositions: [],
          marginSummary: {
            accountValue: '200',
            totalMarginUsed: '10',
          },
          withdrawable: '50',
        },
      };

      let clearinghouseCallback: ((data: any) => void) | undefined;
      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          clearinghouseCallback = callback;
          setTimeout(() => callback(clearinghouseData), 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const singleDexService = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        false,
      );

      const mockCallback = jest.fn();
      const unsubscribe = singleDexService.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.webData2).not.toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalled();
      const firstUpdate = mockCallback.mock.calls.at(-1)[0];
      // Unified-mode default: freeSpot ($100.77) folds into spendable and
      // withdrawable on top of perps-side values, and into total.
      //   total       = perps.accountValue (200) + spot (100.77) = 300.77
      //   spendable   = perps.withdrawable (50)  + spot (100.77) = 150.77
      //   withdrawable = perps.withdrawable (50) + spot (100.77) = 150.77
      expect(firstUpdate.totalBalance).toBe('300.76531791');
      expect(firstUpdate.spendableBalance).toBe('150.76531791');
      expect(firstUpdate.withdrawableBalance).toBe('150.76531791');

      // Simulate a second WebSocket tick — should still include spot balance,
      // not revert to perps-only 200.
      mockCallback.mockClear();
      expect(clearinghouseCallback).toBeDefined();

      clearinghouseCallback!(clearinghouseData);

      await jest.runAllTimersAsync();

      if (mockCallback.mock.calls.length > 0) {
        const secondUpdate = mockCallback.mock.calls.at(-1)[0];
        expect(secondUpdate.totalBalance).toBe('300.76531791');
      }

      unsubscribe();
    });
  });

  describe('aggregateAccountStates - returnOnEquity calculation', () => {
    it('calculates positive ROE when unrealizedPnl is positive', async () => {
      // Override the adapter mock
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '100',
        withdrawableBalance: '100',
        totalBalance: '1100',
        marginUsed: '1000',
        unrealizedPnl: '100',
        returnOnEquity: '10.0',
      }));

      const mockCallback = jest.fn();

      // Mock webData3
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          const mockData = {
            perpDexStates: [
              {
                clearinghouseState: { assetPositions: [] },
                openOrders: [],
                perpsAtOpenInterestCap: [],
              },
            ],
          };

          setTimeout(() => callback(mockData), 10);
          return { unsubscribe: jest.fn() };
        },
      );

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls[0][0];
      expect(accountState.marginUsed).toBe('1000');
      expect(accountState.unrealizedPnl).toBe('100');
      expect(accountState.returnOnEquity).toBe('10');

      unsubscribe();
    });

    it('calculates negative ROE when unrealizedPnl is negative', async () => {
      // Override the adapter mock
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '0',
        withdrawableBalance: '0',
        totalBalance: '950',
        marginUsed: '1000',
        unrealizedPnl: '-50',
        returnOnEquity: '-5.0',
      }));

      const mockCallback = jest.fn();

      // Mock webData3
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          const mockData = {
            perpDexStates: [
              {
                clearinghouseState: { assetPositions: [] },
                openOrders: [],
                perpsAtOpenInterestCap: [],
              },
            ],
          };

          setTimeout(() => callback(mockData), 10);
          return { unsubscribe: jest.fn() };
        },
      );

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls[0][0];
      expect(accountState.marginUsed).toBe('1000');
      expect(accountState.unrealizedPnl).toBe('-50');
      expect(accountState.returnOnEquity).toBe('-5');

      unsubscribe();
    });

    it('returns zero ROE when marginUsed is zero', async () => {
      // Override the adapter mock
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '1000',
        withdrawableBalance: '1000',
        totalBalance: '1000',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      }));

      const mockCallback = jest.fn();

      // Mock webData3
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          const mockData = {
            perpDexStates: [
              {
                clearinghouseState: { assetPositions: [] },
                openOrders: [],
                perpsAtOpenInterestCap: [],
              },
            ],
          };

          setTimeout(() => callback(mockData), 10);
          return { unsubscribe: jest.fn() };
        },
      );

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls[0][0];
      expect(accountState.marginUsed).toBe('0');
      expect(accountState.unrealizedPnl).toBe('0');
      expect(accountState.returnOnEquity).toBe('0');

      unsubscribe();
    });

    it('calculates correct ROE with mixed profit and loss positions', async () => {
      // Override the adapter mock
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '75',
        withdrawableBalance: '75',
        totalBalance: '1575',
        marginUsed: '1500',
        unrealizedPnl: '75',
        returnOnEquity: '5.0',
      }));

      const mockCallback = jest.fn();

      // Mock webData3 - simulates account with multiple positions
      // marginUsed=1500, unrealizedPnl=75 → ROE=5.0%
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          const mockData = {
            perpDexStates: [
              {
                clearinghouseState: { assetPositions: [] },
                openOrders: [],
                perpsAtOpenInterestCap: [],
              },
            ],
          };

          setTimeout(() => callback(mockData), 10);
          return { unsubscribe: jest.fn() };
        },
      );

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls[0][0];
      expect(accountState.marginUsed).toBe('1500');
      expect(accountState.unrealizedPnl).toBe('75');
      expect(accountState.returnOnEquity).toBe('5');

      unsubscribe();
    });

    it('calculates high ROE with large percentage gains', async () => {
      // Override the adapter mock
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '200',
        withdrawableBalance: '200',
        totalBalance: '300',
        marginUsed: '100',
        unrealizedPnl: '200',
        returnOnEquity: '200.0',
      }));

      const mockCallback = jest.fn();

      // Mock webData3
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          const mockData = {
            perpDexStates: [
              {
                clearinghouseState: { assetPositions: [] },
                openOrders: [],
                perpsAtOpenInterestCap: [],
              },
            ],
          };

          setTimeout(() => callback(mockData), 10);
          return { unsubscribe: jest.fn() };
        },
      );

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls[0][0];
      expect(accountState.marginUsed).toBe('100');
      expect(accountState.unrealizedPnl).toBe('200');
      expect(accountState.returnOnEquity).toBe('200');

      unsubscribe();
    });

    it('stores raw ROE without rounding', async () => {
      // Override the adapter mock
      jest.mocked(adaptAccountStateFromSDK).mockImplementation(() => ({
        spendableBalance: '100',
        withdrawableBalance: '100',
        totalBalance: '433',
        marginUsed: '333',
        unrealizedPnl: '100',
        returnOnEquity: '30.0',
      }));

      const mockCallback = jest.fn();

      // Mock webData3
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          const mockData = {
            perpDexStates: [
              {
                clearinghouseState: { assetPositions: [] },
                openOrders: [],
                perpsAtOpenInterestCap: [],
              },
            ],
          };

          setTimeout(() => callback(mockData), 10);
          return { unsubscribe: jest.fn() };
        },
      );

      const unsubscribe = service.subscribeToAccount({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const accountState = mockCallback.mock.calls[0][0];
      expect(accountState.marginUsed).toBe('333');
      expect(accountState.unrealizedPnl).toBe('100');
      expect(accountState.returnOnEquity).toBe('30');

      unsubscribe();
    });
  });

  describe('restoreSubscriptions', () => {
    it('restores allMids subscription when price subscribers exist', async () => {
      const callback = jest.fn();
      const mockUnsubscribe = jest.fn();
      const mockSubscription = { unsubscribe: mockUnsubscribe };

      // Subscribe to prices first
      mockSubscriptionClient.allMids.mockImplementation((cb: any) => {
        setTimeout(() => {
          cb({ mids: { BTC: '50000' } });
        }, 10);
        return Promise.resolve(mockSubscription);
      });

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback,
      });

      await jest.runAllTimersAsync();

      // Clear the subscription reference to simulate reconnection
      (service as any).globalAllMidsSubscription = undefined;
      (service as any).globalAllMidsPromise = undefined;

      // Restore subscriptions
      await service.restoreSubscriptions();

      // Verify allMids subscription was re-established
      expect(mockSubscriptionClient.allMids).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('does not restore allMids subscription when no price subscribers exist', async () => {
      // No subscriptions created

      await service.restoreSubscriptions();

      // Verify allMids was not called
      expect(mockSubscriptionClient.allMids).not.toHaveBeenCalled();
    });

    // TODO: Refactor to test restoreSubscriptions through public disconnect/reconnect API

    it.skip('restores webData3 subscription when user data subscribers exist', async () => {
      const positionCallback = jest.fn();
      const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);

      // Simulate DEX discovery to skip the wait
      await service.updateFeatureFlags(true, [''], [], []);

      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              perpDexStates: [
                {
                  clearinghouseState: { assetPositions: [] },
                  openOrders: [],
                  perpDexStates: [],
                },
              ],
            });
          }, 10);
          return Promise.resolve({ unsubscribe: mockUnsubscribe });
        },
      );

      const unsubscribe = await service.subscribeToPositions({
        callback: positionCallback,
      });

      await jest.runAllTimersAsync();

      // Clear subscription references to simulate reconnection
      (service as any).webData3Subscriptions.clear();
      (service as any).webData3SubscriptionPromise = undefined;

      // Restore subscriptions
      await service.restoreSubscriptions();

      // Verify webData3 subscription was re-established
      expect(mockSubscriptionClient.webData3).toHaveBeenCalledTimes(2);

      // Cleanup
      unsubscribe();
    });

    // TODO: Refactor to test through public disconnect/reconnect API

    it.skip('restores activeAsset subscriptions for all market data subscribers', async () => {
      const marketDataCallback = jest.fn();
      const mockUnsubscribe = jest.fn();
      const mockSubscription = { unsubscribe: mockUnsubscribe };

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: params.coin,
              ctx: {
                prevDayPx: '49000',
                funding: '0.01',
                openInterest: '1000000',
                dayNtlVlm: '50000000',
                oraclePx: '50100',
                midPx: '50000',
              },
            });
          }, 10);
          return Promise.resolve(mockSubscription);
        },
      );

      // Subscribe to market data for multiple symbols
      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: marketDataCallback,
        includeMarketData: true,
      });
      const unsubscribe2 = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: marketDataCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Clear subscriptions to simulate reconnection
      (service as any).globalActiveAssetSubscriptions.clear();

      // Restore subscriptions
      await service.restoreSubscriptions();

      // Verify activeAssetCtx was called for each symbol (2 initial + 2 restored)
      expect(mockSubscriptionClient.activeAssetCtx).toHaveBeenCalledTimes(4);

      unsubscribe1();
      unsubscribe2();
    });

    // TODO: Refactor to test through public disconnect/reconnect API

    it.skip('clears BBO subscriptions during restoration', async () => {
      const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
      const mockSubscription = { unsubscribe: mockUnsubscribe };
      let subscriptionCallCount = 0;

      mockSubscriptionClient.bbo.mockImplementation(
        (_params: any, bboCallback: any) => {
          subscriptionCallCount++;
          setTimeout(() => {
            bboCallback({
              coin: _params.coin,
              time: Date.now(),
              bbo: [
                { px: '49900', sz: '1.5', n: 1 },
                { px: '50100', sz: '2.0', n: 1 },
              ],
            });
          }, 10);
          return Promise.resolve(mockSubscription);
        },
      );

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeOrderBook: true,
      });

      await jest.runAllTimersAsync();

      // Verify initial subscription was created
      expect((service as any).globalBboSubscriptions.size).toBe(1);
      const initialCallCount = subscriptionCallCount;

      // Set up a different subscription reference to verify it's cleared
      const oldSubscription = { unsubscribe: jest.fn() };
      (service as any).globalBboSubscriptions.set('BTC', oldSubscription);

      // Restore subscriptions
      await service.restoreSubscriptions();

      await jest.runAllTimersAsync();

      // Verify old subscription was cleared and new one was re-established
      // The map should have the new subscription, not the old one
      const currentSubscription = (service as any).globalBboSubscriptions.get(
        'BTC',
      );
      expect(currentSubscription).toBeDefined();
      expect(currentSubscription).not.toBe(oldSubscription);
      // Verify bbo was called again to re-establish the subscription
      expect(subscriptionCallCount).toBeGreaterThan(initialCallCount);

      unsubscribe();
    });

    it('schedules retry when assetCtxs restoration fails', async () => {
      jest.mocked(parseAssetName).mockImplementation((symbol: string) => ({
        symbol,
        dex: symbol === 'BTC:UNISWAP' ? 'UNISWAP' : null,
      }));

      mockClientService.getInfoClient = jest.fn(
        () =>
          ({
            meta: jest.fn().mockResolvedValue({
              universe: [{ name: 'BTC:UNISWAP' }],
            }),
          }) as any,
      );

      mockSubscriptionClient.assetCtxs = jest
        .fn()
        .mockResolvedValueOnce({
          unsubscribe: jest.fn().mockResolvedValue(undefined),
        })
        .mockRejectedValueOnce(new Error('Subscription failed'))
        .mockResolvedValueOnce({
          unsubscribe: jest.fn().mockResolvedValue(undefined),
        });

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC:UNISWAP'],
        callback: jest.fn(),
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      await expect(service.restoreSubscriptions()).resolves.not.toThrow();
      expect(mockSubscriptionClient.assetCtxs).toHaveBeenCalledTimes(2);

      await jest.advanceTimersByTimeAsync(1000);

      expect(mockSubscriptionClient.assetCtxs).toHaveBeenCalledTimes(3);
      expect(mockDeps.logger.error).toHaveBeenCalled();

      unsubscribe();
    });

    // TODO: Refactor to test through public disconnect/reconnect API

    it.skip('restores all subscription types when multiple subscriber types exist', async () => {
      const priceCallback = jest.fn();
      const positionCallback = jest.fn();
      const allTypesMarketDataCallback = jest.fn();
      const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
      const mockSubscription = { unsubscribe: mockUnsubscribe };

      // Simulate DEX discovery to skip the wait
      await service.updateFeatureFlags(true, [''], [], []);

      mockSubscriptionClient.allMids.mockImplementation((cb: any) => {
        setTimeout(() => {
          cb({ mids: { BTC: '50000' } });
        }, 10);
        return Promise.resolve(mockSubscription);
      });

      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              perpDexStates: [
                {
                  clearinghouseState: { assetPositions: [] },
                  openOrders: [],
                  perpDexStates: [],
                },
              ],
            });
          }, 10);
          return Promise.resolve(mockSubscription);
        },
      );

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: params.coin,
              ctx: {
                prevDayPx: '49000',
                funding: '0.01',
                openInterest: '1000000',
                dayNtlVlm: '50000000',
                oraclePx: '50100',
                midPx: '50000',
              },
            });
          }, 10);
          return Promise.resolve(mockSubscription);
        },
      );

      // Create subscriptions for all types
      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: priceCallback,
      });
      const unsubscribe2 = await service.subscribeToPositions({
        callback: positionCallback,
      });
      const unsubscribe3 = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: allTypesMarketDataCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Clear all subscription references
      (service as any).globalAllMidsSubscription = undefined;
      (service as any).globalAllMidsPromise = undefined;
      (service as any).webData3Subscriptions.clear();
      (service as any).webData3SubscriptionPromise = undefined;
      (service as any).globalActiveAssetSubscriptions.clear();

      // Restore all subscriptions
      await service.restoreSubscriptions();

      // Verify all subscription types were restored
      expect(mockSubscriptionClient.allMids).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionClient.webData3).toHaveBeenCalledTimes(2);
      expect(mockSubscriptionClient.activeAssetCtx).toHaveBeenCalledTimes(2);

      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
    });
  });

  describe('subscribeToOrderBook (L2Book)', () => {
    it('should subscribe to L2Book with correct params', async () => {
      const mockCallback = jest.fn();
      const mockL2BookSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [{ px: '49900', sz: '1.5', n: 3 }],
                [{ px: '50100', sz: '2.0', n: 5 }],
              ],
            });
          }, 0);
          return Promise.resolve(mockL2BookSubscription);
        },
      );

      const params: SubscribeOrderBookParams = {
        symbol: 'BTC',
        levels: 10,
        nSigFigs: 5,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToOrderBook(params);

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.l2Book).toHaveBeenCalledWith(
        { coin: 'BTC', nSigFigs: 5, mantissa: undefined, fast: undefined },
        expect.any(Function),
      );

      expect(typeof unsubscribe).toBe('function');
    });

    it('should process L2Book data and call callback with OrderBookData', async () => {
      const mockCallback = jest.fn();
      const mockL2BookSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [
                  { px: '49900', sz: '1.0', n: 2 },
                  { px: '49800', sz: '2.0', n: 3 },
                ],
                [
                  { px: '50100', sz: '1.5', n: 4 },
                  { px: '50200', sz: '2.5', n: 5 },
                ],
              ],
            });
          }, 0);
          return Promise.resolve(mockL2BookSubscription);
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 10,
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          bids: expect.arrayContaining([
            expect.objectContaining({
              price: '49900',
              size: '1.0',
            }),
          ]),
          asks: expect.arrayContaining([
            expect.objectContaining({
              price: '50100',
              size: '1.5',
            }),
          ]),
          spread: expect.any(String),
          spreadPercentage: expect.any(String),
          midPrice: expect.any(String),
          lastUpdated: expect.any(Number),
          maxTotal: expect.any(String),
        }),
      );
    });

    it('should unsubscribe when cleanup function is called', async () => {
      const mockCallback = jest.fn();
      const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [{ px: '49900', sz: '1.5', n: 3 }],
                [{ px: '50100', sz: '2.0', n: 5 }],
              ],
            });
          }, 0);
          return Promise.resolve({ unsubscribe: mockUnsubscribe });
        },
      );

      const unsubscribe = service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Unsubscribe
      unsubscribe();

      await jest.runAllTimersAsync();

      expect(mockUnsubscribe).toHaveBeenCalled();
    });

    it('should call onError callback when subscription fails', async () => {
      const mockCallback = jest.fn();
      const mockOnError = jest.fn();

      mockSubscriptionClient.l2Book.mockRejectedValue(
        new Error('L2Book subscription failed'),
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: mockCallback,
        onError: mockOnError,
      });

      await jest.runAllTimersAsync();

      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'L2Book subscription failed',
        }),
      );
    });

    it('should handle subscription client not available', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = jest.fn();
      const mockOnError = jest.fn();

      const unsubscribe = service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: mockCallback,
        onError: mockOnError,
      });

      await jest.runAllTimersAsync();

      // Should call onError with appropriate message
      expect(mockOnError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Subscription client not available',
        }),
      );

      // Should return a no-op unsubscribe function
      expect(typeof unsubscribe).toBe('function');
      expect(mockSubscriptionClient.l2Book).not.toHaveBeenCalled();
    });

    it('should handle missing levels gracefully', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: undefined,
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should not crash - callback should not be called for invalid data
      // (the implementation checks for data?.levels being truthy)
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should ignore data for different coins', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          // First send data for wrong coin
          setTimeout(() => {
            callback({
              coin: 'ETH',
              levels: [
                [{ px: '2900', sz: '10', n: 1 }],
                [{ px: '3000', sz: '20', n: 1 }],
              ],
            });
          }, 0);
          // Then send data for correct coin
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [{ px: '49900', sz: '1.5', n: 3 }],
                [{ px: '50100', sz: '2.0', n: 5 }],
              ],
            });
          }, 10);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should only receive data for BTC, not ETH
      expect(mockCallback).toHaveBeenCalledTimes(1);
      expect(mockCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          bids: expect.arrayContaining([
            expect.objectContaining({ price: '49900' }),
          ]),
        }),
      );
    });

    it('should pass mantissa parameter when provided', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [{ px: '49900', sz: '1.5', n: 3 }],
                [{ px: '50100', sz: '2.0', n: 5 }],
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        nSigFigs: 5,
        mantissa: 2,
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.l2Book).toHaveBeenCalledWith(
        { coin: 'BTC', nSigFigs: 5, mantissa: 2 },
        expect.any(Function),
      );
    });

    it('should calculate cumulative totals correctly', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [
                  { px: '50000', sz: '1.0', n: 1 },
                  { px: '49900', sz: '2.0', n: 1 },
                  { px: '49800', sz: '3.0', n: 1 },
                ],
                [
                  { px: '50100', sz: '0.5', n: 1 },
                  { px: '50200', sz: '1.5', n: 1 },
                ],
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 10,
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      const orderBookData = mockCallback.mock.calls[0][0];

      // Verify cumulative bid totals: 1.0, 3.0, 6.0
      expect(parseFloat(orderBookData.bids[0].total)).toBe(1);
      expect(parseFloat(orderBookData.bids[1].total)).toBe(3);
      expect(parseFloat(orderBookData.bids[2].total)).toBe(6);

      // Verify cumulative ask totals: 0.5, 2.0
      expect(parseFloat(orderBookData.asks[0].total)).toBe(0.5);
      expect(parseFloat(orderBookData.asks[1].total)).toBe(2);

      // Verify maxTotal is the larger of bid/ask cumulative totals
      expect(parseFloat(orderBookData.maxTotal)).toBe(6);
    });

    it('should limit levels based on the levels parameter', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [
                  { px: '50000', sz: '1.0', n: 1 },
                  { px: '49900', sz: '2.0', n: 1 },
                  { px: '49800', sz: '3.0', n: 1 },
                  { px: '49700', sz: '4.0', n: 1 },
                  { px: '49600', sz: '5.0', n: 1 },
                ],
                [
                  { px: '50100', sz: '0.5', n: 1 },
                  { px: '50200', sz: '1.5', n: 1 },
                  { px: '50300', sz: '2.5', n: 1 },
                  { px: '50400', sz: '3.5', n: 1 },
                  { px: '50500', sz: '4.5', n: 1 },
                ],
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        levels: 3,
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      const orderBookData = mockCallback.mock.calls[0][0];

      // Should only have 3 levels on each side
      expect(orderBookData.bids.length).toBe(3);
      expect(orderBookData.asks.length).toBe(3);
    });

    it('forwards fast: true to the SDK l2Book call', async () => {
      const mockCallback = jest.fn();
      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [{ px: '49900', sz: '1.0', n: 1 }],
                [{ px: '50100', sz: '1.0', n: 1 }],
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        fast: true,
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.l2Book).toHaveBeenCalledWith(
        expect.objectContaining({ coin: 'BTC', fast: true }),
        expect.any(Function),
      );
    });

    it('does not send fast flag when fast is omitted', async () => {
      const mockCallback = jest.fn();
      mockSubscriptionClient.l2Book.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              levels: [
                [{ px: '49900', sz: '1.0', n: 1 }],
                [{ px: '50100', sz: '1.0', n: 1 }],
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      service.subscribeToOrderBook({
        symbol: 'BTC',
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      const calledWith = mockSubscriptionClient.l2Book.mock.calls[0][0];
      expect(calledWith.fast).toBeUndefined();
    });
  });

  describe('Subscription Race Guards (#28141)', () => {
    it('unsubscribes stale assetCtxs when a newer pending promise exists', async () => {
      jest.mocked(parseAssetName).mockImplementation((symbol: string) => ({
        symbol,
        dex: symbol === 'BTC:UNISWAP' ? 'UNISWAP' : null,
      }));
      service.setDexMetaCache('UNISWAP', {
        universe: [{ name: 'BTC:UNISWAP' }],
      } as any);

      let resolveFirst: (sub: MockSubscription) => void = () => undefined;
      const firstMockSub: MockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      const secondMockSub: MockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      mockSubscriptionClient.allMids.mockResolvedValue({
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });

      let callCount = 0;
      mockSubscriptionClient.assetCtxs.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<MockSubscription>((resolve) => {
            resolveFirst = resolve;
          });
        }
        return Promise.resolve(secondMockSub);
      });

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC:UNISWAP'],
        callback: jest.fn(),
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      unsubscribe();

      await service.subscribeToPrices({
        symbols: ['BTC:UNISWAP'],
        callback: jest.fn(),
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      resolveFirst(firstMockSub);
      await jest.runAllTimersAsync();

      expect(firstMockSub.unsubscribe).toHaveBeenCalled();
      expect(secondMockSub.unsubscribe).not.toHaveBeenCalled();
    });

    it('unsubscribes stale BBO when a newer pending promise exists', async () => {
      let resolveFirst: (sub: MockSubscription) => void = () => undefined;
      const firstMockSub: MockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      const secondMockSub: MockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      let callCount = 0;
      mockSubscriptionClient.bbo.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          return new Promise<MockSubscription>((resolve) => {
            resolveFirst = resolve;
          });
        }

        return Promise.resolve(secondMockSub);
      });

      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeOrderBook: true,
      });
      await jest.runAllTimersAsync();

      unsubscribe1();

      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeOrderBook: true,
      });
      await jest.runAllTimersAsync();

      resolveFirst(firstMockSub);
      await jest.runAllTimersAsync();

      expect(firstMockSub.unsubscribe).toHaveBeenCalled();
      expect(secondMockSub.unsubscribe).not.toHaveBeenCalled();
    });

    it('unsubscribes stale activeAssetCtx when a newer pending promise exists', async () => {
      // Arrange: make first activeAssetCtx return a deferred promise
      let resolveFirst: (sub: MockSubscription) => void = () => undefined;
      const firstMockSub: MockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      const secondMockSub: MockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      let callCount = 0;
      mockSubscriptionClient.activeAssetCtx.mockImplementation(() => {
        callCount += 1;
        if (callCount === 1) {
          // First call: deferred promise (simulates slow network)
          return new Promise<MockSubscription>((resolve) => {
            resolveFirst = resolve;
          });
        }
        // Second call: resolves immediately
        return Promise.resolve(secondMockSub);
      });

      // Act: first subscription
      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      // Cleanup first subscription (decrements count, clears pending)
      unsubscribe1();

      // Second subscription for same symbol (creates new pending promise)
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      // Now resolve the first (stale) promise
      resolveFirst(firstMockSub);
      await jest.runAllTimersAsync();

      // Assert: stale subscription was unsubscribed
      expect(firstMockSub.unsubscribe).toHaveBeenCalled();
      // Fresh subscription was NOT unsubscribed
      expect(secondMockSub.unsubscribe).not.toHaveBeenCalled();
    });

    it('handles activeAssetCtx subscription error gracefully', async () => {
      // Arrange: make activeAssetCtx reject
      mockSubscriptionClient.activeAssetCtx.mockRejectedValue(
        new Error('WebSocket connection failed'),
      );

      // Act: subscribe with market data — should not throw
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      // Assert: error was logged, service still functional
      expect(mockDeps.logger.error).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('logs method name (not class name) for transient SDK errors', async () => {
      // Arrange: make activeAssetCtx reject with a WebSocketRequestError
      const transientError = new Error(
        'Unknown error while making a WebSocket request',
      );
      transientError.name = 'WebSocketRequestError';
      mockSubscriptionClient.activeAssetCtx.mockRejectedValue(transientError);

      // Act
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      // Assert: debugLogger received method context, not the class name
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('ensureActiveAssetSubscription'),
      );
      expect(mockDeps.debugLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('HyperLiquidSubscriptionService:'),
      );
      // Sentry logger should NOT have been called with the transient error
      expect(mockDeps.logger.error).not.toHaveBeenCalledWith(
        transientError,
        expect.anything(),
      );
    });
  });
});
