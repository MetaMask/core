/* eslint-disable */
/**
 * Unit tests for HyperLiquidSubscriptionService
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CaipAccountId, Hex } from '@metamask/utils';
import type {
  TwapHistoryResponse,
  UserFillsWsEvent,
  UserTwapHistoryWsEvent,
} from '@nktkas/hyperliquid';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked } from 'vitest';

import { ABSTRACTION_MODE_REFRESH_THROTTLE_MS } from '../../../src/constants/perpsConfig.js';
import type { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import type { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type {
  OrderFill,
  SubscribeOrderBookParams,
  SubscribeOrderFillsParams,
  SubscribePositionsParams,
  SubscribePricesParams,
  TwapOrder,
} from '../../../src/types/index.js';
import {
  adaptAccountStateFromSDK,
  parseAssetName,
} from '../../../src/utils/hyperLiquidAdapter.js';
import * as hyperLiquidAdapterModule from '../../../src/utils/hyperLiquidAdapter.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

// Mock HyperLiquid SDK types
interface MockSubscription {
  unsubscribe: Mock;
}

// Mock adapter
vi.mock('../../../src/utils/hyperLiquidAdapter', async (importOriginal) => ({
  adaptPositionFromSDK: vi.fn((assetPos: any) => ({
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
  adaptOrderFromSDK: vi.fn((order: any) => ({
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
  adaptAccountStateFromSDK: vi.fn(() => ({
    spendableBalance: '1000.00',
    withdrawableBalance: '1000.00',
    marginUsed: '500.00',
    unrealizedPnl: '100.00',
    returnOnEquity: '20.0',
    totalBalance: '10100.00',
  })),
  parseAssetName: vi.fn((symbol: string) => ({
    symbol,
    dex: null,
  })),
  buildHyperLiquidFillId: (
    await importOriginal<
      typeof import('../../../src/utils/hyperLiquidAdapter.js')
    >()
  ).buildHyperLiquidFillId,
}));

// Mock DevLogger
vi.mock('../../../../core/SDKConnect/utils/DevLogger', () => ({
  DevLogger: {
    log: vi.fn(),
  },
}));

// Mock trace utilities
vi.mock('../../../../util/trace', () => ({
  trace: vi.fn(),
  TraceName: {
    PerpsWebSocketConnected: 'Perps WebSocket Connected',
    PerpsWebSocketDisconnected: 'Perps WebSocket Disconnected',
  },
  TraceOperation: {
    PerpsMarketData: 'perps.market_data',
  },
}));

// Mock Sentry
vi.mock('@sentry/react-native', () => ({
  setMeasurement: vi.fn(),
}));

describe('HyperLiquidSubscriptionService', () => {
  let service: HyperLiquidSubscriptionService;
  let mockClientService: Mocked<HyperLiquidClientService>;
  let mockWalletService: Mocked<HyperLiquidWalletService>;
  let mockSubscriptionClient: any;
  let mockWalletAdapter: any;
  let mockDeps: ReturnType<typeof createMockInfrastructure>;
  let mockSpotClearinghouseState: Mock;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    mockDeps = createMockInfrastructure();
    vi.mocked(parseAssetName).mockImplementation((symbol: string) => ({
      symbol,
      dex: null,
    }));
    const hyperLiquidAdapter = hyperLiquidAdapterModule as unknown as Record<
      string,
      Mock
    >;
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
      unsubscribe: vi.fn().mockResolvedValue(undefined),
    };

    mockSubscriptionClient = {
      allMids: vi.fn((paramsOrCallback: any, maybeCallback?: any) => {
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
      activeAssetCtx: vi.fn((params: any, callback: any) => {
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
      webData3: vi.fn((_params: any, callback: any) => {
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
      webData2: vi.fn((_params: any, callback: any) => {
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
      userFills: vi.fn((_params: any, callback: any) => {
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
      userTwapHistory: vi.fn(
        (
          _params: { user: `0x${string}` },
          callback: (event: UserTwapHistoryWsEvent) => void,
        ) => {
          setTimeout(() => {
            callback({
              user: _params.user,
              history: [
                {
                  time: 1_700_000_000,
                  state: {
                    coin: 'BTC',
                    executedNtl: '400',
                    executedSz: '4',
                    minutes: 30,
                    randomize: false,
                    reduceOnly: false,
                    side: 'B',
                    sz: '10',
                    timestamp: 1_700_000_000_000,
                    user: _params.user,
                  },
                  status: { status: 'activated' },
                  twapId: 77,
                },
              ],
              isSnapshot: true,
            });
          }, 0);
          return Promise.resolve(mockSubscription);
        },
      ),
      l2Book: vi.fn((_params: any, callback: any) => {
        // Simulate l2Book data
        setTimeout(() => {
          callback({
            coin: _params.coin,
            levels: { bids: [], asks: [] },
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      bbo: vi.fn((_params: any, callback: any) => {
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
      activeAsset: vi.fn((params: any, callback: any) => {
        // Simulate activeAsset data (similar to activeAssetCtx)
        setTimeout(() => {
          callback({
            coin: params.coin,
            data: 'test',
          });
        }, 0);
        return Promise.resolve(mockSubscription);
      }),
      clearinghouseState: vi.fn((_params: any, callback: any) => {
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
      openOrders: vi.fn((_params: any, callback: any) => {
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
      assetCtxs: vi.fn(() => Promise.resolve(mockSubscription)),
      fastAssetCtxs: vi.fn((_callback: any) =>
        Promise.resolve(mockSubscription),
      ),
      spotState: vi.fn((_params: any, _callback: any) =>
        Promise.resolve(mockSubscription),
      ),
    };

    mockWalletAdapter = {
      request: vi.fn(),
    };

    // Mock client service
    mockSpotClearinghouseState = vi.fn().mockResolvedValue({
      balances: [{ coin: 'USDC', total: '100.76531791' }],
    });

    mockClientService = {
      ensureSubscriptionClient: vi.fn().mockResolvedValue(undefined),
      getSubscriptionClient: vi.fn(() => mockSubscriptionClient),
      getInfoClient: vi.fn(() => ({
        spotClearinghouseState: mockSpotClearinghouseState,
        // Mode-aware fold gate reads userAbstraction; default to unifiedAccount
        // so existing spot-fold assertions behave as before the gate was added.
        userAbstraction: vi.fn().mockResolvedValue('unifiedAccount'),
      })),
      isTestnetMode: vi.fn(() => false),
      ensureTransportReady: vi.fn().mockResolvedValue(undefined),
      getConnectionState: vi.fn(() => 'connected'),
      getConnectionEpoch: vi.fn(() => 1),
    } as any;

    // Mock wallet service
    mockWalletService = {
      createWalletAdapter: vi.fn(() => mockWalletAdapter),
      getUserAddressWithDefault: vi.fn().mockResolvedValue('0x123' as Hex),
    } as any;

    service = new HyperLiquidSubscriptionService(
      mockClientService,
      mockWalletService,
      mockDeps,
      true, // hip3Enabled - test expects webData3
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });
  describe('Price Subscriptions', () => {
    it('should subscribe to price updates successfully', async () => {
      const mockCallback = vi.fn();
      const params: SubscribePricesParams = {
        symbols: ['BTC', 'ETH'],
        callback: mockCallback,
        includeMarketData: true, // Enable market data to test activeAssetCtx subscription
      };

      const unsubscribe = await service.subscribeToPrices(params);

      expect(mockSubscriptionClient.allMids).toHaveBeenCalled();
      expect(mockSubscriptionClient.activeAssetCtx).toHaveBeenCalledWith(
        { coin: 'BTC' },
        expect.any(Function),
      );
      expect(mockSubscriptionClient.activeAssetCtx).toHaveBeenCalledWith(
        { coin: 'ETH' },
        expect.any(Function),
      );

      // Advance timers to trigger async callbacks
      await vi.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle subscription client not available', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = vi.fn();
      const params: SubscribePricesParams = {
        symbols: ['BTC'],
        callback: mockCallback,
      };

      const unsubscribe = await service.subscribeToPrices(params);

      expect(typeof unsubscribe).toBe('function');
      expect(mockSubscriptionClient.allMids).not.toHaveBeenCalled();
    });

    it('should send cached price data immediately', async () => {
      const mockCallback = vi.fn();

      // First subscription to populate cache
      const firstUnsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
      });

      // Advance timers for cache to populate
      await vi.runAllTimersAsync();

      // Second subscription should get cached data immediately
      const secondUnsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
      });

      expect(mockCallback).toHaveBeenCalled();

      firstUnsubscribe();
      secondUnsubscribe();
    });

    it('should cleanup subscriptions with reference counting', async () => {
      const mockCallback1 = vi.fn();
      const mockCallback2 = vi.fn();

      // Test that subscribing without market data does not call activeAssetCtx
      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: mockCallback1,
        includeMarketData: false,
      });

      const unsubscribe2 = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: mockCallback2,
        includeMarketData: false,
      });

      // Should not call activeAssetCtx when includeMarketData is false
      expect(mockSubscriptionClient.activeAssetCtx).not.toHaveBeenCalledWith(
        { coin: 'ETH' },
        expect.any(Function),
      );

      // Cleanup
      unsubscribe1();
      unsubscribe2();

      // Verify cleanup functions exist
      expect(typeof unsubscribe1).toBe('function');
      expect(typeof unsubscribe2).toBe('function');
    });

    it('does not notify a list subscriber for symbol A when only symbol B activeAssetCtx fires', async () => {
      const listCallback = vi.fn();
      const focusedCallback = vi.fn();

      // List subscriber watching BTC (no market data -> no activeAssetCtx subscription)
      const unsubscribeList = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: listCallback,
        includeMarketData: false,
      });

      // Focused subscriber watching ETH (market data -> activeAssetCtx subscription)
      const unsubscribeFocused = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: focusedCallback,
        includeMarketData: true,
      });

      // Let initial allMids + activeAssetCtx ticks settle
      await vi.runAllTimersAsync();

      listCallback.mockClear();
      focusedCallback.mockClear();

      // Fire a fresh activeAssetCtx tick for ETH only (simulates the fast-stream
      // price cadence for a focused symbol while BTC's allMids baseline is untouched)
      const ethCall = mockSubscriptionClient.activeAssetCtx.mock.calls.find(
        ([params]: [{ coin: string }]) => params.coin === 'ETH',
      );
      expect(ethCall).toBeDefined();
      const ethCallback = ethCall[1];

      ethCallback({
        coin: 'ETH',
        ctx: {
          prevDayPx: '2900',
          funding: '0.02',
          openInterest: '2000000',
          dayNtlVlm: '60000000',
          oraclePx: '3010',
          midPx: '3010',
        },
      });

      expect(focusedCallback).toHaveBeenCalled();
      expect(listCallback).not.toHaveBeenCalled();

      unsubscribeList();
      unsubscribeFocused();
    });

    it('only notifies subscribers of symbols whose allMids price actually changed', async () => {
      const btcCallback = vi.fn();
      const ethCallback = vi.fn();

      const unsubscribeBtc = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });
      const unsubscribeEth = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: ethCallback,
      });

      // Let the initial allMids snapshot settle
      await vi.runAllTimersAsync();

      btcCallback.mockClear();
      ethCallback.mockClear();

      // Re-invoke the allMids handler directly with only BTC's price changed
      const allMidsCallback = mockSubscriptionClient.allMids.mock.calls[0][0];
      allMidsCallback({
        mids: {
          BTC: 51000, // changed
          ETH: 3000, // unchanged from initial snapshot
        },
      });

      expect(btcCallback).toHaveBeenCalled();
      expect(ethCallback).not.toHaveBeenCalled();

      unsubscribeBtc();
      unsubscribeEth();
    });

    it('establishes a global fastAssetCtxs subscription when subscribing to prices', async () => {
      const mockCallback = vi.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
      });

      await vi.runAllTimersAsync();

      expect(mockSubscriptionClient.fastAssetCtxs).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionClient.fastAssetCtxs).toHaveBeenCalledWith(
        expect.any(Function),
      );

      unsubscribe();
    });

    it('only creates a single global fastAssetCtxs subscription for multiple subscribers', async () => {
      const unsubscribeBtc = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: vi.fn(),
      });
      const unsubscribeEth = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: vi.fn(),
      });

      await vi.runAllTimersAsync();

      expect(mockSubscriptionClient.fastAssetCtxs).toHaveBeenCalledTimes(1);

      unsubscribeBtc();
      unsubscribeEth();
    });

    it('applies a fastAssetCtxs snapshot to cached price data and notifies subscribers', async () => {
      const btcCallback = vi.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });

      await vi.runAllTimersAsync();
      btcCallback.mockClear();

      const fastAssetCtxsCallback =
        mockSubscriptionClient.fastAssetCtxs.mock.calls[0][0];

      // First message after subscribing is a full snapshot keyed by coin
      fastAssetCtxsCallback({
        BTC: { midPx: '52000' },
        SOL: { midPx: '150' }, // no subscriber for SOL; should be ignored
      });

      expect(btcCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', price: '52000' }),
      ]);

      unsubscribe();
    });

    it('only notifies subscribers of symbols present in a fastAssetCtxs diff message', async () => {
      const btcCallback = vi.fn();
      const ethCallback = vi.fn();

      const unsubscribeBtc = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });
      const unsubscribeEth = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: ethCallback,
      });

      await vi.runAllTimersAsync();

      const fastAssetCtxsCallback =
        mockSubscriptionClient.fastAssetCtxs.mock.calls[0][0];

      // Snapshot establishes a baseline for both symbols
      fastAssetCtxsCallback({
        BTC: { midPx: '52000' },
        ETH: { midPx: '3000' },
      });

      btcCallback.mockClear();
      ethCallback.mockClear();

      // Later messages are diffs containing only the coins that changed
      fastAssetCtxsCallback({
        BTC: { midPx: '52500' },
      });

      expect(btcCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', price: '52500' }),
      ]);
      expect(ethCallback).not.toHaveBeenCalled();

      unsubscribeBtc();
      unsubscribeEth();
    });

    it('falls back to markPx when midPx is absent in a fastAssetCtxs update', async () => {
      const btcCallback = vi.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });

      await vi.runAllTimersAsync();
      btcCallback.mockClear();

      const fastAssetCtxsCallback =
        mockSubscriptionClient.fastAssetCtxs.mock.calls[0][0];

      fastAssetCtxsCallback({
        BTC: { markPx: '53000' },
      });

      expect(btcCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', price: '53000' }),
      ]);

      unsubscribe();
    });

    it('skips a coin with a null midPx and no markPx in a fastAssetCtxs update without throwing', async () => {
      const btcCallback = vi.fn();
      const ethCallback = vi.fn();

      const unsubscribeBtc = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });
      const unsubscribeEth = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: ethCallback,
      });

      await vi.runAllTimersAsync();
      btcCallback.mockClear();
      ethCallback.mockClear();

      const fastAssetCtxsCallback =
        mockSubscriptionClient.fastAssetCtxs.mock.calls[0][0];

      // BTC has a null midPx (and no markPx), which the SDK types allow at
      // runtime; ETH is a valid update (with a price change from the allMids
      // baseline of 3000) in the same payload.
      expect(() =>
        fastAssetCtxsCallback({
          BTC: { midPx: null },
          ETH: { midPx: '3100' },
        }),
      ).not.toThrow();

      expect(btcCallback).not.toHaveBeenCalled();
      expect(ethCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'ETH', price: '3100' }),
      ]);

      unsubscribeBtc();
      unsubscribeEth();
    });

    it('does not notify for a coin with no subscriber in a fastAssetCtxs snapshot', async () => {
      const btcCallback = vi.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });

      await vi.runAllTimersAsync();
      btcCallback.mockClear();

      const fastAssetCtxsCallback =
        mockSubscriptionClient.fastAssetCtxs.mock.calls[0][0];

      // SOL has a valid price but no subscriber; only BTC (subscribed)
      // should trigger a notification.
      fastAssetCtxsCallback({
        BTC: { midPx: '52000' },
        SOL: { midPx: '150' },
      });

      expect(btcCallback).toHaveBeenCalledTimes(1);
      expect(btcCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'BTC', price: '52000' }),
      ]);

      unsubscribe();
    });

    it('caches a fastAssetCtxs price for a coin with no subscriber so a later subscriber gets it immediately', async () => {
      const btcCallback = vi.fn();

      const unsubscribeBtc = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });

      await vi.runAllTimersAsync();

      const fastAssetCtxsCallback =
        mockSubscriptionClient.fastAssetCtxs.mock.calls[0][0];

      // SOL has no subscriber yet, but its valid price must still be cached
      // so a later subscriber gets an immediate baseline instead of waiting
      // for the next snapshot/diff that happens to include SOL.
      fastAssetCtxsCallback({
        BTC: { midPx: '52000' },
        SOL: { midPx: '150' },
      });

      const solCallback = vi.fn();
      const unsubscribeSol = await service.subscribeToPrices({
        symbols: ['SOL'],
        callback: solCallback,
      });

      await vi.runAllTimersAsync();

      expect(solCallback).toHaveBeenCalledWith([
        expect.objectContaining({ symbol: 'SOL', price: '150' }),
      ]);

      unsubscribeBtc();
      unsubscribeSol();
    });
  });

  describe('subscribeToActiveAssetData', () => {
    const frame = {
      user: '0x123',
      coin: 'BTC',
      leverage: { type: 'isolated', value: 2, rawUsd: '-7.4688' },
      maxTradeSzs: ['0.01095', '0.01135'],
      availableToTrade: ['413.904112', '429.016554'],
      markPx: '75580.0',
    };

    const captureListener = (): {
      emit: (data: unknown) => void;
      fail: (error: Error) => void;
      subscription: MockSubscription;
    } => {
      const subscription: MockSubscription = {
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      let listener: ((data: unknown) => void) | undefined;
      let onSubscriptionError: ((error: Error) => void) | undefined;
      mockSubscriptionClient.activeAssetData = vi.fn(
        (
          _params: unknown,
          callback: (data: unknown) => void,
          options?: { onError?: (error: Error) => void },
        ) => {
          listener = callback;
          onSubscriptionError = options?.onError;
          return Promise.resolve(subscription);
        },
      );
      return {
        emit: (data) => listener?.(data),
        fail: (error) => onSubscriptionError?.(error),
        subscription,
      };
    };

    it('streams frames for the selected account and market only', async () => {
      const { emit } = captureListener();
      const callback = vi.fn();

      service.subscribeToActiveAssetData({ symbol: 'BTC', callback });
      await vi.advanceTimersByTimeAsync(0);
      emit(frame);
      emit({ ...frame, coin: 'ETH' });
      emit({ ...frame, user: '0x456' });

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledWith(
        { user: '0x123', coin: 'BTC' },
        expect.any(Function),
        { onError: expect.any(Function) },
      );
      expect(mockWalletService.getUserAddressWithDefault).toHaveBeenCalledWith(
        undefined,
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(frame);
    });

    it('stops streaming and unsubscribes on cleanup', async () => {
      const { emit, subscription } = captureListener();
      const callback = vi.fn();

      const cleanup = service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback,
      });
      await vi.advanceTimersByTimeAsync(0);
      cleanup();
      emit(frame);

      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(callback).not.toHaveBeenCalled();
    });

    it('never opens a venue subscription when cleaned up first', async () => {
      captureListener();

      const cleanup = service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
      });
      cleanup();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockSubscriptionClient.activeAssetData).not.toHaveBeenCalled();
    });

    it('drops a venue subscription that opens after cleanup', async () => {
      const subscription: MockSubscription = {
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      let resolveOpen: (sub: MockSubscription) => void = () => undefined;
      mockSubscriptionClient.activeAssetData = vi.fn(
        () =>
          new Promise<MockSubscription>((resolve) => {
            resolveOpen = resolve;
          }),
      );
      const onError = vi.fn();

      const cleanup = service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);
      cleanup();
      resolveOpen(subscription);
      await vi.advanceTimersByTimeAsync(0);

      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('logs a failed unsubscribe without throwing', async () => {
      const { subscription } = captureListener();
      vi.mocked(subscription.unsubscribe).mockRejectedValue(
        new Error('socket closed'),
      );

      const cleanup = service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
      });
      await vi.advanceTimersByTimeAsync(0);
      cleanup();
      await vi.advanceTimersByTimeAsync(0);

      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'socket closed' }),
        expect.anything(),
      );
    });

    it('reports a stream that cannot open', async () => {
      mockSubscriptionClient.activeAssetData = vi
        .fn()
        .mockRejectedValue(new Error('subscribe error'));
      const onError = vi.fn();

      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'subscribe error' }),
      );

      // A non-transient failure is not retried.
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('reports a missing subscription client', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);
      const onError = vi.fn();

      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Subscription client not available',
        }),
      );
    });

    it('reports a stream that fails after it opens', async () => {
      const { emit, fail, subscription } = captureListener();
      const callback = vi.fn();
      const onError = vi.fn();
      const cleanup = service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback,
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      emit(frame);
      fail(new Error('resubscribe rejected'));
      cleanup();

      expect(callback).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'resubscribe rejected' }),
      );
      expect(mockDeps.logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'resubscribe rejected' }),
        expect.anything(),
      );
      // The venue already dropped the failed subscription.
      expect(subscription.unsubscribe).not.toHaveBeenCalled();
    });

    it('resumes after a transport replacement that failed the stream', async () => {
      const previous = captureListener();
      const callback = vi.fn();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback, onError });
      await vi.advanceTimersByTimeAsync(0);

      // The old transport closes before the replacement restores streams.
      const closed = new Error('connection terminated');
      closed.name = 'WebSocketRequestError';
      previous.fail(closed);
      const replacement = captureListener();
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);
      replacement.emit(frame);
      // The retry scheduled by the transient failure lost to the reopen.
      await vi.advanceTimersByTimeAsync(500);

      expect(onError).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(frame);
      expect(replacement.subscription.unsubscribe).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);
      expect(mockDeps.debugLogger.log).toHaveBeenCalledWith(
        'Transient activeAssetData subscription failure, retrying',
        expect.objectContaining({ error: 'connection terminated' }),
      );
      expect(mockDeps.logger.error).not.toHaveBeenCalled();
    });

    const transientError = (): Error => {
      const error = new Error('connection terminated');
      error.name = 'WebSocketRequestError';
      return error;
    };

    it('retries a transient open failure on the same transport', async () => {
      const { emit } = captureListener();
      const open = mockSubscriptionClient.activeAssetData;
      mockSubscriptionClient.activeAssetData = vi
        .fn()
        .mockRejectedValueOnce(transientError())
        .mockImplementation(open);
      const callback = vi.fn();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback, onError });
      await vi.advanceTimersByTimeAsync(0);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(500);
      emit(frame);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenCalledWith(frame);
      expect(onError).not.toHaveBeenCalled();
      expect(mockDeps.logger.error).not.toHaveBeenCalled();
    });

    it('reports a transient failure once retries are exhausted', async () => {
      mockSubscriptionClient.activeAssetData = vi
        .fn()
        .mockRejectedValue(transientError());
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(500);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(2);
      expect(onError).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(1000);
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'connection terminated' }),
      );
    });

    it('releases a retried subscription when the transport is replaced', async () => {
      const first = captureListener();
      const callback = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback });
      await vi.advanceTimersByTimeAsync(0);

      first.fail(transientError());
      const retry = captureListener();
      await vi.advanceTimersByTimeAsync(500);
      const replacement = captureListener();
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);
      retry.emit(frame);
      replacement.emit(frame);

      expect(retry.subscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(replacement.subscription.unsubscribe).not.toHaveBeenCalled();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('reports post-open transient failures once and stops after three', async () => {
      const { fail } = captureListener();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      fail(transientError());
      await vi.advanceTimersByTimeAsync(500);
      fail(transientError());
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(3);
      expect(onError).not.toHaveBeenCalled();

      fail(transientError());
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(3);
      expect(onError).toHaveBeenCalledTimes(1);
      expect(onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: 'connection terminated' }),
      );
    });

    it('resets the retry budget when a frame arrives', async () => {
      const { emit, fail } = captureListener();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      fail(transientError());
      await vi.advanceTimersByTimeAsync(500);
      fail(transientError());
      await vi.advanceTimersByTimeAsync(1000);
      emit(frame);
      fail(transientError());
      await vi.advanceTimersByTimeAsync(500);
      fail(transientError());
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(5);
      expect(onError).not.toHaveBeenCalled();
    });

    it('reports one failure when the open rejects and the SDK reports it too', async () => {
      const failure = new Error('subscribe error');
      mockSubscriptionClient.activeAssetData = vi.fn(
        (
          _params: unknown,
          _callback: unknown,
          options?: { onError?: (error: Error) => void },
        ) => {
          options?.onError?.(failure);
          return Promise.reject(failure);
        },
      );
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(5000);

      expect(onError).toHaveBeenCalledTimes(1);
      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);
    });

    it('does not subscribe again after clearAll during a pending retry', async () => {
      const { fail } = captureListener();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      fail(transientError());
      service.clearAll();
      await vi.advanceTimersByTimeAsync(5000);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('reopens an exhausted stream on the replacement transport', async () => {
      mockSubscriptionClient.activeAssetData = vi
        .fn()
        .mockRejectedValue(transientError());
      const callback = vi.fn();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback, onError });
      await vi.advanceTimersByTimeAsync(1500);

      expect(onError).toHaveBeenCalledTimes(1);

      const replacement = captureListener();
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);
      replacement.emit(frame);

      expect(callback).toHaveBeenCalledWith(frame);
      expect(onError).toHaveBeenCalledTimes(1);
    });

    it('retries a transient failure after the stream opened', async () => {
      const first = captureListener();
      const callback = vi.fn();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback, onError });
      await vi.advanceTimersByTimeAsync(0);

      first.fail(transientError());
      const retry = captureListener();
      await vi.advanceTimersByTimeAsync(500);
      first.emit(frame);
      retry.emit(frame);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(frame);
      expect(onError).not.toHaveBeenCalled();
    });

    it('does not report a failure after cleanup', async () => {
      const { fail } = captureListener();
      const onError = vi.fn();
      const cleanup = service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      cleanup();
      fail(new Error('connection terminated'));

      expect(onError).not.toHaveBeenCalled();
    });

    it('does not report a failure from a replaced transport', async () => {
      const previous = captureListener();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      captureListener();
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);
      previous.fail(new Error('connection terminated'));

      expect(onError).not.toHaveBeenCalled();
    });

    const deferOpen = (): {
      resolveOpen: (sub: MockSubscription) => void;
    } => {
      const deferred = {
        resolveOpen: (_sub: MockSubscription): void => undefined,
      };
      mockSubscriptionClient.activeAssetData = vi.fn(
        () =>
          new Promise<MockSubscription>((resolve) => {
            deferred.resolveOpen = resolve;
          }),
      );
      return deferred;
    };

    it('reopens an open stream on the replacement transport', async () => {
      const previous = captureListener();
      const callback = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback });
      await vi.advanceTimersByTimeAsync(0);

      const replacement = captureListener();
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);
      previous.emit(frame);
      replacement.emit(frame);

      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledWith(
        { user: '0x123', coin: 'BTC' },
        expect.any(Function),
        { onError: expect.any(Function) },
      );
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(frame);
    });

    it('drops an open that was pending when the transport was replaced', async () => {
      const pending = deferOpen();
      const callback = vi.fn();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback, onError });
      await vi.advanceTimersByTimeAsync(0);

      const replacement = captureListener();
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);
      const stale: MockSubscription = {
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      pending.resolveOpen(stale);
      await vi.advanceTimersByTimeAsync(0);
      replacement.emit(frame);

      expect(stale.unsubscribe).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });

    it('retires open streams on clearAll', async () => {
      const { emit, subscription } = captureListener();
      const callback = vi.fn();
      service.subscribeToActiveAssetData({ symbol: 'BTC', callback });
      await vi.advanceTimersByTimeAsync(0);

      service.clearAll();
      emit(frame);
      await service.restoreSubscriptions();
      await vi.advanceTimersByTimeAsync(0);

      expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
      expect(callback).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.activeAssetData).toHaveBeenCalledTimes(1);
    });

    it('retires pending streams on clearAll', async () => {
      const pending = deferOpen();
      const onError = vi.fn();
      service.subscribeToActiveAssetData({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
      });
      await vi.advanceTimersByTimeAsync(0);

      service.clearAll();
      const late: MockSubscription = {
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      pending.resolveOpen(late);
      await vi.advanceTimersByTimeAsync(0);

      expect(late.unsubscribe).toHaveBeenCalledTimes(1);
      expect(onError).not.toHaveBeenCalled();
    });
  });

  describe('Position Subscriptions', () => {
    it('should subscribe to position updates successfully', async () => {
      const mockCallback = vi.fn();
      const params: SubscribePositionsParams = {
        accountId: 'eip155:42161:0x123' as CaipAccountId,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToPositions(params);

      // Wait for async operations (individual subscription setup for HIP-3 mode)
      // Need to flush both timers and microtask queue since subscription uses fire-and-forget promises
      await vi.runAllTimersAsync();
      // Flush microtask queue to allow promise chains to complete
      await Promise.resolve();
      await vi.runAllTimersAsync();

      expect(mockWalletService.getUserAddressWithDefault).toHaveBeenCalledWith(
        params.accountId,
      );

      // HIP-3 mode uses individual subscriptions (clearinghouseState + openOrders)
      // and webData3 only for OI caps
      expect(mockSubscriptionClient.clearinghouseState).toHaveBeenCalledWith(
        { user: '0x123', dex: undefined },
        expect.any(Function),
      );
      expect(mockSubscriptionClient.openOrders).toHaveBeenCalledWith(
        { user: '0x123', dex: undefined },
        expect.any(Function),
      );
      expect(mockSubscriptionClient.webData3).toHaveBeenCalledWith(
        { user: '0x123' },
        expect.any(Function),
      );
      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle wallet service errors', async () => {
      mockWalletService.getUserAddressWithDefault.mockRejectedValue(
        new Error('Wallet error'),
      );

      const mockCallback = vi.fn();
      const params: SubscribePositionsParams = {
        accountId: 'eip155:42161:0x123' as CaipAccountId,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToPositions(params);

      // Wait for async operations
      await vi.runAllTimersAsync();

      // Should not call any subscriptions when wallet service fails
      expect(mockSubscriptionClient.clearinghouseState).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.openOrders).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.webData3).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle subscription client not available', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = vi.fn();
      const params: SubscribePositionsParams = {
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToPositions(params);

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(typeof unsubscribe).toBe('function');
      // Should not call any subscriptions when client not available
      expect(mockSubscriptionClient.clearinghouseState).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.openOrders).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.webData3).not.toHaveBeenCalled();
    });

    it('should filter out zero-size positions', async () => {
      const mockCallback = vi.fn();

      // Mock clearinghouseState with mixed positions (HIP-3 mode uses individual subscriptions)
      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  { position: { szi: '0.1' }, coin: 'BTC' }, // Should be included
                  { position: { szi: '0' }, coin: 'ETH' }, // Should be filtered out
                ],
                marginSummary: {
                  accountValue: '10000',
                  totalMarginUsed: '500',
                },
                withdrawable: '9500',
              },
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ size: '0.1' })]),
      );

      unsubscribe();
    });
  });

  describe('Order Fill Subscriptions', () => {
    it('should subscribe to order fill updates successfully', async () => {
      const mockCallback = vi.fn();
      const params: SubscribeOrderFillsParams = {
        accountId: 'eip155:42161:0x123' as CaipAccountId,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToOrderFills(params);

      expect(mockWalletService.getUserAddressWithDefault).toHaveBeenCalledWith(
        params.accountId,
      );

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(mockSubscriptionClient.userFills).toHaveBeenCalledWith(
        { user: '0x123' },
        expect.any(Function),
      );
      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should transform order fill data correctly', async () => {
      const mockCallback = vi.fn();

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            orderId: '12345',
            symbol: 'BTC',
            side: 'B',
            size: '0.1',
            price: '50000',
            fee: '5',
            timestamp: expect.any(Number),
          }),
        ],
        undefined, // isSnapshot is undefined for mock data without it
      );

      unsubscribe();
    });

    it('should handle wallet service errors in order fills', async () => {
      mockWalletService.getUserAddressWithDefault.mockRejectedValue(
        new Error('Wallet error'),
      );

      const mockCallback = vi.fn();
      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      // Wait for async operations
      await vi.runAllTimersAsync();

      expect(mockSubscriptionClient.userFills).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle order fills with liquidation data', async () => {
      const mockCallback = vi.fn();

      // Update mock data to include liquidation
      mockSubscriptionClient.userFills.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              fills: [
                {
                  oid: BigInt(12345),
                  coin: 'BTC',
                  side: 'A',
                  sz: '0.1',
                  px: '45000',
                  fee: '5',
                  time: Date.now(),
                  closedPnl: '-500',
                  dir: 'Close Long',
                  feeToken: 'USDC',
                  liquidation: {
                    liquidatedUser: '0x123',
                    markPx: '44900',
                    method: 'market',
                  },
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      await vi.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            orderId: '12345',
            symbol: 'BTC',
            liquidation: {
              liquidatedUser: '0x123',
              markPx: '44900',
              method: 'market',
            },
          }),
        ],
        undefined, // isSnapshot is undefined for mock data without it
      );

      unsubscribe();
    });

    it('keeps liquidation data when HyperLiquid omits the liquidated user', async () => {
      const mockCallback = vi.fn();
      mockSubscriptionClient.userFills.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              fills: [
                {
                  oid: BigInt(12345),
                  coin: 'BTC',
                  side: 'A',
                  sz: '0.1',
                  px: '45000',
                  fee: '5',
                  time: Date.now(),
                  closedPnl: '-500',
                  dir: 'Close Long',
                  feeToken: 'USDC',
                  liquidation: {
                    markPx: '44900',
                    method: 'backstop',
                  },
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      await vi.runAllTimersAsync();

      expect(mockCallback.mock.calls[0][0][0].liquidation).toStrictEqual({
        liquidatedUser: undefined,
        markPx: '44900',
        method: 'backstop',
      });

      unsubscribe();
    });

    it('enriches WS fills with detailedOrderType from cached orders', async () => {
      // Arrange — subscribe to orders first so #cachedOrders gets populated
      const orderCallback = vi.fn();
      service.subscribeToOrders({ callback: orderCallback });
      await vi.runAllTimersAsync();

      // Now subscribe to fills — the callback should enrich with cached order types
      const fillCallback = vi.fn();
      mockSubscriptionClient.userFills.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              fills: [
                {
                  oid: BigInt(12345),
                  coin: 'BTC',
                  side: 'B',
                  sz: '0.1',
                  px: '50000',
                  fee: '5',
                  time: Date.now(),
                  closedPnl: '0',
                  dir: 'Open Long',
                  feeToken: 'USDC',
                  startPosition: '0',
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Act
      const unsubscribe = service.subscribeToOrderFills({
        callback: fillCallback,
      });
      await vi.runAllTimersAsync();

      // Assert — fill received with orderId mapped and detailedOrderType enriched
      expect(fillCallback).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            orderId: '12345',
            symbol: 'BTC',
            detailedOrderType: 'Limit',
          }),
        ],
        undefined,
      );

      unsubscribe();
    });

    it('should pass isSnapshot flag to callback', async () => {
      const mockCallback = vi.fn();

      // Update mock data to include isSnapshot: true (snapshot message)
      mockSubscriptionClient.userFills.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              fills: [
                {
                  oid: BigInt(12345),
                  coin: 'BTC',
                  side: 'B',
                  sz: '0.1',
                  px: '50000',
                  fee: '5',
                  time: Date.now(),
                },
              ],
              isSnapshot: true, // This is a snapshot message
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      await vi.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Array),
        true, // isSnapshot should be passed through
      );

      unsubscribe();
    });

    describe('execution identifier', () => {
      /**
       * Two partial executions of ONE order that agree on oid, time, sz and
       * px. HyperLiquid does not guarantee those four identify a single
       * execution, so only tid separates them; a client deduplicating on the
       * four-field tuple drops a real trade.
       */
      type StreamedFill = UserFillsWsEvent['fills'][number];
      // A non-conforming venue payload: the SDK types tid as required.
      type StreamedFillFixture = Omit<StreamedFill, 'tid'> & { tid?: number };

      const baseFill: StreamedFill = {
        oid: 777,
        coin: 'BTC',
        side: 'B',
        sz: '0.5',
        px: '50000',
        fee: '1.25',
        feeToken: 'USDC',
        time: 1699999999999,
        closedPnl: '0',
        dir: 'Open Long',
        startPosition: '0',
        hash: '0x0000000000000000000000000000000000000000000000000000000000000000',
        crossed: true,
        twapId: null,
        tid: 111111111111111,
      };
      const collidingFills: StreamedFill[] = [
        baseFill,
        { ...baseFill, tid: 222222222222222 },
      ];

      const emitFills = (fills: StreamedFillFixture[]) => {
        mockSubscriptionClient.userFills.mockImplementation(
          (
            _params: { user: string },
            callback: (data: UserFillsWsEvent) => void,
          ) => {
            setTimeout(() => {
              callback({
                user: '0x0000000000000000000000000000000000000000',
                // The service must tolerate fills without tid at runtime.
                fills: fills as StreamedFill[],
                isSnapshot: true,
              });
            }, 0);
            return Promise.resolve({
              unsubscribe: vi.fn().mockResolvedValue(undefined),
            });
          },
        );
      };

      const subscribeAndCollect = async (): Promise<OrderFill[]> => {
        const mockCallback =
          vi.fn<(...args: [OrderFill[], boolean?]) => void>();
        const unsubscribe = service.subscribeToOrderFills({
          callback: mockCallback,
        });
        await vi.runAllTimersAsync();
        unsubscribe();
        return mockCallback.mock.calls[0][0];
      };

      it('builds fillId from coin, time and tid for each streamed fill', async () => {
        emitFills(collidingFills);

        const emitted = await subscribeAndCollect();

        expect(emitted).toHaveLength(2);
        expect(emitted[0].fillId).toBe('BTC:1699999999999:111111111111111');
        expect(emitted[1].fillId).toBe('BTC:1699999999999:222222222222222');
      });

      it('gives distinct fillIds to two executions sharing orderId, timestamp, size and price', async () => {
        emitFills(collidingFills);

        const emitted = await subscribeAndCollect();

        const contentKey = (fill: OrderFill) =>
          `${fill.orderId}-${fill.timestamp}-${fill.size}-${fill.price}`;
        expect(contentKey(emitted[0])).toBe(contentKey(emitted[1]));
        expect(emitted[0].fillId).not.toBe(emitted[1].fillId);
        expect(new Map(emitted.map((fill) => [fill.fillId, fill])).size).toBe(
          2,
        );
      });

      it('omits fillId when the streamed payload carries no tid', async () => {
        const { tid, ...withoutTid } = baseFill;
        emitFills([withoutTid]);

        const emitted = await subscribeAndCollect();

        expect(emitted).toHaveLength(1);
        expect(emitted[0].fillId).toBeUndefined();
        expect(Object.hasOwn(emitted[0], 'fillId')).toBe(false);
      });

      it('leaves the rest of the streamed fill content unchanged', async () => {
        emitFills([baseFill]);

        const emitted = await subscribeAndCollect();

        expect(emitted[0]).toMatchObject({
          orderId: '777',
          symbol: 'BTC',
          side: 'B',
          size: '0.5',
          price: '50000',
          fee: '1.25',
          feeToken: 'USDC',
          timestamp: 1699999999999,
          pnl: '0',
          direction: 'Open Long',
          startPosition: '0',
        });
      });
    });

    it('re-establishes the venue subscription after a reconnect', async () => {
      const callback = vi.fn();
      const unsubscribe = service.subscribeToOrderFills({
        callback,
      });
      await vi.runAllTimersAsync();
      expect(mockSubscriptionClient.userFills).toHaveBeenCalledTimes(1);

      await service.restoreSubscriptions();
      await vi.runAllTimersAsync();

      expect(mockSubscriptionClient.userFills).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('discards a pre-reconnect userFills open that resolves after restore', async () => {
      // Race: subscribe starts an open that is still awaiting when reconnect
      // clears the map and opens a replacement. The stale open must unsubscribe
      // itself instead of overwriting the live post-reconnect subscription
      // (MetaMask/metamask-extension#47287).
      let resolveFirstOpen:
        | ((subscription: { unsubscribe: ReturnType<typeof vi.fn> }) => void)
        | undefined;
      const firstSubscription = {
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      const secondSubscription = {
        unsubscribe: vi.fn().mockResolvedValue(undefined),
      };
      let openCount = 0;
      mockSubscriptionClient.userFills.mockImplementation(() => {
        openCount += 1;
        if (openCount === 1) {
          return new Promise((resolve) => {
            resolveFirstOpen = resolve;
          });
        }
        return Promise.resolve(secondSubscription);
      });

      const callback = vi.fn();
      const unsubscribe = service.subscribeToOrderFills({ callback });
      // Let the first open start but not resolve.
      await vi.waitFor(() => {
        expect(openCount).toBe(1);
      });

      const restorePromise = service.restoreSubscriptions();
      await vi.waitFor(() => {
        expect(openCount).toBe(2);
      });

      resolveFirstOpen?.(firstSubscription);
      await restorePromise;
      await vi.runAllTimersAsync();

      expect(firstSubscription.unsubscribe).toHaveBeenCalled();
      expect(secondSubscription.unsubscribe).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.userFills).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    describe('userFills open lifecycle', () => {
      type ControlledOpen = {
        emit: (event: unknown) => void;
        resolve: () => void;
        reject: (error: Error) => void;
        subscription: { unsubscribe: ReturnType<typeof vi.fn> };
      };

      const liveFill = (oid: number): unknown => ({
        user: '0x0000000000000000000000000000000000000000',
        fills: [
          {
            oid,
            coin: 'BTC',
            side: 'B',
            sz: '0.1',
            px: '50000',
            fee: '5',
            time: 1_700_000_000_000 + oid,
            closedPnl: '0',
            dir: 'Open Long',
            feeToken: 'USDC',
            startPosition: '0',
          },
        ],
        isSnapshot: false,
      });

      // Each userFills call returns a promise the test settles by hand, and
      // exposes the listener the service registered so frames can be pushed.
      const controlUserFillsOpens = (): ControlledOpen[] => {
        const opens: ControlledOpen[] = [];
        mockSubscriptionClient.userFills.mockImplementation(
          (_params: unknown, callback: (event: unknown) => void) => {
            const subscription = {
              unsubscribe: vi.fn().mockResolvedValue(undefined),
            };
            return new Promise((resolve, reject) => {
              opens.push({
                emit: callback,
                resolve: () => resolve(subscription),
                reject,
                subscription,
              });
            });
          },
        );
        return opens;
      };

      const waitForOpens = async (
        opens: ControlledOpen[],
        count: number,
      ): Promise<void> => {
        await vi.waitFor(() => {
          expect(opens).toHaveLength(count);
        });
      };

      it('delivers fills on the post-reconnect subscription and drops pre-reconnect frames', async () => {
        const opens = controlUserFillsOpens();
        const callback = vi.fn();
        const unsubscribe = service.subscribeToOrderFills({ callback });
        await waitForOpens(opens, 1);

        const restorePromise = service.restoreSubscriptions();
        await waitForOpens(opens, 2);
        opens[1].resolve();
        opens[0].resolve();
        await restorePromise;
        await vi.runAllTimersAsync();

        opens[0].emit(liveFill(1));
        expect(callback).not.toHaveBeenCalled();

        opens[1].emit(liveFill(2));
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          [expect.objectContaining({ orderId: '2' })],
          false,
        );
        expect(opens[0].subscription.unsubscribe).toHaveBeenCalled();
        expect(opens[1].subscription.unsubscribe).not.toHaveBeenCalled();
        unsubscribe();
      });

      it('opens its own userFills when the pending open it awaited rejects', async () => {
        const opens = controlUserFillsOpens();
        const firstCallback = vi.fn();
        const secondCallback = vi.fn();
        const unsubscribeFirst = service.subscribeToOrderFills({
          callback: firstCallback,
        });
        await waitForOpens(opens, 1);
        const unsubscribeSecond = service.subscribeToOrderFills({
          callback: secondCallback,
        });

        opens[0].reject(new Error('socket closed'));
        await waitForOpens(opens, 2);
        opens[1].resolve();
        await vi.runAllTimersAsync();

        opens[1].emit(liveFill(3));
        expect(firstCallback).toHaveBeenCalledTimes(1);
        expect(secondCallback).toHaveBeenCalledTimes(1);
        expect(mockSubscriptionClient.userFills).toHaveBeenCalledTimes(2);
        unsubscribeFirst();
        unsubscribeSecond();
      });

      it('does not open when the last subscriber left while a waiter was pending', async () => {
        const opens = controlUserFillsOpens();
        const unsubscribeFirst = service.subscribeToOrderFills({
          callback: vi.fn(),
        });
        await waitForOpens(opens, 1);
        const unsubscribeSecond = service.subscribeToOrderFills({
          callback: vi.fn(),
        });

        unsubscribeFirst();
        unsubscribeSecond();
        opens[0].resolve();
        await vi.runAllTimersAsync();

        expect(mockSubscriptionClient.userFills).toHaveBeenCalledTimes(1);
        expect(opens[0].subscription.unsubscribe).toHaveBeenCalled();
      });

      it('discards an in-flight open when the last subscriber leaves', async () => {
        const opens = controlUserFillsOpens();
        const staleCallback = vi.fn();
        const liveCallback = vi.fn();
        const unsubscribeStale = service.subscribeToOrderFills({
          callback: staleCallback,
        });
        await waitForOpens(opens, 1);
        unsubscribeStale();

        const unsubscribeLive = service.subscribeToOrderFills({
          callback: liveCallback,
        });
        await waitForOpens(opens, 2);

        opens[0].emit(liveFill(4));
        expect(staleCallback).not.toHaveBeenCalled();
        expect(liveCallback).not.toHaveBeenCalled();

        opens[1].resolve();
        opens[0].resolve();
        await vi.runAllTimersAsync();

        expect(opens[0].subscription.unsubscribe).toHaveBeenCalled();
        expect(opens[1].subscription.unsubscribe).not.toHaveBeenCalled();
        opens[1].emit(liveFill(5));
        expect(liveCallback).toHaveBeenCalledTimes(1);
        unsubscribeLive();
      });

      it('discards an in-flight open when clearAll runs', async () => {
        const opens = controlUserFillsOpens();
        const callback = vi.fn();
        service.subscribeToOrderFills({ callback });
        await waitForOpens(opens, 1);

        service.clearAll();
        opens[0].emit(liveFill(6));
        opens[0].resolve();
        await vi.runAllTimersAsync();

        expect(callback).not.toHaveBeenCalled();
        expect(opens[0].subscription.unsubscribe).toHaveBeenCalled();
      });
    });

    describe('userFills delivery over a shared SDK subscription', () => {
      type SdkLikeTransport = {
        client: { userFills: Mock };
        wire: ('subscribe' | 'unsubscribe')[];
        listenerCount: () => number;
        push: (event: unknown) => void;
        confirm: () => void;
        settleUnsubscribes: () => void;
      };

      // Mirrors the SDK's WebSocketSubscriptionManager: one server
      // subscription per payload shared by every userFills() call, every
      // listener receives every frame on the channel, and only the last
      // listener's unsubscribe reaches the server.
      const createSdkLikeTransport = ({
        autoConfirm = true,
        holdUnsubscribe = false,
      }: {
        autoConfirm?: boolean;
        holdUnsubscribe?: boolean;
      } = {}): SdkLikeTransport => {
        const listeners = new Set<(event: unknown) => void>();
        const wire: SdkLikeTransport['wire'] = [];
        let confirmation: Promise<void> | undefined;
        let confirmServer: () => void = () => undefined;
        const heldUnsubscribes: (() => void)[] = [];

        const userFills = vi.fn(
          async (_params: unknown, listener: (event: unknown) => void) => {
            if (!confirmation) {
              wire.push('subscribe');
              confirmation = autoConfirm
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    confirmServer = resolve;
                  });
            }
            listeners.add(listener);
            await confirmation;
            return {
              unsubscribe: vi.fn(async () => {
                listeners.delete(listener);
                if (listeners.size === 0 && confirmation) {
                  confirmation = undefined;
                  wire.push('unsubscribe');
                  if (holdUnsubscribe) {
                    await new Promise<void>((resolve) => {
                      heldUnsubscribes.push(resolve);
                    });
                  }
                }
              }),
            };
          },
        );

        return {
          client: { userFills },
          wire,
          listenerCount: () => listeners.size,
          push: (event) =>
            [...listeners].forEach((listener) => listener(event)),
          confirm: () => confirmServer(),
          settleUnsubscribes: () =>
            heldUnsubscribes.splice(0).forEach((resolve) => resolve()),
        };
      };

      const useTransport = (transport: SdkLikeTransport): void => {
        mockClientService.getSubscriptionClient.mockReturnValue(
          transport.client as any,
        );
      };

      const fillFrame = (oid: number, isSnapshot: boolean): unknown => ({
        user: '0x0000000000000000000000000000000000000000',
        fills:
          oid === 0
            ? []
            : [
                {
                  oid,
                  coin: 'ETH',
                  side: 'A',
                  sz: '2.5',
                  px: '2500.0',
                  fee: '1.25',
                  time: 1_700_000_000_000 + oid,
                  closedPnl: '12.50',
                  dir: 'Close Long',
                  feeToken: 'USDC',
                  startPosition: '2.5',
                  hash: '0xabc',
                  tid: oid + 1,
                },
              ],
        isSnapshot,
      });

      it('delivers each frame once when restore runs on the transport that holds the original listener', async () => {
        const transport = createSdkLikeTransport();
        useTransport(transport);
        const callback = vi.fn();
        const unsubscribe = service.subscribeToOrderFills({ callback });
        await vi.runAllTimersAsync();

        await service.restoreSubscriptions();
        await vi.runAllTimersAsync();

        // Restore drops its reference to the first ISubscription without
        // unsubscribing it, so the first open's listener stays attached
        // alongside the replacement; its stale generation keeps it inert.
        expect(transport.listenerCount()).toBe(2);
        expect(transport.wire).toStrictEqual(['subscribe']);

        transport.push(fillFrame(9_102_001, false));

        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          [expect.objectContaining({ orderId: '9102001' })],
          false,
        );
        unsubscribe();
      });

      it('delivers frames from the replacement transport after a reconnect', async () => {
        const originalTransport = createSdkLikeTransport();
        useTransport(originalTransport);
        const callback = vi.fn();
        const unsubscribe = service.subscribeToOrderFills({ callback });
        await vi.runAllTimersAsync();

        const replacementTransport = createSdkLikeTransport();
        useTransport(replacementTransport);
        await service.restoreSubscriptions();
        await vi.runAllTimersAsync();

        originalTransport.push(fillFrame(1, false));
        expect(callback).not.toHaveBeenCalled();

        replacementTransport.push(fillFrame(9_102_001, false));
        expect(callback).toHaveBeenCalledTimes(1);
        expect(callback).toHaveBeenCalledWith(
          [expect.objectContaining({ orderId: '9102001' })],
          false,
        );
        unsubscribe();
      });

      it('delivers and caches snapshot-shaped live frames pushed after the initial snapshot', async () => {
        const transport = createSdkLikeTransport();
        useTransport(transport);
        const callback = vi.fn();
        const unsubscribe = service.subscribeToOrderFills({ callback });
        await vi.runAllTimersAsync();

        transport.push(fillFrame(0, true));
        expect(callback).toHaveBeenLastCalledWith([], true);
        expect(service.getFillsCacheIfInitialized()).toStrictEqual([]);

        transport.push(fillFrame(9_102_001, true));
        expect(callback).toHaveBeenLastCalledWith(
          [expect.objectContaining({ orderId: '9102001' })],
          true,
        );
        expect(service.getFillsCacheIfInitialized()).toStrictEqual([
          expect.objectContaining({ orderId: '9102001' }),
        ]);

        transport.push(fillFrame(9_102_001, true));
        expect(callback).toHaveBeenCalledTimes(3);
        expect(callback).toHaveBeenLastCalledWith(
          [expect.objectContaining({ orderId: '9102001' })],
          true,
        );
        expect(service.getFillsCacheIfInitialized()).toStrictEqual([
          expect.objectContaining({ orderId: '9102001' }),
        ]);
        unsubscribe();
      });

      it('keeps a live fill cached when a stale listener receives an empty snapshot', async () => {
        const transport = createSdkLikeTransport();
        useTransport(transport);
        const callback = vi.fn();
        const unsubscribe = service.subscribeToOrderFills({ callback });
        await vi.runAllTimersAsync();
        await service.restoreSubscriptions();
        await vi.runAllTimersAsync();
        const [[, staleListener], [, liveListener]] =
          transport.client.userFills.mock.calls;

        liveListener(fillFrame(9_102_001, false));
        staleListener(fillFrame(0, true));

        expect(callback).toHaveBeenCalledTimes(1);
        expect(service.getFillsCacheIfInitialized()).toBeNull();
        expect(service.getCachedFills()).toStrictEqual([
          expect.objectContaining({ orderId: '9102001' }),
        ]);
        unsubscribe();
      });

      it('treats the snapshot of a re-subscribe as the authoritative fill history', async () => {
        const transport = createSdkLikeTransport();
        useTransport(transport);
        const callback = vi.fn();
        const unsubscribe = service.subscribeToOrderFills({ callback });
        await vi.runAllTimersAsync();
        transport.push(fillFrame(9_102_001, false));

        await service.restoreSubscriptions();
        await vi.runAllTimersAsync();
        transport.push(fillFrame(0, true));

        expect(callback).toHaveBeenLastCalledWith([], true);
        expect(service.getFillsCacheIfInitialized()).toStrictEqual([]);
        unsubscribe();
      });

      it('delivers to a subscriber that arrives before the previous teardown settles', async () => {
        const transport = createSdkLikeTransport({ holdUnsubscribe: true });
        useTransport(transport);
        const leavingCallback = vi.fn();
        const unsubscribeLeaving = service.subscribeToOrderFills({
          callback: leavingCallback,
        });
        await vi.runAllTimersAsync();

        unsubscribeLeaving();
        const arrivingCallback = vi.fn();
        const unsubscribeArriving = service.subscribeToOrderFills({
          callback: arrivingCallback,
        });
        await vi.runAllTimersAsync();

        expect(transport.wire).toStrictEqual([
          'subscribe',
          'unsubscribe',
          'subscribe',
        ]);
        transport.push(fillFrame(9_102_001, false));
        expect(leavingCallback).not.toHaveBeenCalled();
        expect(arrivingCallback).toHaveBeenCalledTimes(1);

        transport.settleUnsubscribes();
        await vi.runAllTimersAsync();
        transport.push(fillFrame(9_102_002, false));
        expect(arrivingCallback).toHaveBeenCalledTimes(2);
        expect(transport.listenerCount()).toBe(1);
        unsubscribeArriving();
      });

      it('delivers to a subscriber that joins the in-flight open the previous subscriber abandoned', async () => {
        const transport = createSdkLikeTransport({ autoConfirm: false });
        useTransport(transport);
        const leavingCallback = vi.fn();
        const unsubscribeLeaving = service.subscribeToOrderFills({
          callback: leavingCallback,
        });
        await vi.waitFor(() => {
          expect(transport.client.userFills).toHaveBeenCalledTimes(1);
        });

        unsubscribeLeaving();
        const arrivingCallback = vi.fn();
        const unsubscribeArriving = service.subscribeToOrderFills({
          callback: arrivingCallback,
        });
        await vi.waitFor(() => {
          expect(transport.client.userFills).toHaveBeenCalledTimes(2);
        });
        transport.confirm();
        await vi.runAllTimersAsync();

        expect(transport.wire).toStrictEqual(['subscribe']);
        expect(transport.listenerCount()).toBe(1);
        transport.push(fillFrame(9_102_001, false));
        expect(leavingCallback).not.toHaveBeenCalled();
        expect(arrivingCallback).toHaveBeenCalledTimes(1);
        unsubscribeArriving();
      });

      it('delivers to a subscriber that arrives after the abandoned open confirmed and tore itself down', async () => {
        const transport = createSdkLikeTransport({ autoConfirm: false });
        useTransport(transport);
        const unsubscribeLeaving = service.subscribeToOrderFills({
          callback: vi.fn(),
        });
        await vi.waitFor(() => {
          expect(transport.client.userFills).toHaveBeenCalledTimes(1);
        });
        unsubscribeLeaving();
        transport.confirm();
        await vi.runAllTimersAsync();
        expect(transport.wire).toStrictEqual(['subscribe', 'unsubscribe']);

        const arrivingCallback = vi.fn();
        const unsubscribeArriving = service.subscribeToOrderFills({
          callback: arrivingCallback,
        });
        await vi.waitFor(() => {
          expect(transport.client.userFills).toHaveBeenCalledTimes(2);
        });
        transport.confirm();
        await vi.runAllTimersAsync();

        expect(transport.wire).toStrictEqual([
          'subscribe',
          'unsubscribe',
          'subscribe',
        ]);
        transport.push(fillFrame(9_102_001, false));
        expect(arrivingCallback).toHaveBeenCalledTimes(1);
        unsubscribeArriving();
      });
    });
  });

  describe('Shared WebData3 Subscription', () => {
    it('should share webData3 subscription between positions and orders', async () => {
      const positionCallback = vi.fn();
      const orderCallback = vi.fn();

      // Mock getUserAddressWithDefault to return immediately
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        '0x123' as Hex,
      );

      // Subscribe to positions first
      const unsubscribePositions = service.subscribeToPositions({
        callback: positionCallback,
      });

      // Wait for subscription to be established and initial callback
      // This will trigger the first webData3 callback which caches both positions and orders
      await vi.runAllTimersAsync();

      // Verify position callback was called
      expect(positionCallback).toHaveBeenCalled();

      // Subscribe to orders - should reuse same webData3 subscription
      // and immediately get cached data
      const unsubscribeOrders = service.subscribeToOrders({
        callback: orderCallback,
      });

      // Orders should get cached data immediately (synchronously)
      // or after the second webData3 update with changed data
      await vi.runAllTimersAsync();

      // Should only call webData3 once for shared subscription
      expect(mockSubscriptionClient.webData3).toHaveBeenCalledTimes(1);

      // Both callbacks should be called with their respective data
      expect(positionCallback).toHaveBeenCalled();
      expect(orderCallback).toHaveBeenCalled();

      // Cleanup
      unsubscribePositions();
      unsubscribeOrders();
    });

    it('should maintain subscription when one subscriber unsubscribes', async () => {
      const positionCallback1 = vi.fn();
      const positionCallback2 = vi.fn();

      // Subscribe two position callbacks
      const unsubscribe1 = service.subscribeToPositions({
        callback: positionCallback1,
      });

      const unsubscribe2 = service.subscribeToPositions({
        callback: positionCallback2,
      });

      await vi.runAllTimersAsync();

      // Unsubscribe first callback
      unsubscribe1();

      // Second callback should still receive updates
      mockSubscriptionClient.webData3.mock.calls[0][1]({
        perpDexStates: [
          {
            clearinghouseState: {
              assetPositions: [
                {
                  position: { coin: 'BTC', szi: '1.0' },
                },
              ],
            },
            openOrders: [],
            perpsAtOpenInterestCap: [],
          },
        ],
      });

      expect(positionCallback2).toHaveBeenCalled();

      unsubscribe2();
    });

    it('should cache positions and orders data', async () => {
      const positionCallback = vi.fn();

      // Setup webData3 mock to call callback with data
      mockSubscriptionClient.webData3.mockImplementation(
        (_addr: any, callback: any) => {
          setTimeout(() => {
            callback({
              perpDexStates: [
                {
                  clearinghouseState: {
                    assetPositions: [
                      {
                        position: { szi: '1.0' },
                        coin: 'BTC',
                      },
                    ],
                  },
                  openOrders: [
                    {
                      oid: 123,
                      coin: 'BTC',
                      side: 'B',
                      sz: '0.5',
                      origSz: '0.5',
                      limitPx: '50000',
                      orderType: 'Limit',
                      timestamp: Date.now(),
                      isTrigger: false,
                      reduceOnly: false,
                    },
                  ],
                  perpsAtOpenInterestCap: [],
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: positionCallback,
      });

      await vi.runAllTimersAsync();

      // Should receive cached data on new subscription
      const newCallback = vi.fn();
      const unsubscribe2 = service.subscribeToPositions({
        callback: newCallback,
      });

      // New subscriber should get cached data immediately
      expect(newCallback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ symbol: 'BTC' })]),
      );

      unsubscribe();
      unsubscribe2();
    });

    it('uses per-DEX subscriptions (not webData2) when HIP-3 is disabled', async () => {
      // Arrange
      const positionCallback = vi.fn();
      const orderCallback = vi.fn();
      const accountCallback = vi.fn();
      const oiCapCallback = vi.fn();

      // Create service with HIP-3 disabled
      const serviceWithoutHip3 = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        false, // hip3Enabled = false
        [], // enabledDexs
      );

      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        '0x123' as Hex,
      );

      // Positions + account come from the main-DEX clearinghouseState subscription
      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: {
                      coin: 'BTC',
                      szi: '1.5',
                    },
                  },
                ],
                marginSummary: {
                  accountValue: '100000',
                  totalMarginUsed: '7500',
                },
                withdrawable: '92500',
              },
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Orders come from the main-DEX openOrders subscription
      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: '',
              orders: [
                {
                  oid: 456,
                  coin: 'ETH',
                  side: 'A',
                  sz: '2.0',
                  origSz: '2.0',
                  limitPx: '3000',
                  orderType: 'Limit',
                  timestamp: 1234567890000,
                  isTrigger: false,
                  reduceOnly: false,
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      // OI caps still come from webData3 (acceptable latency)
      mockSubscriptionClient.webData3.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              perpDexStates: [
                {
                  clearinghouseState: { assetPositions: [] },
                  openOrders: [],
                  perpsAtOpenInterestCap: ['BTC', 'DOGE'],
                },
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Act
      const unsubscribePositions = serviceWithoutHip3.subscribeToPositions({
        callback: positionCallback,
      });
      const unsubscribeOrders = serviceWithoutHip3.subscribeToOrders({
        callback: orderCallback,
      });
      const unsubscribeAccount = serviceWithoutHip3.subscribeToAccount({
        callback: accountCallback,
      });
      const unsubscribeOICaps = serviceWithoutHip3.subscribeToOICaps({
        callback: oiCapCallback,
      });

      await vi.runAllTimersAsync();

      // Assert: webData2 is never used; positions/orders/account come from the
      // per-DEX subscriptions and OI caps from webData3.
      expect(mockSubscriptionClient.webData2).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.clearinghouseState).toHaveBeenCalledWith(
        expect.objectContaining({ user: '0x123' }),
        expect.any(Function),
      );
      expect(mockSubscriptionClient.openOrders).toHaveBeenCalledWith(
        expect.objectContaining({ user: '0x123' }),
        expect.any(Function),
      );
      expect(mockSubscriptionClient.webData3).toHaveBeenCalledWith(
        { user: '0x123' },
        expect.any(Function),
      );

      expect(positionCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            size: '1.5',
          }),
        ]),
      );

      expect(orderCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            orderId: '456',
            symbol: 'ETH',
          }),
        ]),
      );

      expect(accountCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          totalBalance: expect.any(String),
          marginUsed: expect.any(String),
        }),
      );

      expect(oiCapCallback).toHaveBeenCalledWith(['BTC', 'DOGE']);

      // Cleanup
      unsubscribePositions();
      unsubscribeOrders();
      unsubscribeAccount();
      unsubscribeOICaps();
    });
  });

  describe('subscribeToTwapOrders', () => {
    const buildHistoryEntry = (twapId: number, coin: string) =>
      ({
        time: 1_700_000_000,
        state: {
          coin,
          executedNtl: '400',
          executedSz: '4',
          minutes: 30,
          randomize: false,
          reduceOnly: false,
          side: 'B',
          sz: '10',
          timestamp: 1_700_000_000_000,
          user: '0x123',
        },
        status: { status: 'activated' },
        twapId,
      }) satisfies TwapHistoryResponse[number];

    const statusAwareAdapt = (history: TwapHistoryResponse): TwapOrder[] =>
      history.map((entry) => ({
        orderId: String(entry.twapId),
        symbol: entry.state.coin,
        side: entry.state.side === 'B' ? 'buy' : 'sell',
        size: entry.state.sz,
        executedSize: entry.state.executedSz,
        remainingSize: '6',
        executedNotional: entry.state.executedNtl,
        fillProgressBps: 4000,
        timeProgressBps: 5000,
        elapsedTimeMilliseconds: 300_000,
        durationMinutes: entry.state.minutes,
        randomize: entry.state.randomize,
        reduceOnly: entry.state.reduceOnly,
        status: entry.status.status === 'activated' ? 'active' : 'completed',
        startedAt: entry.state.timestamp,
        lastUpdated: entry.state.timestamp,
        fills: [],
      }));

    const adaptStub = (history: TwapHistoryResponse): TwapOrder[] =>
      history.map((entry) => ({
        orderId: String(entry.twapId),
        symbol: entry.state.coin,
        side: entry.state.side === 'B' ? 'buy' : 'sell',
        size: entry.state.sz,
        executedSize: entry.state.executedSz,
        remainingSize: '6',
        executedNotional: entry.state.executedNtl,
        fillProgressBps: 4000,
        timeProgressBps: 5000,
        elapsedTimeMilliseconds: 300_000,
        durationMinutes: entry.state.minutes,
        randomize: entry.state.randomize,
        reduceOnly: entry.state.reduceOnly,
        status: 'active',
        startedAt: entry.state.timestamp,
        lastUpdated: entry.state.timestamp,
        fills: [],
      }));

    it('delivers adapted schedules from the venue push channel', async () => {
      // Arrange
      const callback = vi.fn();

      // Act
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();

      // Assert
      expect(callback).toHaveBeenCalledWith(
        [expect.objectContaining({ orderId: '77', symbol: 'BTC' })],
        true,
      );
      unsubscribe();
    });

    it('opens one venue subscription for two subscribers on the same account', async () => {
      // Arrange
      const first = vi.fn();
      const second = vi.fn();

      // Act
      const unsubscribeFirst = service.subscribeToTwapOrders({
        callback: first,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();
      const unsubscribeSecond = service.subscribeToTwapOrders({
        callback: second,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();

      // Assert
      expect(mockSubscriptionClient.userTwapHistory).toHaveBeenCalledTimes(1);
      unsubscribeFirst();
      unsubscribeSecond();
    });

    it('keeps the venue subscription while another subscriber remains', async () => {
      // Arrange
      const first = vi.fn();
      const second = vi.fn();
      const unsubscribeFirst = service.subscribeToTwapOrders({
        callback: first,
        adapt: adaptStub,
      });
      const unsubscribeSecond = service.subscribeToTwapOrders({
        callback: second,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();

      const subscription =
        await mockSubscriptionClient.userTwapHistory.mock.results[0].value;
      expect(mockSubscriptionClient.userTwapHistory).toHaveBeenCalledTimes(1);

      // Act
      unsubscribeFirst();

      // Assert
      expect(subscription.unsubscribe).not.toHaveBeenCalled();
      unsubscribeSecond();
    });

    it('closes the venue subscription once the last subscriber leaves', async () => {
      // Arrange
      const callback = vi.fn();
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();

      const subscription =
        await mockSubscriptionClient.userTwapHistory.mock.results[0].value;

      // Act
      unsubscribe();
      await vi.runAllTimersAsync();

      // Assert
      expect(subscription.unsubscribe).toHaveBeenCalled();
    });

    it('keeps schedules absent from a delta update', async () => {
      // Arrange: snapshot carries two schedules, the delta only mentions one
      mockSubscriptionClient.userTwapHistory.mockImplementation(
        (
          _params: { user: `0x${string}` },
          listener: (event: UserTwapHistoryWsEvent) => void,
        ) => {
          setTimeout(() => {
            listener({
              user: _params.user,
              history: [
                buildHistoryEntry(77, 'BTC'),
                buildHistoryEntry(88, 'ETH'),
              ],
              isSnapshot: true,
            });
            listener({
              user: _params.user,
              history: [buildHistoryEntry(77, 'BTC')],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );
      const callback = vi.fn();

      // Act
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();

      // Assert: the delta must not drop the schedule it did not mention
      const [deliveredOrders] =
        callback.mock.calls[callback.mock.calls.length - 1];
      expect(
        deliveredOrders
          .map((order: { orderId: string }) => order.orderId)
          .sort(),
      ).toStrictEqual(['77', '88']);
      unsubscribe();
    });

    it('replaces merged state when a fresh snapshot arrives', async () => {
      // Arrange: a snapshot after a delta must not retain the older schedule
      mockSubscriptionClient.userTwapHistory.mockImplementation(
        (
          _params: { user: `0x${string}` },
          listener: (event: UserTwapHistoryWsEvent) => void,
        ) => {
          setTimeout(() => {
            listener({
              user: _params.user,
              history: [
                buildHistoryEntry(77, 'BTC'),
                buildHistoryEntry(88, 'ETH'),
              ],
              isSnapshot: true,
            });
            listener({
              user: _params.user,
              history: [buildHistoryEntry(99, 'SOL')],
              isSnapshot: true,
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );
      const callback = vi.fn();

      // Act
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();

      // Assert
      const [deliveredOrders] =
        callback.mock.calls[callback.mock.calls.length - 1];
      expect(
        deliveredOrders.map((order: { orderId: string }) => order.orderId),
      ).toStrictEqual(['99']);
      unsubscribe();
    });

    it('keeps one account subscription alive when another account tears down', async () => {
      // Arrange: two accounts, each with its own live TWAP subscriber
      const accountA =
        'eip155:1:0x1111111111111111111111111111111111111111' as CaipAccountId;
      const accountB =
        'eip155:1:0x2222222222222222222222222222222222222222' as CaipAccountId;
      const callbackA = vi.fn();
      const callbackB = vi.fn();
      const unsubscribeA = service.subscribeToTwapOrders({
        callback: callbackA,
        accountId: accountA,
        adapt: adaptStub,
      });
      const unsubscribeB = service.subscribeToTwapOrders({
        callback: callbackB,
        accountId: accountB,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();
      // Act: account A's only subscriber leaves
      unsubscribeA();
      await vi.runAllTimersAsync();
      callbackB.mockClear();

      // Assert: B still receives pushes, so its subscription survived A's
      // teardown. Asserted through delivery rather than the mock handle,
      // which every subscription in this suite shares.
      const subscribeCallCount =
        mockSubscriptionClient.userTwapHistory.mock.calls.length;
      expect(subscribeCallCount).toBe(2);
      service.subscribeToTwapOrders({
        callback: vi.fn(),
        accountId: accountB,
        adapt: adaptStub,
      })();
      expect(mockSubscriptionClient.userTwapHistory).toHaveBeenCalledTimes(
        subscribeCallCount,
      );
      unsubscribeB();
    });

    it('re-establishes the venue subscription after a reconnect', async () => {
      // Arrange
      const callback = vi.fn();
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();
      expect(mockSubscriptionClient.userTwapHistory).toHaveBeenCalledTimes(1);

      // Act
      await service.restoreSubscriptions();
      await vi.runAllTimersAsync();

      // Assert: the retained adapter reopened the socket for this account
      expect(mockSubscriptionClient.userTwapHistory).toHaveBeenCalledTimes(2);
      unsubscribe();
    });

    it('retains a long-running active schedule under eviction pressure', async () => {
      // Arrange: one old active schedule plus enough newer terminal ones to
      // exceed the retention cap. The active one has the OLDEST startedAt, so
      // a cap applied across the whole set would evict exactly it.
      const activeEntry = {
        ...buildHistoryEntry(1, 'BTC'),
        state: { ...buildHistoryEntry(1, 'BTC').state, timestamp: 1_000 },
        status: { status: 'activated' },
      };
      const terminalEntries = Array.from({ length: 120 }, (_unused, index) => ({
        ...buildHistoryEntry(1000 + index, 'ETH'),
        state: {
          ...buildHistoryEntry(1000 + index, 'ETH').state,
          timestamp: 2_000_000 + index,
        },
        status: { status: 'finished' },
      }));
      mockSubscriptionClient.userTwapHistory.mockImplementation(
        (
          params: { user: `0x${string}` },
          listener: (event: UserTwapHistoryWsEvent) => void,
        ) => {
          setTimeout(() => {
            listener({
              user: params.user,
              history: [activeEntry, ...terminalEntries],
              isSnapshot: true,
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: vi.fn().mockResolvedValue(undefined),
          });
        },
      );
      const callback = vi.fn();

      // Act
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: statusAwareAdapt,
      });
      await vi.runAllTimersAsync();

      // Assert: the active schedule survives, terminals are capped
      const [delivered] = callback.mock.calls[callback.mock.calls.length - 1];
      const activeDelivered = delivered.filter(
        (order: { status: string }) => order.status === 'active',
      );
      expect(activeDelivered).toHaveLength(1);
      expect(activeDelivered[0].orderId).toBe('1');
      expect(
        delivered.filter(
          (order: { status: string }) => order.status !== 'active',
        ),
      ).toHaveLength(100);
      unsubscribe();
    });

    it('stops delivering to a callback after it unsubscribes', async () => {
      // Arrange
      const callback = vi.fn();
      const unsubscribe = service.subscribeToTwapOrders({
        callback,
        adapt: adaptStub,
      });
      await vi.runAllTimersAsync();
      const deliveredWhileSubscribed = callback.mock.calls.length;

      // Act
      unsubscribe();
      await vi.runAllTimersAsync();

      // Assert
      expect(callback).toHaveBeenCalledTimes(deliveredWhileSubscribed);
    });
  });
});
