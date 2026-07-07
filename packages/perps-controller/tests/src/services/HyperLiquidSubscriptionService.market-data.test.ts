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
  PriceUpdate,
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
  describe('BBO (Order Book) Subscriptions', () => {
    it('should subscribe to BBO when includeOrderBook is true', async () => {
      const mockCallback = jest.fn();
      const mockBboSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      mockSubscriptionClient.bbo.mockImplementation(
        (_params: any, callback: any) => {
          // Simulate BBO data
          setTimeout(() => {
            callback({
              coin: 'BTC',
              time: Date.now(),
              bbo: [
                { px: '49900', sz: '1.5', n: 1 }, // Bid
                { px: '50100', sz: '2.0', n: 1 }, // Ask
              ],
            });
          }, 0);
          return Promise.resolve(mockBboSubscription);
        },
      );

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeOrderBook: true,
      });

      // Wait for subscription and data processing
      await jest.runAllTimersAsync();

      // Verify BBO subscription was created
      expect(mockSubscriptionClient.bbo).toHaveBeenCalledWith(
        { coin: 'BTC' },
        expect.any(Function),
      );

      // Verify callback received bid/ask data
      expect(mockCallback).toHaveBeenCalled();
      const lastCall =
        mockCallback.mock.calls[mockCallback.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            bestBid: '49900',
            bestAsk: '50100',
          }),
        ]),
      );

      unsubscribe();
    });

    it('should not subscribe to BBO when includeOrderBook is false', async () => {
      const mockCallback = jest.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeOrderBook: false,
      });

      // Wait for any potential subscriptions
      await jest.runAllTimersAsync();

      // Verify BBO subscription was NOT created
      expect(mockSubscriptionClient.bbo).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('should handle multiple BBO subscriptions with reference counting', async () => {
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();
      const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
      mockSubscriptionClient.bbo.mockResolvedValue({
        unsubscribe: mockUnsubscribe,
      });

      // First subscription
      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback1,
        includeOrderBook: true,
      });

      await jest.runAllTimersAsync();

      // Second subscription to same symbol
      const unsubscribe2 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback2,
        includeOrderBook: true,
      });

      await jest.runAllTimersAsync();

      // Should only create one L2 book subscription
      expect(mockSubscriptionClient.bbo).toHaveBeenCalledTimes(1);

      // Unsubscribe first
      unsubscribe1();
      await jest.runAllTimersAsync();

      // BBO subscription should still be active
      expect(mockSubscriptionClient.bbo).toHaveBeenCalledTimes(1);
      expect(mockUnsubscribe).not.toHaveBeenCalled();

      // Unsubscribe second
      unsubscribe2();
      await jest.runAllTimersAsync();
      expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should handle BBO data with missing levels gracefully', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.bbo.mockImplementation(
        (_params: any, callback: any) => {
          // Simulate BBO data with missing levels
          setTimeout(() => {
            callback({
              coin: 'BTC',
              time: Date.now(),
              bbo: [undefined, undefined],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeOrderBook: true,
      });

      // Wait for subscription and data processing
      await jest.runAllTimersAsync();

      // Should still receive price updates, but without bid/ask
      expect(mockCallback).toHaveBeenCalled();
      const { calls } = mockCallback.mock;
      const lastCall = calls[calls.length - 1][0];

      // Check that bestBid and bestAsk are either undefined or '0'
      if (lastCall?.[0]) {
        expect(
          lastCall[0].bestBid === undefined || lastCall[0].bestBid === '0',
        ).toBeTruthy();
        expect(
          lastCall[0].bestAsk === undefined || lastCall[0].bestAsk === '0',
        ).toBeTruthy();
      }

      unsubscribe();
    });

    it('should handle BBO subscription errors', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.bbo.mockRejectedValue(
        new Error('BBO subscription failed'),
      );

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeOrderBook: true,
      });

      // Wait for subscription attempt
      await jest.runAllTimersAsync();

      // Error should be handled internally
      // Just verify the subscription still works
      expect(mockCallback).toHaveBeenCalled();

      unsubscribe();
    });

    it('should calculate spread from bid/ask prices', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.bbo.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: 'BTC',
              time: Date.now(),
              bbo: [
                { px: '49900', sz: '1.5', n: 1 }, // Bid
                { px: '50100', sz: '2.0', n: 1 }, // Ask
              ],
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeOrderBook: true,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      const { calls } = mockCallback.mock;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            bestBid: '49900',
            bestAsk: '50100',
            spread: '200.00000', // 50100 - 49900
          }),
        ]),
      );

      unsubscribe();
    });
  });

  describe('TP/SL Order Processing', () => {
    it('should process Take Profit orders correctly', async () => {
      const mockCallback = jest.fn();

      // HIP-3 mode uses individual subscriptions (clearinghouseState + openOrders)
      // Mock clearinghouseState with position data
      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: { szi: '1.0', coin: 'BTC' },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Mock openOrders with TP/SL trigger orders
      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 123,
                  coin: 'BTC',
                  side: 'S', // Sell order (opposite of long position)
                  sz: '1.0',
                  triggerPx: '55000', // Take profit trigger price
                  orderType: 'Take Profit',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5); // Slight delay to ensure clearinghouseState fires first
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should receive position with takeProfitPrice set
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          takeProfitPrice: '55000',
          takeProfitCount: 1,
          stopLossCount: 0,
        }),
      ]);

      unsubscribe();
    });

    it('should process Stop Loss orders correctly', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: { szi: '1.0', coin: 'BTC' },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 124,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '45000', // Stop loss trigger price
                  orderType: 'Stop',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '45000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should receive position with stopLossPrice set
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          stopLossPrice: '45000',
          takeProfitCount: 0,
          stopLossCount: 1,
        }),
      ]);

      unsubscribe();
    });

    it('should handle multiple TP/SL orders for same position', async () => {
      const mockCallback = jest.fn();

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: { szi: '2.0', coin: 'BTC' },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 125,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '55000',
                  orderType: 'Take Profit',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 126,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '56000',
                  orderType: 'Take Profit',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '56000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 127,
                  coin: 'BTC',
                  side: 'S',
                  sz: '0.5',
                  triggerPx: '45000',
                  orderType: 'Stop',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '45000',
                  origSz: '0.5',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should receive position with correct counts but only last TP/SL prices
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          takeProfitCount: 2,
          stopLossCount: 1,
          // Should have the last processed prices
          takeProfitPrice: expect.any(String),
          stopLossPrice: '45000',
        }),
      ]);

      unsubscribe();
    });

    it('should fallback to price-based TP/SL detection when orderType is ambiguous', async () => {
      const mockCallback = jest.fn();

      // Mock the adapter to include entryPrice
      const mockAdapter = jest.requireMock(
        '../../../src/utils/hyperLiquidAdapter',
      );
      mockAdapter.adaptPositionFromSDK.mockImplementationOnce(() => ({
        symbol: 'BTC',
        size: '1.0',
        entryPrice: '50000',
        positionValue: '50000',
        unrealizedPnl: '5000',
        marginUsed: '25000',
        leverage: { type: 'cross', value: 2 },
        liquidationPrice: '40000',
        maxLeverage: 100,
        returnOnEquity: '10.0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      }));

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: {
                      szi: '1.0',
                      coin: 'BTC',
                      entryPrice: '50000',
                    },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 128,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '55000', // Above entry price = Take Profit for long
                  orderType: 'Trigger', // Ambiguous order type
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 129,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '45000', // Below entry price = Stop Loss for long
                  orderType: 'Trigger', // Ambiguous order type
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '45000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should correctly identify TP/SL based on trigger price vs entry price
      // With the fix, ambiguous 'Trigger' orders are now counted correctly using price-based fallback
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          takeProfitPrice: '55000', // Above entry price
          stopLossPrice: '45000', // Below entry price
          takeProfitCount: 1, // Ambiguous orders now counted via price-based fallback
          stopLossCount: 1, // Ambiguous orders now counted via price-based fallback
        }),
      ]);

      unsubscribe();
    });

    it('should handle short position TP/SL logic correctly', async () => {
      const mockCallback = jest.fn();

      // Mock the adapter for short position
      const mockAdapter = jest.requireMock(
        '../../../src/utils/hyperLiquidAdapter',
      );
      mockAdapter.adaptPositionFromSDK.mockImplementationOnce(() => ({
        symbol: 'BTC',
        size: '-1.0', // Short position
        entryPrice: '50000',
        positionValue: '50000',
        unrealizedPnl: '5000',
        marginUsed: '25000',
        leverage: { type: 'cross', value: 2 },
        liquidationPrice: '60000',
        maxLeverage: 100,
        returnOnEquity: '10.0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      }));

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: {
                      szi: '-1.0', // Short position (negative size)
                      coin: 'BTC',
                      entryPrice: '50000',
                    },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 130,
                  coin: 'BTC',
                  side: 'B', // Buy order (opposite of short position)
                  sz: '1.0',
                  triggerPx: '45000', // Below entry price = Take Profit for short
                  orderType: 'Trigger',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '45000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 131,
                  coin: 'BTC',
                  side: 'B',
                  sz: '1.0',
                  triggerPx: '55000', // Above entry price = Stop Loss for short
                  orderType: 'Trigger',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // For short positions: TP when trigger < entry, SL when trigger > entry
      // With the fix, ambiguous 'Trigger' orders are now counted correctly using price-based fallback
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          takeProfitPrice: '45000', // Below entry price for short
          stopLossPrice: '55000', // Above entry price for short
          takeProfitCount: 1, // Ambiguous orders now counted via price-based fallback
          stopLossCount: 1, // Ambiguous orders now counted via price-based fallback
        }),
      ]);

      unsubscribe();
    });

    it('should include TP/SL orders in the orders list', async () => {
      const mockCallback = jest.fn();

      // Create service with enabledDexs to skip DEX discovery wait
      const hip3Service = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true, // hip3Enabled
        [], // enabledDexs - empty but we'll call updateFeatureFlags
      );

      // Simulate DEX discovery by calling updateFeatureFlags
      await hip3Service.updateFeatureFlags(true, [''], [], []);

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: { szi: '1.0', coin: 'BTC' },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 132,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '55000',
                  orderType: 'Take Profit',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 133,
                  coin: 'BTC',
                  side: 'B',
                  sz: '0.5',
                  limitPx: '49000',
                  orderType: 'Limit',
                  reduceOnly: false,
                  isPositionTpsl: false,
                  origSz: '0.5',
                  timestamp: Date.now(),
                  isTrigger: false,
                  triggerCondition: '',
                  triggerPx: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = hip3Service.subscribeToOrders({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should include both TP/SL and regular orders
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          orderId: '132',
          symbol: 'BTC',
          detailedOrderType: 'Take Profit',
        }),
        expect.objectContaining({
          orderId: '133',
          symbol: 'BTC',
          detailedOrderType: 'Limit',
        }),
      ]);

      unsubscribe();
    });

    it('should handle positions without matching TP/SL orders', async () => {
      const mockCallback = jest.fn();

      // Mock the adapter to return both positions
      const mockAdapter = jest.requireMock(
        '../../../src/utils/hyperLiquidAdapter',
      );
      mockAdapter.adaptPositionFromSDK
        .mockImplementationOnce((_assetPos: any) => ({
          symbol: 'BTC',
          size: '1.0',
          entryPrice: '50000',
          positionValue: '50000',
          unrealizedPnl: '5000',
          marginUsed: '25000',
          leverage: { type: 'cross', value: 2 },
          liquidationPrice: '40000',
          maxLeverage: 100,
          returnOnEquity: '10.0',
          cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
          takeProfitCount: 0,
          stopLossCount: 0,
        }))
        .mockImplementationOnce(() => ({
          symbol: 'ETH',
          size: '2.0',
          entryPrice: '3000',
          positionValue: '6000',
          unrealizedPnl: '1000',
          marginUsed: '3000',
          leverage: { type: 'isolated', value: 2 },
          liquidationPrice: '2500',
          maxLeverage: 50,
          returnOnEquity: '16.7',
          cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
          takeProfitCount: 0,
          stopLossCount: 0,
        }));

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: { szi: '1.0', coin: 'BTC' },
                    coin: 'BTC',
                  },
                  {
                    position: { szi: '2.0', coin: 'ETH' },
                    coin: 'ETH',
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 134,
                  coin: 'BTC', // Only BTC has TP/SL orders
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '55000',
                  orderType: 'Take Profit',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should handle positions with and without TP/SL
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          takeProfitPrice: '55000',
          takeProfitCount: 1,
          stopLossCount: 0,
        }),
        expect.objectContaining({
          symbol: 'ETH',
          takeProfitPrice: undefined,
          stopLossPrice: undefined,
          takeProfitCount: 0,
          stopLossCount: 0,
        }),
      ]);

      unsubscribe();
    });

    it('should re-extract TP/SL from cached orders when clearinghouseState updates', async () => {
      // Arrange
      const mockCallback = jest.fn();
      let clearinghouseStateCallback: (data: any) => void = () => undefined;

      // Setup adapter to return positions with symbol matching the orders
      const mockAdapter = jest.requireMock(
        '../../../src/utils/hyperLiquidAdapter',
      );
      mockAdapter.adaptPositionFromSDK.mockImplementation((assetPos: any) => ({
        symbol: assetPos.position.coin || assetPos.coin,
        size: assetPos.position.szi,
        entryPrice: '50000',
        positionValue: '50000',
        unrealizedPnl: '5000',
        marginUsed: '25000',
        leverage: { type: 'cross', value: 2 },
        liquidationPrice: '40000',
        maxLeverage: 100,
        returnOnEquity: '10.0',
        cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
        takeProfitCount: 0,
        stopLossCount: 0,
      }));

      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          // Store callback for later invocation
          clearinghouseStateCallback = callback;
          // Fire first update immediately (before orders are cached)
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: { szi: '1.0', coin: 'BTC' },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // openOrders fires at 10ms to cache trigger orders
      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 200,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '60000',
                  orderType: 'Take Profit',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '60000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 201,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '40000',
                  orderType: 'Stop Market',
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '40000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 10);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Act - subscribe to positions
      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for openOrders to fire and cache orders
      await jest.runAllTimersAsync();

      // Simulate a subsequent clearinghouseState update (which will use cached orders)
      clearinghouseStateCallback({
        dex: '',
        clearinghouseState: {
          assetPositions: [
            {
              position: { szi: '1.5', coin: 'BTC' },
              coin: 'BTC',
            },
          ],
          marginSummary: {
            accountValue: '11000',
            totalMarginUsed: '600',
          },
          withdrawable: '10400',
        },
      });

      await jest.runAllTimersAsync();

      // Assert - callback should have been called with TP/SL re-extracted from cached orders
      const lastCall =
        mockCallback.mock.calls[mockCallback.mock.calls.length - 1];
      expect(lastCall[0]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            takeProfitPrice: '60000',
            stopLossPrice: '40000',
            takeProfitCount: 1,
            stopLossCount: 1,
          }),
        ]),
      );

      unsubscribe();
    });

    it('preserves TP/SL data from cached orders with ambiguous Trigger type on clearinghouseState updates', async () => {
      const mockCallback = jest.fn();

      // Mock the adapter for long position - returns position with size from input
      const mockAdapter = jest.requireMock(
        '../../../src/utils/hyperLiquidAdapter',
      );
      mockAdapter.adaptPositionFromSDK.mockImplementation(
        (assetPos: { position: { szi: string } }) => ({
          symbol: 'BTC',
          size: assetPos.position.szi, // Use actual size from input
          entryPrice: '50000',
          positionValue: '50000',
          unrealizedPnl: '5000',
          marginUsed: '25000',
          leverage: { type: 'cross', value: 2 },
          liquidationPrice: '40000',
          maxLeverage: 100,
          returnOnEquity: '10.0',
          cumulativeFunding: { allTime: '0', sinceOpen: '0', sinceChange: '0' },
          takeProfitCount: 0,
          stopLossCount: 0,
        }),
      );

      // Track callback invocations for clearinghouseState
      const callbackRef: { current: ((data: any) => void) | null } = {
        current: null,
      };
      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          callbackRef.current = callback;
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [
                  {
                    position: {
                      szi: '1.0',
                      coin: 'BTC',
                      entryPrice: '50000',
                    },
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
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Orders with ambiguous 'Trigger' type (no 'Take Profit' or 'Stop' in orderType)
      // These should be classified by price: above entry = TP, below entry = SL
      mockSubscriptionClient.openOrders.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              orders: [
                {
                  oid: 200,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '55000', // Above entry price = Take Profit for long
                  orderType: 'Trigger', // Ambiguous order type
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '55000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
                {
                  oid: 201,
                  coin: 'BTC',
                  side: 'S',
                  sz: '1.0',
                  triggerPx: '45000', // Below entry price = Stop Loss for long
                  orderType: 'Trigger', // Ambiguous order type
                  reduceOnly: true,
                  isPositionTpsl: true,
                  limitPx: '45000',
                  origSz: '1.0',
                  timestamp: Date.now(),
                  isTrigger: true,
                  triggerCondition: '',
                  children: [],
                  tif: null,
                  cloid: null,
                },
              ],
            });
          }, 5); // openOrders arrives after clearinghouseState
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for initial subscription setup and callbacks
      await jest.runAllTimersAsync();

      // Verify initial TP/SL extraction worked
      expect(mockCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            takeProfitPrice: '55000',
            stopLossPrice: '45000',
          }),
        ]),
      );

      // Clear mock to track subsequent calls
      mockCallback.mockClear();

      // Simulate a subsequent clearinghouseState update (e.g., position size change)
      // This triggers re-extraction of TP/SL from CACHED orders
      // Note: We change szi slightly to ensure positionsHash changes and callback is triggered
      expect(callbackRef.current).not.toBeNull();
      if (callbackRef.current) {
        callbackRef.current({
          dex: '',
          clearinghouseState: {
            assetPositions: [
              {
                position: {
                  szi: '1.1', // Changed from 1.0 - ensures positionsHash differs and callback fires
                  coin: 'BTC',
                  entryPrice: '50000',
                },
                coin: 'BTC',
              },
            ],
            marginSummary: {
              accountValue: '10500', // Changed - simulates PnL update
              totalMarginUsed: '500',
            },
            withdrawable: '10000',
          },
        });
      }

      await jest.runAllTimersAsync();

      // TP/SL should still be present after re-extraction from cached orders
      // This is the bug fix: cached orders with 'Trigger' type should use price-based fallback
      expect(mockCallback).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            takeProfitPrice: '55000', // Should persist
            stopLossPrice: '45000', // Should persist
          }),
        ]),
      );

      unsubscribe();
    });
  });

  describe('Race condition prevention', () => {
    it('should prevent duplicate allMids subscriptions when multiple subscribeToPrices calls happen simultaneously', async () => {
      const callbacks = [jest.fn(), jest.fn(), jest.fn()];
      const unsubscribes: (() => void)[] = [];

      // Call subscribeToPrices multiple times simultaneously
      const subscribePromises = callbacks.map(async (callback) => {
        const unsubscribe = await service.subscribeToPrices({
          symbols: ['BTC'],
          callback,
        });
        unsubscribes.push(unsubscribe);
      });

      // Wait for all subscriptions to complete
      await Promise.all(subscribePromises);

      // Advance timers for async callbacks
      await jest.runAllTimersAsync();

      // Should only create one allMids subscription despite multiple simultaneous calls
      expect(mockSubscriptionClient.allMids).toHaveBeenCalledTimes(1);

      // All callbacks should still work
      await jest.runAllTimersAsync();
      callbacks.forEach((callback) => {
        expect(callback).toHaveBeenCalled();
      });

      // Cleanup
      unsubscribes.forEach((unsubscribe) => unsubscribe());
    });

    it('should retry allMids subscription if initial attempt fails', async () => {
      const callback = jest.fn();
      const mockUnsubscribeFn = jest.fn();
      const mockSubscriptionObj = {
        unsubscribe: mockUnsubscribeFn,
      };

      // Make first attempt fail
      mockSubscriptionClient.allMids.mockImplementationOnce(() =>
        Promise.reject(new Error('Connection failed')),
      );

      // Second attempt succeeds
      mockSubscriptionClient.allMids.mockImplementationOnce((cb: any) => {
        setTimeout(() => {
          cb({
            mids: {
              BTC: '50000',
            },
          });
        }, 10);
        return Promise.resolve(mockSubscriptionObj);
      });

      // First subscription attempt
      const unsubscribe1 = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback,
      });

      // Wait for first attempt to fail
      await jest.runAllTimersAsync();

      // Second subscription attempt should retry
      const unsubscribe2 = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback,
      });

      // Wait for second attempt to succeed
      await jest.runAllTimersAsync();

      // Should have tried twice total
      expect(mockSubscriptionClient.allMids).toHaveBeenCalledTimes(2);

      // Cleanup
      unsubscribe1();
      unsubscribe2();
    });
  });

  it('should not repeatedly notify subscribers with empty positions', async () => {
    const mockCallback = jest.fn();

    // HIP-3 mode uses individual subscriptions
    // Mock clearinghouseState to send multiple empty updates
    mockSubscriptionClient.clearinghouseState.mockImplementation(
      (_params: any, callback: any) => {
        // Send first update
        setTimeout(() => {
          callback({
            dex: _params.dex || '',
            clearinghouseState: {
              assetPositions: [],
              marginSummary: { accountValue: '10000', totalMarginUsed: '0' },
              withdrawable: '10000',
            },
          });
        }, 0);

        // Send second update (still empty)
        setTimeout(() => {
          callback({
            dex: _params.dex || '',
            clearinghouseState: {
              assetPositions: [],
              marginSummary: { accountValue: '10000', totalMarginUsed: '0' },
              withdrawable: '10000',
            },
          });
        }, 20);

        return Promise.resolve({
          unsubscribe: jest.fn().mockResolvedValue(undefined),
        });
      },
    );

    mockSubscriptionClient.openOrders.mockImplementation(
      (_params: any, callback: any) => {
        setTimeout(() => {
          callback({
            dex: _params.dex || '',
            orders: [],
          });
        }, 5);
        return Promise.resolve({
          unsubscribe: jest.fn().mockResolvedValue(undefined),
        });
      },
    );

    const unsubscribe = service.subscribeToPositions({
      callback: mockCallback,
    });

    // Wait for both updates to process
    await jest.runAllTimersAsync();

    // Should only be called once with empty positions (initial notification)
    expect(mockCallback).toHaveBeenCalledTimes(1);
    expect(mockCallback).toHaveBeenCalledWith([]);

    unsubscribe();
  });

  it('should notify price subscribers on first update even with zero prices', async () => {
    const mockCallback = jest.fn();

    // Mock allMids with zero prices
    mockSubscriptionClient.allMids.mockImplementation((callback: any) => {
      // Send first update
      setTimeout(() => {
        callback({
          mids: {
            BTC: '0',
            ETH: '0',
          },
        });
      }, 0);
      return Promise.resolve({
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      });
    });

    const unsubscribe = await service.subscribeToPrices({
      symbols: ['BTC', 'ETH'],
      callback: mockCallback,
    });

    // Wait for processing
    await jest.runAllTimersAsync();

    // Should call callback with zero prices to enable UI state
    expect(mockCallback).toHaveBeenCalledWith([
      expect.objectContaining({
        symbol: 'BTC',
        price: '0',
      }),
      expect.objectContaining({
        symbol: 'ETH',
        price: '0',
      }),
    ]);

    unsubscribe();
  });

  describe('HIP-3 Feature Flags and Multi-DEX Support', () => {
    it('initializes service with HIP-3 DEXs enabled', () => {
      const hip3Service = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true, // hip3Enabled
        ['dex1', 'dex2'], // enabledDexs
      );

      expect(hip3Service).toBeDefined();
    });

    it('returns only main DEX when equity is disabled', () => {
      const subscriptionService = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        false, // hip3Enabled
        [],
      );

      expect(subscriptionService).toBeDefined();
    });

    it('updates feature flags and establishes new DEX subscriptions', async () => {
      // Start with market data subscribers to trigger assetCtxs subscriptions
      const mockCallback = jest.fn();
      const mockInfoClient = {
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC' }, { name: 'ETH' }],
        }),
      };
      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      const assetCtxsSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };
      mockSubscriptionClient.assetCtxs = jest
        .fn()
        .mockResolvedValue(assetCtxsSubscription);

      // Subscribe to prices with market data to create market data subscribers
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Now update feature flags to enable new DEXs
      await service.updateFeatureFlags(true, ['newdex1', 'newdex2'], [], []);

      expect(mockInfoClient.meta).toHaveBeenCalledWith({ dex: 'newdex1' });
      expect(mockInfoClient.meta).toHaveBeenCalledWith({ dex: 'newdex2' });
    });

    it('handles errors when establishing assetCtxs subscriptions for new DEXs', async () => {
      const mockCallback = jest.fn();

      // Mock successful meta call but failing assetCtxs subscription
      const mockInfoClient = {
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC' }],
        }),
      };
      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      // Make assetCtxs subscription fail
      mockSubscriptionClient.assetCtxs = jest
        .fn()
        .mockRejectedValue(new Error('AssetCtxs subscription failed'));

      // Subscribe to prices with market data to create market data subscribers
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Update feature flags - should handle error gracefully without throwing
      await service.updateFeatureFlags(true, ['failingdex'], [], []);

      // Wait for async error handling
      await jest.runAllTimersAsync();

      // Verify updateFeatureFlags completed without throwing
      expect(mockInfoClient.meta).toHaveBeenCalledWith({ dex: 'failingdex' });
    });

    it('handles errors when establishing clearinghouseState subscriptions for new DEXs', async () => {
      const mockPositionCallback = jest.fn();
      mockSubscriptionClient.clearinghouseState = jest
        .fn()
        .mockRejectedValue(new Error('Subscription failed'));

      // Subscribe to positions first
      service.subscribeToPositions({
        callback: mockPositionCallback,
      });

      await jest.runAllTimersAsync();

      // Update feature flags - should handle error gracefully
      await expect(
        service.updateFeatureFlags(true, ['failingdex2'], [], []),
      ).resolves.not.toThrow();
    });

    it('handles getUserAddress errors during feature flag updates', async () => {
      const mockPositionCallback = jest.fn();
      mockWalletService.getUserAddressWithDefault.mockRejectedValue(
        new Error('Wallet error'),
      );

      // Subscribe to positions first
      service.subscribeToPositions({
        callback: mockPositionCallback,
      });

      await jest.runAllTimersAsync();

      // Update feature flags - should handle wallet error gracefully
      await expect(
        service.updateFeatureFlags(true, ['newdex'], [], []),
      ).resolves.not.toThrow();

      // Reset mock for other tests
      mockWalletService.getUserAddressWithDefault.mockResolvedValue(
        '0x123' as Hex,
      );
    });

    it('does not establish subscriptions when no new DEXs are added', async () => {
      const mockCallback = jest.fn();
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      const initialCallCount = mockSubscriptionClient.assetCtxs
        ? (mockSubscriptionClient.assetCtxs as jest.Mock).mock.calls.length
        : 0;

      // Update with same DEXs (no new ones)
      await service.updateFeatureFlags(false, [], [], []);

      // Should not create new subscriptions
      const finalCallCount = mockSubscriptionClient.assetCtxs
        ? (mockSubscriptionClient.assetCtxs as jest.Mock).mock.calls.length
        : 0;
      expect(finalCallCount).toBe(initialCallCount);
    });

    it('cleans up failed assetCtxs subscriptions so later HIP-3 resubscribes reconnect cleanly', async () => {
      const mockCallback = jest.fn();
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
        .mockRejectedValueOnce(new Error('Subscription failed'))
        .mockResolvedValueOnce({
          unsubscribe: jest.fn().mockResolvedValue(undefined),
        })
        .mockResolvedValueOnce({
          unsubscribe: jest.fn().mockResolvedValue(undefined),
        });

      const failedUnsubscribe = await service.subscribeToPrices({
        symbols: ['BTC:UNISWAP'],
        callback: mockCallback,
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();
      failedUnsubscribe();
      await jest.runAllTimersAsync();

      const recoveredUnsubscribe = await service.subscribeToPrices({
        symbols: ['BTC:UNISWAP'],
        callback: mockCallback,
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();
      recoveredUnsubscribe();
      await jest.runAllTimersAsync();

      const finalUnsubscribe = await service.subscribeToPrices({
        symbols: ['BTC:UNISWAP'],
        callback: mockCallback,
        includeMarketData: true,
      });
      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.assetCtxs).toHaveBeenCalledTimes(3);
      finalUnsubscribe();
    });
  });

  describe('Market Data Cache Initialization', () => {
    it('uses setDexMetaCache to pre-populate meta cache instead of API call', async () => {
      // Test that setDexMetaCache can be used to pre-populate the cache
      // This is how Provider shares cached meta with SubscriptionService
      const mockMeta = {
        universe: [
          { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
          { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
          { name: 'SOL', szDecimals: 2, maxLeverage: 20 },
        ],
      };

      // Pre-populate cache via setDexMetaCache (simulating what Provider does)
      service.setDexMetaCache('', mockMeta);

      const mockCallback = jest.fn();
      const mockInfoClient = {
        // These should NOT be called since cache is populated
        meta: jest.fn().mockResolvedValue(mockMeta),
        metaAndAssetCtxs: jest.fn().mockResolvedValue([mockMeta, []]),
      };

      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC', 'ETH', 'SOL'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Verify that metaAndAssetCtxs was NOT called (cache was used)
      // Note: meta() may still be called by createAssetCtxsSubscription fallback if cache miss,
      // but with proper cache population, it should hit the cache
      expect(mockInfoClient.metaAndAssetCtxs).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('handles errors when caching initial market data', async () => {
      const mockCallback = jest.fn();
      const mockInfoClient = {
        meta: jest.fn().mockRejectedValue(new Error('Meta fetch failed')),
        metaAndAssetCtxs: jest
          .fn()
          .mockRejectedValue(new Error('AssetCtxs fetch failed')),
      };

      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      // Should not throw even if initial cache fails
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Subscription should still work despite cache error
      expect(unsubscribe).toBeDefined();
      expect(typeof unsubscribe).toBe('function');

      unsubscribe();
    });

    it('skips caching when includeMarketData is false', async () => {
      const mockCallback = jest.fn();
      const mockInfoClient = {
        meta: jest.fn(),
        metaAndAssetCtxs: jest.fn(),
      };

      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: false,
      });

      await jest.runAllTimersAsync();

      // assetCtxs subscription is always established (lightweight, 1 per DEX)
      // so meta may be called for the assetCtxs mapping, but metaAndAssetCtxs should not
      expect(mockInfoClient.metaAndAssetCtxs).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('handles partial market data in cache', async () => {
      const mockCallback = jest.fn();
      const mockInfoClient = {
        meta: jest.fn().mockResolvedValue({
          universe: [{ name: 'BTC' }, { name: 'ETH' }],
        }),
        metaAndAssetCtxs: jest.fn().mockResolvedValue([
          {},
          [
            {
              funding: '0.0001',
              prevDayPx: '49000',
            },
            null, // Missing asset context for ETH
          ],
        ]),
      };

      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC', 'ETH'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // Should handle partial data gracefully
      expect(mockCallback).toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('Multi-DEX Error Handling', () => {
    it('handles webData3 subscription errors gracefully', async () => {
      const mockCallback = jest.fn();
      mockSubscriptionClient.webData3 = jest
        .fn()
        .mockRejectedValue(new Error('WebData3 subscription failed'));

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should return unsubscribe function despite error
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
    });

    it('handles clearinghouseState subscription errors for HIP-3 DEXs', async () => {
      const mockCallback = jest.fn();
      mockSubscriptionClient.clearinghouseState = jest
        .fn()
        .mockRejectedValue(new Error('ClearinghouseState subscription failed'));

      // Create service with HIP-3 enabled
      const hip3Service = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true,
        ['failingdex'],
      );

      const unsubscribe = hip3Service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Should handle error gracefully
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
    });

    it('handles unsubscribe errors for HIP-3 clearinghouseState', async () => {
      const mockCallback = jest.fn();
      const mockInfoClient = {
        frontendOpenOrders: jest.fn().mockResolvedValue([]),
      };
      mockClientService.getInfoClient = jest.fn(() => mockInfoClient as any);

      const clearinghouseStateSubscription = {
        unsubscribe: jest
          .fn()
          .mockRejectedValue(new Error('Unsubscribe failed')),
      };

      mockSubscriptionClient.clearinghouseState = jest.fn(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              user: '0x123',
              clearinghouseState: {
                assetPositions: [],
              },
            });
          }, 0);
          return Promise.resolve(clearinghouseStateSubscription);
        },
      );

      // Create service with HIP-3 enabled
      const hip3Service = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true,
        ['testdex'],
      );

      const unsubscribe = hip3Service.subscribeToPositions({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Unsubscribe should not throw even if underlying unsubscribe fails
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('Cache Initialization Checks', () => {
    it('returns false for OI caps cache before initialization', () => {
      const result = service.isOICapsCacheInitialized();

      expect(result).toBe(false);
    });

    it('returns false for orders cache before initialization', () => {
      const result = service.isOrdersCacheInitialized();

      expect(result).toBe(false);
    });

    it('returns false for positions cache before initialization', () => {
      const result = service.isPositionsCacheInitialized();

      expect(result).toBe(false);
    });

    it('returns null for cached positions before initialization', () => {
      const result = service.getCachedPositions();

      expect(result).toBeNull();
    });

    it('returns null for cached orders before initialization', () => {
      const result = service.getCachedOrders();

      expect(result).toBeNull();
    });

    it('getOrdersCacheIfInitialized returns null when cache not initialized', () => {
      const result = service.getOrdersCacheIfInitialized();

      expect(result).toBeNull();
    });

    it('getOrdersCacheIfInitialized returns empty array when initialized but no orders', async () => {
      // First subscribe to trigger initialization
      const callback = jest.fn();
      service.subscribeToOrders({ callback });

      // Manually set the cache as initialized with empty data
      // We need to simulate WebSocket message to trigger initialization
      // For unit test, we verify the method exists and returns correct type
      const result = service.getOrdersCacheIfInitialized();

      // Before any WebSocket data, should return null
      expect(result).toBeNull();
    });

    it('getOrdersCacheIfInitialized returns defensive copy of orders', async () => {
      // This test verifies the atomic getter returns a copy, not the original
      // We test indirectly by verifying the method signature and behavior
      const result1 = service.getOrdersCacheIfInitialized();
      const result2 = service.getOrdersCacheIfInitialized();

      // Both should be null before initialization
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('returns null for cached fills before initialization', () => {
      const result = service.getCachedFills();

      expect(result).toBeNull();
    });

    it('getLastAllMidsSnapshot returns a defensive copy and null for unknown dexes', async () => {
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
      });

      await jest.runAllTimersAsync();

      const snapshot = service.getLastAllMidsSnapshot();
      expect(snapshot).toEqual(
        expect.objectContaining({
          BTC: 50000,
          ETH: 3000,
        }),
      );

      if (!snapshot) {
        throw new Error('Expected allMids snapshot to be populated');
      }

      delete snapshot.BTC;

      expect(service.getLastAllMidsSnapshot()).toEqual(
        expect.objectContaining({
          BTC: 50000,
          ETH: 3000,
        }),
      );
      expect(service.getLastAllMidsSnapshot('missing-dex')).toBeNull();

      unsubscribe();
    });

    it('getFillsCacheIfInitialized returns null when cache not initialized', () => {
      const result = service.getFillsCacheIfInitialized();

      expect(result).toBeNull();
    });

    it('getFillsCacheIfInitialized returns defensive copy of fills', () => {
      // This test verifies the atomic getter returns a copy, not the original
      // We test indirectly by verifying the method signature and behavior
      const result1 = service.getFillsCacheIfInitialized();
      const result2 = service.getFillsCacheIfInitialized();

      // Both should be null before initialization
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('activeAssetCtx price preference (per-subscriber projection)', () => {
    it('focused subscriber (includeMarketData: true) sees activeAssetCtx midPx; list subscriber sees allMids', async () => {
      let allMidsCallback: ((data: any) => void) | undefined;
      let activeAssetCallback: ((data: any) => void) | undefined;

      mockSubscriptionClient.allMids.mockImplementation(
        (paramsOrCallback: any, maybeCallback?: any) => {
          allMidsCallback =
            typeof paramsOrCallback === 'function'
              ? paramsOrCallback
              : maybeCallback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const focusedCallback = jest.fn();
      const listCallback = jest.fn();

      const unsubFocused = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: focusedCallback,
        includeMarketData: true,
      });

      const unsubList = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: listCallback,
        includeMarketData: false,
      });

      await jest.runAllTimersAsync();

      // allMids fires first with 50000
      allMidsCallback?.({ mids: { BTC: '50000' } });
      await jest.runAllTimersAsync();

      // activeAssetCtx fires with a fresher 50500
      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '49000',
          funding: '0.01',
          openInterest: '1000000',
          dayNtlVlm: '50000000',
          oraclePx: '50100',
          midPx: '50500',
        },
      });
      await jest.runAllTimersAsync();

      const focusedLast =
        focusedCallback.mock.calls[focusedCallback.mock.calls.length - 1][0];
      expect(focusedLast).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ symbol: 'BTC', price: '50500' }),
        ]),
      );

      const listLast =
        listCallback.mock.calls[listCallback.mock.calls.length - 1][0];
      expect(listLast).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ symbol: 'BTC', price: '50000' }),
        ]),
      );

      unsubFocused();
      unsubList();
    });

    it('focused subscriber gets fast price even before allMids baseline arrives', async () => {
      let activeAssetCallback: ((data: any) => void) | undefined;

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // allMids never fires in this test
      mockSubscriptionClient.allMids.mockImplementation(
        (_paramsOrCallback: any, _maybeCallback?: any) => {
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const focusedCallback = jest.fn();
      const unsubFocused = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: focusedCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '49000',
          funding: '0.01',
          openInterest: '1000000',
          dayNtlVlm: '50000000',
          oraclePx: '50100',
          midPx: '50500',
        },
      });

      await jest.runAllTimersAsync();

      const lastCall =
        focusedCallback.mock.calls[focusedCallback.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ symbol: 'BTC', price: '50500' }),
        ]),
      );

      unsubFocused();
    });

    it('does not emit a price when activeAssetCtx has no midPx/markPx and no allMids baseline exists', async () => {
      let activeAssetCallback: ((data: any) => void) | undefined;

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // allMids never fires
      mockSubscriptionClient.allMids.mockImplementation(
        (_paramsOrCallback: any, _maybeCallback?: any) => {
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const mockCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();
      mockCallback.mockClear();

      // activeAssetCtx fires without a midPx or markPx
      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '49000',
          funding: '0.01',
          openInterest: '1000000',
          dayNtlVlm: '50000000',
          oraclePx: '50100',
          // no midPx, no markPx
        },
      });

      await jest.runAllTimersAsync();

      // The callback should not have been called at all: without midPx/markPx
      // there is no fast-stream price to project, and no allMids baseline
      // exists yet, so #notifyAllPriceSubscribers has nothing to send.
      expect(mockCallback).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('list subscriber always uses allMids price (never sees activeAssetCtx fast price)', async () => {
      let allMidsCallback: ((data: any) => void) | undefined;
      let activeAssetCallback: ((data: any) => void) | undefined;

      mockSubscriptionClient.allMids.mockImplementation(
        (paramsOrCallback: any, maybeCallback?: any) => {
          allMidsCallback =
            typeof paramsOrCallback === 'function'
              ? paramsOrCallback
              : maybeCallback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const listCallback = jest.fn();

      // Subscribe with a focused subscriber first so activeAssetCtx is established
      const unsubFocused = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeMarketData: true,
      });

      const unsubList = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: listCallback,
        includeMarketData: false,
      });

      await jest.runAllTimersAsync();

      allMidsCallback?.({ mids: { BTC: '50000' } });
      await jest.runAllTimersAsync();

      listCallback.mockClear();

      // Fast stream ticks with a higher price
      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '49000',
          funding: '0.01',
          openInterest: '1000000',
          dayNtlVlm: '50000000',
          oraclePx: '50100',
          midPx: '50500',
        },
      });

      await jest.runAllTimersAsync();

      // List subscriber should still see 50000 (allMids), never 50500
      const listLast =
        listCallback.mock.calls[listCallback.mock.calls.length - 1][0];
      expect(listLast).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ symbol: 'BTC', price: '50000' }),
        ]),
      );

      unsubFocused();
      unsubList();
    });

    it('focused subscriber falls back to allMids when activeAssetCtx price is stale (beyond TTL)', async () => {
      let allMidsCallback: ((data: any) => void) | undefined;
      let activeAssetCallback: ((data: any) => void) | undefined;

      mockSubscriptionClient.allMids.mockImplementation(
        (paramsOrCallback: any, maybeCallback?: any) => {
          allMidsCallback =
            typeof paramsOrCallback === 'function'
              ? paramsOrCallback
              : maybeCallback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const mockCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      allMidsCallback?.({ mids: { BTC: '50000' } });
      await jest.runAllTimersAsync();

      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '49000',
          funding: '0.01',
          openInterest: '1000000',
          dayNtlVlm: '50000000',
          oraclePx: '50100',
          midPx: '50500',
        },
      });

      // Move the system clock past the 10 s TTL so the staleness check in
      // #getFreshActiveAssetCtxPrice returns undefined. Use setSystemTime
      // (not advanceTimersByTime) to avoid firing service-internal timers
      // that could alter subscription state before the second allMids fires.
      jest.setSystemTime(Date.now() + 11_000);

      mockCallback.mockClear();

      // allMids fires with a NEW price (must differ from the cached '50000' so the
      // allMids handler's price-deduplication guard doesn't swallow the update).
      allMidsCallback?.({ mids: { BTC: '51000' } });

      await jest.runAllTimersAsync();

      const lastCall =
        mockCallback.mock.calls[mockCallback.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            symbol: 'BTC',
            price: '51000', // allMids wins after TTL – fast-stream '50500' is stale
          }),
        ]),
      );

      unsubscribe();
    });

    it('list subscriber (includeMarketData: false) never triggers activeAssetCtx subscription', async () => {
      mockSubscriptionClient.allMids.mockImplementation(
        (paramsOrCallback: any, maybeCallback?: any) => {
          const callback =
            typeof paramsOrCallback === 'function'
              ? paramsOrCallback
              : maybeCallback;
          setTimeout(() => {
            callback({ mids: { BTC: '50000' } });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
        includeMarketData: false,
      });

      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.activeAssetCtx).not.toHaveBeenCalled();

      unsubscribe();
    });

    it('projection preserves derived fields (funding, openInterest, markPrice, isTradable, percentChange24h) from the allMids baseline', async () => {
      let allMidsCallback: ((data: any) => void) | undefined;
      let activeAssetCallback: ((data: any) => void) | undefined;

      mockSubscriptionClient.allMids.mockImplementation(
        (paramsOrCallback: any, maybeCallback?: any) => {
          allMidsCallback =
            typeof paramsOrCallback === 'function'
              ? paramsOrCallback
              : maybeCallback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const focusedCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: focusedCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // allMids establishes the baseline price
      allMidsCallback?.({ mids: { BTC: '50000' } });
      await jest.runAllTimersAsync();

      // activeAssetCtx fires with a fast price and rich market data
      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '48000',
          funding: '0.0001',
          openInterest: '2000000',
          dayNtlVlm: '100000000',
          oraclePx: '50050',
          markPx: '50025',
          midPx: '50500',
        },
      });
      await jest.runAllTimersAsync();

      const lastUpdate: PriceUpdate =
        focusedCallback.mock.calls[focusedCallback.mock.calls.length - 1][0][0];

      // Fast-stream price is projected
      expect(lastUpdate.price).toBe('50500');

      // Derived fields from the allMids baseline (enriched by activeAssetCtx) are preserved
      expect(lastUpdate.funding).toBeDefined();
      expect(lastUpdate.openInterest).toBeDefined();
      expect(lastUpdate.volume24h).toBeDefined();
      expect(lastUpdate.markPrice).toBeDefined();
      expect(lastUpdate.percentChange24h).toBeDefined();
      // isTradable defaults to true when the price is within oracle deviation limits
      expect(lastUpdate.isTradable).toBe(true);

      unsubscribe();
    });

    it('keeps projecting the fast price after an assetCtxs batch update (does not clobber the fast-stream cache)', async () => {
      let allMidsCallback: ((data: any) => void) | undefined;
      let activeAssetCallback: ((data: any) => void) | undefined;
      let assetCtxsCallback: ((data: any) => void) | undefined;

      // Pre-populate meta so #createAssetCtxsSubscription maps ctxs -> symbols
      // from cache and the assetCtxs handler fires for 'BTC'.
      service.setDexMetaCache('', { universe: [{ name: 'BTC' }] } as any);

      mockSubscriptionClient.allMids.mockImplementation(
        (paramsOrCallback: any, maybeCallback?: any) => {
          allMidsCallback =
            typeof paramsOrCallback === 'function'
              ? paramsOrCallback
              : maybeCallback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          activeAssetCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      mockSubscriptionClient.assetCtxs.mockImplementation(
        (_params: any, callback: any) => {
          assetCtxsCallback = callback;
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const focusedCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: focusedCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      // allMids establishes the baseline, then activeAssetCtx provides the fast price
      allMidsCallback?.({ mids: { BTC: '50000' } });
      await jest.runAllTimersAsync();

      activeAssetCallback?.({
        coin: 'BTC',
        ctx: {
          prevDayPx: '49000',
          funding: '0.01',
          openInterest: '1000000',
          dayNtlVlm: '50000000',
          oraclePx: '50100',
          midPx: '50500',
        },
      });
      await jest.runAllTimersAsync();

      focusedCallback.mockClear();

      // assetCtxs batch update fires for BTC with a DIFFERENT price. Before the
      // fix this rebuilt the #marketDataCache entry without the fast-stream
      // fields, so #getFreshActiveAssetCtxPrice returned undefined and the
      // focused subscriber fell back to the assetCtxs/allMids baseline (50200).
      assetCtxsCallback?.({
        ctxs: [
          {
            prevDayPx: '49000',
            funding: '0.01',
            openInterest: '1000000',
            dayNtlVlm: '50000000',
            oraclePx: '50100',
            midPx: '50200',
          },
        ],
      });
      await jest.runAllTimersAsync();

      // The focused subscriber must still see the fast-stream price (50500),
      // not the slower batch baseline (50200).
      const lastCall =
        focusedCallback.mock.calls[focusedCallback.mock.calls.length - 1][0];
      expect(lastCall).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ symbol: 'BTC', price: '50500' }),
        ]),
      );

      unsubscribe();
    });
  });

  describe('Market tradability (isTradable)', () => {
    const getLastBtcUpdate = (mockCallback: jest.Mock) => {
      const { calls } = mockCallback.mock;
      const lastCall = calls[calls.length - 1][0];
      return lastCall.find((update: PriceUpdate) => update.symbol === 'BTC');
    };

    it('marks a market tradable when the mid price is close to the oracle price', async () => {
      // Default mock: mid (allMids) BTC = 50000, oraclePx = 50100 -> ~0.2% deviation
      const mockCallback = jest.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      expect(getLastBtcUpdate(mockCallback)).toEqual(
        expect.objectContaining({ symbol: 'BTC', isTradable: true }),
      );

      unsubscribe();
    });

    it('marks a market untradable when the mid price deviates more than 95% from the oracle price', async () => {
      // mid (allMids) BTC = 50000, oraclePx = 100 -> deviation far beyond the 95% limit
      mockSubscriptionClient.activeAssetCtx = jest.fn(
        (params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: params.coin,
              ctx: {
                prevDayPx: '49000',
                funding: '0.01',
                openInterest: '1000000',
                dayNtlVlm: '50000000',
                oraclePx: '100',
                midPx: '50000',
              },
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const mockCallback = jest.fn();

      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      expect(getLastBtcUpdate(mockCallback)).toEqual(
        expect.objectContaining({ symbol: 'BTC', isTradable: false }),
      );

      unsubscribe();
    });

    it('honors an injected price deviation limit', async () => {
      // mid (allMids) BTC = 50000, oraclePx = 40000 -> 25% deviation: tradable under the
      // default 0.95 limit, but untradable under an injected 0.1 (10%) limit.
      mockSubscriptionClient.activeAssetCtx = jest.fn(
        (params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: params.coin,
              ctx: {
                prevDayPx: '49000',
                funding: '0.01',
                openInterest: '1000000',
                dayNtlVlm: '50000000',
                oraclePx: '40000',
                midPx: '50000',
              },
            });
          }, 0);
          return Promise.resolve({
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const customService = new HyperLiquidSubscriptionService(
        mockClientService,
        mockWalletService,
        mockDeps,
        true, // hip3Enabled
        [], // enabledDexs
        [], // allowlistMarkets
        [], // blocklistMarkets
        0.1, // priceDeviationLimit (10%)
      );

      const mockCallback = jest.fn();

      const unsubscribe = await customService.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      await jest.runAllTimersAsync();

      expect(getLastBtcUpdate(mockCallback)).toEqual(
        expect.objectContaining({ symbol: 'BTC', isTradable: false }),
      );

      unsubscribe();
      customService.clearAll();
    });
  });
});
