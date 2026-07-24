/* eslint-disable */
/**
 * Unit tests for HyperLiquidSubscriptionService
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import type { CaipAccountId, Hex } from '@metamask/utils';

import { ABSTRACTION_MODE_REFRESH_THROTTLE_MS } from '../../../src/constants/perpsConfig.js';
import type { HyperLiquidClientService } from '../../../src/services/HyperLiquidClientService.js';
import { HyperLiquidSubscriptionService } from '../../../src/services/HyperLiquidSubscriptionService.js';
import type { HyperLiquidWalletService } from '../../../src/services/HyperLiquidWalletService.js';
import type {
  SubscribeOrderBookParams,
  SubscribeOrderFillsParams,
  SubscribePositionsParams,
  SubscribePricesParams,
} from '../../../src/types/index.js';
import {
  adaptAccountStateFromSDK,
  parseAssetName,
} from '../../../src/utils/hyperLiquidAdapter.js';
import { createMockInfrastructure } from '../../helpers/serviceMocks.js';

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
      fastAssetCtxs: jest.fn((_callback: any) =>
        Promise.resolve(mockSubscription),
      ),
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
  describe('Subscription Lifecycle', () => {
    it('should unsubscribe from position updates successfully', async () => {
      const mockCallback = jest.fn();
      const mockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      mockSubscriptionClient.webData3.mockResolvedValue(mockSubscription);

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for subscription to be established
      await jest.runAllTimersAsync();

      // Unsubscribe
      unsubscribe();

      // Wait for unsubscribe to complete
      await jest.runAllTimersAsync();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it('should unsubscribe from order fill updates successfully', async () => {
      const mockCallback = jest.fn();
      const mockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      mockSubscriptionClient.userFills.mockResolvedValue(mockSubscription);

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      // Wait for subscription to be established
      await jest.runAllTimersAsync();

      // Unsubscribe
      unsubscribe();

      // Wait for unsubscribe to complete
      await jest.runAllTimersAsync();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });

    it('should handle unsubscribe errors gracefully', async () => {
      const mockCallback = jest.fn();
      const mockSubscription = {
        unsubscribe: jest
          .fn()
          .mockRejectedValue(new Error('Unsubscribe failed')),
      };

      mockSubscriptionClient.webData3.mockResolvedValue(mockSubscription);

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for subscription to be established
      await jest.runAllTimersAsync();

      // Unsubscribe should not throw
      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe('Cache Management', () => {
    it('should create price updates with 24h change calculation', async () => {
      const mockCallback = jest.fn();

      // First subscription to populate cache
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true, // Enable market data to get percentChange24h
      });

      // Wait for cache to populate
      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          price: expect.any(String),
          timestamp: expect.any(Number),
          percentChange24h: expect.any(String),
        }),
      ]);

      unsubscribe();
    });

    it('should maintain separate caches for market data', async () => {
      const mockCallback = jest.fn();

      // Mock activeAssetCtx with market data
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
              },
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
      });

      // Wait for cache updates
      await jest.runAllTimersAsync();

      // Verify market data is processed
      expect(mockCallback).toHaveBeenCalled();

      unsubscribe();
    });
  });

  describe('Cleanup and Error Handling', () => {
    it('should clear all subscriptions and cache', async () => {
      service.clearAll();

      // Verify cache is cleared by trying to subscribe
      const mockCallback = jest.fn();
      await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
      });

      // Should not have cached data
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle subscription errors gracefully', async () => {
      mockSubscriptionClient.allMids.mockRejectedValue(
        new Error('Subscription failed'),
      );

      const mockCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
      });

      // Should not throw
      expect(typeof unsubscribe).toBe('function');
    });

    it('retries the fastAssetCtxs subscription on a transient SDK error and succeeds (TAT-3387)', async () => {
      const mockUnsubscribe = jest.fn().mockResolvedValue(undefined);
      const transientError = new Error(
        'Unknown error while making a WebSocket request',
      );
      transientError.name = 'WebSocketRequestError';

      // First attempt fails with a transient error; second attempt succeeds
      mockSubscriptionClient.fastAssetCtxs
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ unsubscribe: mockUnsubscribe });

      const mockCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
      });

      // Let the first attempt fail and the 500ms backoff elapse
      await jest.advanceTimersByTimeAsync(500);
      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.fastAssetCtxs).toHaveBeenCalledTimes(2);

      unsubscribe();
    });

    it('does not retry the fastAssetCtxs subscription on a non-transient error', async () => {
      mockSubscriptionClient.fastAssetCtxs.mockRejectedValue(
        new Error('Non-transient failure'),
      );

      const mockCallback = jest.fn();
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      // Non-transient errors should not be retried (single attempt only)
      expect(mockSubscriptionClient.fastAssetCtxs).toHaveBeenCalledTimes(1);
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle missing subscription client in position subscription', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = jest.fn();
      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for async operations
      await jest.runAllTimersAsync();

      expect(typeof unsubscribe).toBe('function');
      expect(mockSubscriptionClient.webData3).not.toHaveBeenCalled();
    });

    it('should handle missing subscription client in order fill subscription', () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = jest.fn();
      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      expect(typeof unsubscribe).toBe('function');
      expect(
        mockWalletService.getUserAddressWithDefault,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Data Transformation', () => {
    it('should handle both perps and spot context types', async () => {
      const mockCallback = jest.fn();

      // Mock spot context (without perps-specific fields)
      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: params.coin,
              ctx: {
                prevDayPx: '49000',
                dayNtlVlm: '50000000',
                // No funding, openInterest, oraclePx (spot context)
              },
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
      });

      // Wait for processing
      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();

      unsubscribe();
    });

    it('should handle missing position data gracefully', async () => {
      const mockCallback = jest.fn();

      // HIP-3 mode uses individual subscriptions
      // Mock clearinghouseState with no position data
      mockSubscriptionClient.clearinghouseState.mockImplementation(
        (_params: any, callback: any) => {
          setTimeout(() => {
            callback({
              dex: _params.dex || '',
              clearinghouseState: {
                assetPositions: [], // Empty array instead of undefined
                marginSummary: { accountValue: '10000', totalMarginUsed: '0' },
                withdrawable: '10000',
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
              orders: [], // Empty orders
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

      // Wait for processing
      await jest.runAllTimersAsync();

      // Should call callback with empty positions to fix loading state
      // This ensures the UI can transition from loading to empty state for new users without cached positions
      expect(mockCallback).toHaveBeenCalledWith([]);

      unsubscribe();
    });
  });

  describe('Market Data Subscription Control', () => {
    it('should not include market data when includeMarketData is false', async () => {
      const mockCallback = jest.fn();

      // Subscribe without market data
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: false,
      });

      // Ensure activeAssetCtx is NOT called
      expect(mockSubscriptionClient.activeAssetCtx).not.toHaveBeenCalled();

      // Wait for allMids data
      await jest.runAllTimersAsync();

      // Check that market data fields are undefined
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          price: expect.any(String),
          timestamp: expect.any(Number),
          funding: undefined,
          openInterest: undefined,
          volume24h: undefined,
        }),
      ]);

      unsubscribe();
    });

    it('should include market data when includeMarketData is true', async () => {
      const mockCallback = jest.fn();
      const mockSubscription = {
        unsubscribe: jest.fn().mockResolvedValue(undefined),
      };

      // Mock activeAssetCtx with market data
      mockSubscriptionClient.activeAssetCtx.mockImplementation(
        (params: any, callback: any) => {
          setTimeout(() => {
            callback({
              coin: params.coin,
              ctx: {
                prevDayPx: 45000,
                funding: 0.0001,
                openInterest: 1000000, // Raw token units from API
                dayNtlVlm: 5000000,
                oraclePx: 50100,
                midPx: 50000, // Price used for openInterest USD conversion: 1M tokens * $50K = $50B
              },
            });
          }, 10);
          return Promise.resolve(mockSubscription);
        },
      );

      // Subscribe with market data
      const unsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: mockCallback,
        includeMarketData: true,
      });

      // Ensure activeAssetCtx is called
      expect(mockSubscriptionClient.activeAssetCtx).toHaveBeenCalledWith(
        { coin: 'BTC' },
        expect.any(Function),
      );

      // Wait for data
      await jest.runAllTimersAsync();

      // Check that market data fields are included
      expect(mockCallback).toHaveBeenCalledWith([
        expect.objectContaining({
          symbol: 'BTC',
          price: expect.any(String),
          timestamp: expect.any(Number),
          funding: 0.0001,
          openInterest: 50000000000, // 1M tokens * $50K price = $50B
          volume24h: 5000000,
        }),
      ]);

      unsubscribe();
    });
  });
});
