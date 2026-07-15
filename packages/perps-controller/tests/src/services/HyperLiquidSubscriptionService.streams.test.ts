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
  describe('Price Subscriptions', () => {
    it('should subscribe to price updates successfully', async () => {
      const mockCallback = jest.fn();
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
      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle subscription client not available', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = jest.fn();
      const params: SubscribePricesParams = {
        symbols: ['BTC'],
        callback: mockCallback,
      };

      const unsubscribe = await service.subscribeToPrices(params);

      expect(typeof unsubscribe).toBe('function');
      expect(mockSubscriptionClient.allMids).not.toHaveBeenCalled();
    });

    it('should send cached price data immediately', async () => {
      const mockCallback = jest.fn();

      // First subscription to populate cache
      const firstUnsubscribe = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: jest.fn(),
      });

      // Advance timers for cache to populate
      await jest.runAllTimersAsync();

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
      const mockCallback1 = jest.fn();
      const mockCallback2 = jest.fn();

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
      const listCallback = jest.fn();
      const focusedCallback = jest.fn();

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
      await jest.runAllTimersAsync();

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
      const btcCallback = jest.fn();
      const ethCallback = jest.fn();

      const unsubscribeBtc = await service.subscribeToPrices({
        symbols: ['BTC'],
        callback: btcCallback,
      });
      const unsubscribeEth = await service.subscribeToPrices({
        symbols: ['ETH'],
        callback: ethCallback,
      });

      // Let the initial allMids snapshot settle
      await jest.runAllTimersAsync();

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
  });

  describe('Position Subscriptions', () => {
    it('should subscribe to position updates successfully', async () => {
      const mockCallback = jest.fn();
      const params: SubscribePositionsParams = {
        accountId: 'eip155:42161:0x123' as CaipAccountId,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToPositions(params);

      // Wait for async operations (individual subscription setup for HIP-3 mode)
      // Need to flush both timers and microtask queue since subscription uses fire-and-forget promises
      await jest.runAllTimersAsync();
      // Flush microtask queue to allow promise chains to complete
      await Promise.resolve();
      await jest.runAllTimersAsync();

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

      const mockCallback = jest.fn();
      const params: SubscribePositionsParams = {
        accountId: 'eip155:42161:0x123' as CaipAccountId,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToPositions(params);

      // Wait for async operations
      await jest.runAllTimersAsync();

      // Should not call any subscriptions when wallet service fails
      expect(mockSubscriptionClient.clearinghouseState).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.openOrders).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.webData3).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle subscription client not available', async () => {
      mockClientService.getSubscriptionClient.mockReturnValue(undefined);

      const mockCallback = jest.fn();
      const params: SubscribePositionsParams = {
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToPositions(params);

      // Wait for async operations
      await jest.runAllTimersAsync();

      expect(typeof unsubscribe).toBe('function');
      // Should not call any subscriptions when client not available
      expect(mockSubscriptionClient.clearinghouseState).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.openOrders).not.toHaveBeenCalled();
      expect(mockSubscriptionClient.webData3).not.toHaveBeenCalled();
    });

    it('should filter out zero-size positions', async () => {
      const mockCallback = jest.fn();

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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: mockCallback,
      });

      // Wait for async operations
      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ size: '0.1' })]),
      );

      unsubscribe();
    });
  });

  describe('Order Fill Subscriptions', () => {
    it('should subscribe to order fill updates successfully', async () => {
      const mockCallback = jest.fn();
      const params: SubscribeOrderFillsParams = {
        accountId: 'eip155:42161:0x123' as CaipAccountId,
        callback: mockCallback,
      };

      const unsubscribe = service.subscribeToOrderFills(params);

      expect(mockWalletService.getUserAddressWithDefault).toHaveBeenCalledWith(
        params.accountId,
      );

      // Wait for async operations
      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.userFills).toHaveBeenCalledWith(
        { user: '0x123' },
        expect.any(Function),
      );
      expect(mockCallback).toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should transform order fill data correctly', async () => {
      const mockCallback = jest.fn();

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      // Wait for async operations
      await jest.runAllTimersAsync();

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

      const mockCallback = jest.fn();
      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      // Wait for async operations
      await jest.runAllTimersAsync();

      expect(mockSubscriptionClient.userFills).not.toHaveBeenCalled();
      expect(typeof unsubscribe).toBe('function');
    });

    it('should handle order fills with liquidation data', async () => {
      const mockCallback = jest.fn();

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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

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

    it('enriches WS fills with detailedOrderType from cached orders', async () => {
      // Arrange — subscribe to orders first so #cachedOrders gets populated
      const orderCallback = jest.fn();
      service.subscribeToOrders({ callback: orderCallback });
      await jest.runAllTimersAsync();

      // Now subscribe to fills — the callback should enrich with cached order types
      const fillCallback = jest.fn();
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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      // Act
      const unsubscribe = service.subscribeToOrderFills({
        callback: fillCallback,
      });
      await jest.runAllTimersAsync();

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
      const mockCallback = jest.fn();

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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToOrderFills({
        callback: mockCallback,
      });

      await jest.runAllTimersAsync();

      expect(mockCallback).toHaveBeenCalledWith(
        expect.any(Array),
        true, // isSnapshot should be passed through
      );

      unsubscribe();
    });
  });

  describe('Shared WebData3 Subscription', () => {
    it('should share webData3 subscription between positions and orders', async () => {
      const positionCallback = jest.fn();
      const orderCallback = jest.fn();

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
      await jest.runAllTimersAsync();

      // Verify position callback was called
      expect(positionCallback).toHaveBeenCalled();

      // Subscribe to orders - should reuse same webData3 subscription
      // and immediately get cached data
      const unsubscribeOrders = service.subscribeToOrders({
        callback: orderCallback,
      });

      // Orders should get cached data immediately (synchronously)
      // or after the second webData3 update with changed data
      await jest.runAllTimersAsync();

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
      const positionCallback1 = jest.fn();
      const positionCallback2 = jest.fn();

      // Subscribe two position callbacks
      const unsubscribe1 = service.subscribeToPositions({
        callback: positionCallback1,
      });

      const unsubscribe2 = service.subscribeToPositions({
        callback: positionCallback2,
      });

      await jest.runAllTimersAsync();

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
      const positionCallback = jest.fn();

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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
          });
        },
      );

      const unsubscribe = service.subscribeToPositions({
        callback: positionCallback,
      });

      await jest.runAllTimersAsync();

      // Should receive cached data on new subscription
      const newCallback = jest.fn();
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
      const positionCallback = jest.fn();
      const orderCallback = jest.fn();
      const accountCallback = jest.fn();
      const oiCapCallback = jest.fn();

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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
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
            unsubscribe: jest.fn().mockResolvedValue(undefined),
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

      await jest.runAllTimersAsync();

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
});
