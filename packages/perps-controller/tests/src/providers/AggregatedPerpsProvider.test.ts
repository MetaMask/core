import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Mock, Mocked, MockedFunction } from 'vitest';

import { CandlePeriod } from '../../../src/constants/chartConfig.js';
import {
  PERPS_CONSTANTS,
  PROVIDER_CONFIG,
} from '../../../src/constants/perpsConfig.js';
import { PERPS_ERROR_CODES } from '../../../src/perpsErrorCodes.js';
import { AggregatedPerpsProvider } from '../../../src/providers/AggregatedPerpsProvider.js';
import type {
  PerpsProvider,
  PerpsProviderType,
  AccountState,
  OrderParams,
  Position,
  MarketInfo,
  Order,
  ChaseOrder,
  TwapOrder,
  FeeCalculationParams,
  ReconcileChaseOrderCancellationParams,
  ReconcileChaseOrderCancellationResult,
  CancelOrdersResult,
  CancelOrderParams,
} from '../../../src/types/index.js';
import { WebSocketConnectionState } from '../../../src/types/index.js';
import { STRATEGY_ORDER_TYPES } from '../../../src/utils/orderTypes.js';
/* eslint-disable */
import {
  createDeferred,
  createMockInfrastructure,
} from '../../helpers/serviceMocks.js';

type MockPerpsProvider = Mocked<PerpsProvider> & {
  getAccountSupport: MockedFunction<
    NonNullable<PerpsProvider['getAccountSupport']>
  >;
  cancelOrders: MockedFunction<NonNullable<PerpsProvider['cancelOrders']>>;
  closePositions: MockedFunction<NonNullable<PerpsProvider['closePositions']>>;
};

// Create a comprehensive mock provider
const createMockProvider = (
  providerId: PerpsProviderType,
): MockPerpsProvider => {
  const mockProvider: MockPerpsProvider = {
    protocolId: providerId,

    // Asset routes
    getDepositRoutes: vi.fn().mockReturnValue([]),
    getWithdrawalRoutes: vi.fn().mockReturnValue([]),
    getOrderCapabilities: vi.fn().mockResolvedValue({
      status: 'ready',
      providerId,
      supportedStrategies: [],
    }),
    getScalePriceLadder: vi.fn().mockResolvedValue({
      status: 'ready',
      providerId,
      prices: ['100', '150', '200'],
    }),

    // Read operations
    getAccountSupport: vi.fn().mockResolvedValue({ isSupported: true }),
    getPositions: vi.fn().mockResolvedValue([]),
    getAccountState: vi.fn().mockResolvedValue({
      spendableBalance: '10000',
      withdrawableBalance: '10000',
      totalBalance: '10000',
      marginUsed: '0',
      unrealizedPnl: '0',
      returnOnEquity: '0',
    }),
    getMarkets: vi.fn().mockResolvedValue([]),
    getMarketDataWithPrices: vi.fn().mockResolvedValue([]),
    getOrderFills: vi.fn().mockResolvedValue([]),
    getOrFetchFills: vi.fn().mockResolvedValue([]),
    getOrders: vi.fn().mockResolvedValue([]),
    getOpenOrders: vi.fn().mockResolvedValue([]),
    getFunding: vi.fn().mockResolvedValue([]),
    getHistoricalPortfolio: vi.fn().mockResolvedValue({
      accountValue1dAgo: '10000',
      timestamp: Date.now(),
    }),
    getUserNonFundingLedgerUpdates: vi.fn().mockResolvedValue([]),
    getUserHistory: vi.fn().mockResolvedValue([]),
    getTwapOrders: vi.fn().mockResolvedValue([]),
    getChaseOrders: vi.fn().mockResolvedValue([]),
    suspendChaseOrders: vi.fn().mockResolvedValue([]),
    getCurrentAccountId: vi
      .fn()
      .mockResolvedValue(
        `eip155:1:0x${providerId.padStart(40, '0').slice(0, 40)}`,
      ),

    // Write operations
    placeOrder: vi
      .fn()
      .mockResolvedValue({ success: true, orderId: 'order-123' }),
    editOrder: vi
      .fn()
      .mockResolvedValue({ success: true, orderId: 'order-123' }),
    cancelOrder: vi.fn().mockResolvedValue({ success: true }),
    cancelOrders: vi.fn().mockResolvedValue({
      success: true,
      successCount: 1,
      failureCount: 0,
      results: [],
    }),
    closePosition: vi.fn().mockResolvedValue({ success: true }),
    closePositions: vi.fn().mockResolvedValue({
      success: true,
      successCount: 1,
      failureCount: 0,
      results: [],
    }),
    updatePositionTPSL: vi.fn().mockResolvedValue({ success: true }),
    updateMargin: vi.fn().mockResolvedValue({ success: true }),
    withdraw: vi.fn().mockResolvedValue({ success: true }),

    // Validation
    validateDeposit: vi.fn().mockResolvedValue({ isValid: true }),
    validateOrder: vi.fn().mockResolvedValue({ isValid: true }),
    validateClosePosition: vi.fn().mockResolvedValue({ isValid: true }),
    validateWithdrawal: vi.fn().mockResolvedValue({ isValid: true }),

    // Calculations
    calculateLiquidationPrice: vi.fn().mockResolvedValue('45000'),
    calculateMaintenanceMargin: vi.fn().mockResolvedValue(0.05),
    getMaxLeverage: vi.fn().mockResolvedValue(50),
    calculateFees: vi.fn().mockResolvedValue({ feeRate: 0.001 }),
    previewPositionModify: vi.fn().mockResolvedValue({ status: 'none' }),

    // Subscriptions
    subscribeToPrices: vi.fn().mockReturnValue(() => undefined),
    subscribeToPositions: vi.fn().mockReturnValue(() => undefined),
    subscribeToOrderFills: vi.fn().mockReturnValue(() => undefined),
    subscribeToOrders: vi.fn().mockReturnValue(() => undefined),
    subscribeToAccount: vi.fn().mockReturnValue(() => undefined),
    subscribeToOICaps: vi.fn().mockReturnValue(() => undefined),
    subscribeToCandles: vi.fn().mockReturnValue(() => undefined),
    subscribeToOrderBook: vi.fn().mockReturnValue(() => undefined),

    // Configuration
    setLiveDataConfig: vi.fn(),
    setUserFeeDiscount: vi.fn(),
    setUserFeeResolution: vi.fn(),
    approveSubscriptionBuilderFee: vi.fn().mockResolvedValue(true),

    // Lifecycle
    toggleTestnet: vi
      .fn()
      .mockResolvedValue({ success: true, isTestnet: false }),
    initialize: vi.fn().mockResolvedValue({ success: true }),
    isReadyToTrade: vi.fn().mockResolvedValue({ ready: true }),
    disconnect: vi.fn().mockResolvedValue({ success: true }),
    ping: vi.fn().mockResolvedValue(undefined),

    // Block explorer
    getBlockExplorerUrl: vi.fn().mockReturnValue('https://explorer.example'),

    // HIP-3
    getAvailableDexs: vi.fn().mockResolvedValue([]),
  };

  return mockProvider;
};

// Helper to create mock position
const createMockPosition = (symbol: string, size: string): Position =>
  ({
    symbol,
    size,
    entryPrice: '50000',
    positionValue: '5000',
    unrealizedPnl: '100',
    marginUsed: '500',
    leverage: { type: 'cross', value: 10 },
    liquidationPrice: '45000',
    maxLeverage: 50,
    returnOnEquity: '2%',
    cumulativeFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
    takeProfitCount: 0,
    stopLossCount: 0,
  }) as Position;

// Helper to create mock market
const createMockMarket = (name: string): MarketInfo =>
  ({
    name,
    szDecimals: 3,
    maxLeverage: 50,
    marginTableId: 0,
  }) as MarketInfo;

// Helper to create mock order
const createMockOrder = (orderId: string, symbol: string): Order =>
  ({
    orderId,
    symbol,
    side: 'buy',
    orderType: 'limit',
    size: '0.1',
    originalSize: '0.1',
    price: '50000',
    filledSize: '0',
    remainingSize: '0.1',
    status: 'open',
    timestamp: Date.now(),
  }) as Order;

describe('AggregatedPerpsProvider', () => {
  let aggregatedProvider: AggregatedPerpsProvider;
  let routedProvider: PerpsProvider;
  let mockHLProvider: ReturnType<typeof createMockProvider>;
  let mockLighterProvider: ReturnType<typeof createMockProvider>;
  let mockInfrastructure: ReturnType<typeof createMockInfrastructure>;

  beforeEach(() => {
    mockHLProvider = createMockProvider('hyperliquid');
    mockLighterProvider = createMockProvider('lighter');
    mockInfrastructure = createMockInfrastructure();

    aggregatedProvider = new AggregatedPerpsProvider({
      providers: new Map([
        ['hyperliquid', mockHLProvider],
        ['lighter', mockLighterProvider],
      ]),
      defaultProvider: 'hyperliquid',
      infrastructure: mockInfrastructure,
    });
    routedProvider = aggregatedProvider;
  });

  it('lists optional Scale inventory and reviews only the explicit owning provider', async () => {
    const groups = [
      {
        groupId: 'opaque-scale',
        symbol: 'BTC',
        state: 'unknown',
        accountIndex: 28,
        apiKeyIndex: 7,
        walletAddress: '0xabc',
        network: 'testnet',
        providerId: 'lighter',
      },
    ];
    const reviewScaleOrderGroups = vi.fn().mockResolvedValue(groups);
    Object.assign(mockLighterProvider, {
      getScaleOrderGroups: vi.fn().mockResolvedValue(groups),
      reviewScaleOrderGroups,
    });
    expect(await aggregatedProvider.getScaleOrderGroups()).toEqual(groups);
    await expect(aggregatedProvider.reviewScaleOrderGroups()).rejects.toThrow(
      PERPS_ERROR_CODES.PROVIDER_NOT_FOUND,
    );
    await expect(
      aggregatedProvider.reviewScaleOrderGroups({ providerId: 'hyperliquid' }),
    ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_AVAILABLE);
    expect(reviewScaleOrderGroups).not.toHaveBeenCalled();
    expect(
      await aggregatedProvider.reviewScaleOrderGroups({
        providerId: 'lighter',
      }),
    ).toEqual(groups);
    expect(reviewScaleOrderGroups).toHaveBeenCalledTimes(1);
  });

  describe('durable-settlement surfacing', () => {
    it.each(['getAttachedOrderGroups', 'reviewAttachedOrderGroups'] as const)(
      'routes attached %s to the implementing provider and retains its identity',
      async (method) => {
        const group = {
          groupId: 'group',
          providerId: 'hyperliquid',
          symbol: 'BTC',
          submission: 'unknown',
          parentClientOrderId: '101',
          childClientOrderIds: ['102'],
          cancellation: 'explicit-exact-owned-orders',
        };
        const read = vi.fn().mockResolvedValue([group]);
        const provider = new AggregatedPerpsProvider({
          providers: new Map([
            ['hyperliquid', mockHLProvider],
            ['lighter', { ...mockLighterProvider, [method]: read }],
          ]),
          defaultProvider: 'hyperliquid',
          infrastructure: mockInfrastructure,
        });
        expect(await provider[method]()).toStrictEqual([
          { ...group, providerId: 'lighter' },
        ]);
        expect(read).toHaveBeenCalledTimes(1);
      },
    );

    it('routes strict review and selected protection to only the explicit owner', async () => {
      const review = {
        status: 'ready' as const,
        providerId: 'lighter' as const,
        walletAddress: '0xabc',
        network: 'testnet',
        accountIndex: 28,
        positions: [],
        orders: [],
        reviewedAt: 5,
      };
      const reviewRecoveryVenue = vi.fn().mockResolvedValue(review);
      const resolveRecoveryProtection = vi.fn().mockResolvedValue({
        status: 'settled',
        providerId: 'lighter',
        success: true,
      });
      const provider = new AggregatedPerpsProvider({
        providers: new Map([
          ['hyperliquid', mockHLProvider],
          [
            'lighter',
            {
              ...mockLighterProvider,
              reviewRecoveryVenue,
              resolveRecoveryProtection,
            },
          ],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });
      expect(
        await provider.reviewRecoveryVenue({ providerId: 'lighter' }),
      ).toStrictEqual(review);
      expect(
        await provider.resolveRecoveryProtection({
          providerId: 'lighter',
          recoveryId: 'opaque',
          symbol: 'BTC',
          stopLossPrice: '1',
        }),
      ).toMatchObject({ status: 'settled', success: true });
      expect(reviewRecoveryVenue).toHaveBeenCalledTimes(1);
      expect(resolveRecoveryProtection).toHaveBeenCalledWith({
        providerId: 'lighter',
        recoveryId: 'opaque',
        symbol: 'BTC',
        stopLossPrice: '1',
      });
      expect(
        await provider.reviewRecoveryVenue({ providerId: 'hyperliquid' }),
      ).toMatchObject({ status: 'unsupported', providerId: 'hyperliquid' });
      expect(
        await provider.resolveRecoveryProtection({
          providerId: 'hyperliquid',
          recoveryId: 'opaque',
          symbol: 'BTC',
        }),
      ).toMatchObject({ status: 'unsupported', success: false });
      await expect(provider.reviewRecoveryVenue()).rejects.toThrow(
        /explicit provider/u,
      );
      await expect(
        provider.resolveRecoveryProtection({
          recoveryId: 'opaque',
          symbol: 'BTC',
        }),
      ).rejects.toThrow(/explicit provider/u);
      expect(mockHLProvider.getPositions).not.toHaveBeenCalled();
      expect(mockHLProvider.getOpenOrders).not.toHaveBeenCalled();
    });

    const pending = {
      symbol: 'BTC',
      settlementKey: '0xabc:28:7:BTC',
      recordedAt: 5,
      reason: 'why',
      priorIntent: 'replace' as const,
      survivingOrderIds: ['9'],
      actionNeeded: 'set a new TP/SL',
    };
    const outcome = {
      recoveryId: '42:abcd',
      kind: 13,
      intent: 'withdraw:25',
      txHash: 'abcd',
      outcome: 'succeeded' as const,
      evidence: 'tx-status:3',
    };

    it('returns only Lighter rows when HyperLiquid has no recovery capabilities', async () => {
      const reconcile = vi.fn().mockResolvedValue([outcome]);
      const listing = vi
        .fn()
        .mockResolvedValue([{ ...outcome, recoveryId: 'old' }]);
      expect(mockHLProvider.reconcileRecoveredDispatches).toBeUndefined();
      expect(mockHLProvider.getRecoveredDispatches).toBeUndefined();
      const aggregated = new AggregatedPerpsProvider({
        providers: new Map([
          ['hyperliquid', mockHLProvider],
          [
            'lighter',
            {
              ...mockLighterProvider,
              getRecoveredDispatches: listing,
              reconcileRecoveredDispatches: reconcile,
            },
          ],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });

      expect(await aggregated.reconcileRecoveredDispatches()).toStrictEqual([
        { ...outcome, providerId: 'lighter' },
      ]);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(listing).not.toHaveBeenCalled();
    });

    it('reconciles all providers with listing fallback and propagates failures', async () => {
      const reconcile = vi.fn().mockResolvedValue([outcome]);
      const listing = vi
        .fn()
        .mockResolvedValue([{ ...outcome, recoveryId: 'other' }]);
      const aggregated = new AggregatedPerpsProvider({
        providers: new Map([
          [
            'hyperliquid',
            { ...mockHLProvider, getRecoveredDispatches: listing },
          ],
          [
            'lighter',
            { ...mockLighterProvider, reconcileRecoveredDispatches: reconcile },
          ],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });
      expect(await aggregated.reconcileRecoveredDispatches()).toStrictEqual([
        { ...outcome, recoveryId: 'other', providerId: 'hyperliquid' },
        { ...outcome, providerId: 'lighter' },
      ]);
      expect(listing).toHaveBeenCalledTimes(1);
      expect(reconcile).toHaveBeenCalledTimes(1);
      reconcile.mockRejectedValueOnce(new Error('recovery failed'));
      await expect(aggregated.reconcileRecoveredDispatches()).rejects.toThrow(
        'recovery failed',
      );
    });

    it('aggregates recoveries and outcomes from providers implementing the contract', async () => {
      const durable = {
        ...mockLighterProvider,
        getPendingManualRecoveries: vi.fn().mockResolvedValue([pending]),
        getRecoveredDispatches: vi.fn().mockResolvedValue([outcome]),
        acknowledgeRecoveredDispatch: vi.fn().mockResolvedValue(undefined),
      } as unknown as PerpsProvider;
      const aggregated = new AggregatedPerpsProvider({
        providers: new Map([
          ['hyperliquid', mockHLProvider],
          ['lighter', durable],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });
      // The non-durable provider contributes empty lists, never an error.
      expect(await aggregated.getPendingManualRecoveries()).toStrictEqual([
        { ...pending, providerId: 'lighter' },
      ]);
      expect(await aggregated.getRecoveredDispatches()).toStrictEqual([
        { ...outcome, providerId: 'lighter' },
      ]);
      await aggregated.acknowledgeRecoveredDispatch('42:abcd');
      expect(
        (durable as unknown as { acknowledgeRecoveredDispatch: Mock })
          .acknowledgeRecoveredDispatch,
      ).toHaveBeenCalledWith('42:abcd');
    });

    it('propagates storage errors and unknown-id refusals instead of hiding them', async () => {
      const durable = {
        ...mockLighterProvider,
        getPendingManualRecoveries: vi
          .fn()
          .mockRejectedValue(new Error('manual-recovery index is corrupt')),
        getRecoveredDispatches: vi.fn().mockResolvedValue([]),
        acknowledgeRecoveredDispatch: vi
          .fn()
          .mockRejectedValue(new Error('No pending recovered')),
      } as unknown as PerpsProvider;
      const aggregated = new AggregatedPerpsProvider({
        providers: new Map([
          ['hyperliquid', mockHLProvider],
          ['lighter', durable],
        ]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });
      await expect(aggregated.getPendingManualRecoveries()).rejects.toThrow(
        'corrupt',
      );
      await expect(
        aggregated.acknowledgeRecoveredDispatch('42:zzzz'),
      ).rejects.toThrow('No pending recovered');
    });

    it('acknowledgment throws when no provider implements the contract', async () => {
      await expect(
        aggregatedProvider.acknowledgeRecoveredDispatch('42:abcd'),
      ).rejects.toThrow('No perps provider has recovered dispatches');
    });
  });

  describe('constructor', () => {
    it('initializes with provided providers', () => {
      expect(aggregatedProvider.getProviderIds()).toContain('hyperliquid');
      expect(aggregatedProvider.getProviderIds()).toContain('lighter');
    });

    it('has protocolId set to "aggregated"', () => {
      expect(aggregatedProvider.protocolId).toBe('aggregated');
    });
  });

  describe('Read Operations - getPositions', () => {
    it('aggregates positions from all providers', async () => {
      mockHLProvider.getPositions.mockResolvedValue([
        createMockPosition('BTC', '0.1'),
      ]);
      mockLighterProvider.getPositions.mockResolvedValue([
        createMockPosition('ETH', '1.0'),
      ]);

      const positions = await aggregatedProvider.getPositions();

      expect(positions).toHaveLength(2);
      expect(positions).toContainEqual(
        expect.objectContaining({ symbol: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(positions).toContainEqual(
        expect.objectContaining({ symbol: 'ETH', providerId: 'lighter' }),
      );
    });

    it('injects providerId into each position', async () => {
      mockHLProvider.getPositions.mockResolvedValue([
        createMockPosition('BTC', '0.1'),
      ]);

      const positions = await aggregatedProvider.getPositions();

      expect(positions[0].providerId).toBe('hyperliquid');
    });

    it('handles partial failures gracefully', async () => {
      mockHLProvider.getPositions.mockResolvedValue([
        createMockPosition('BTC', '0.1'),
      ]);
      mockLighterProvider.getPositions.mockRejectedValue(
        new Error('Provider unavailable'),
      );

      const positions = await aggregatedProvider.getPositions();

      // Should still return positions from successful provider
      expect(positions).toHaveLength(1);
      expect(positions[0].providerId).toBe('hyperliquid');
    });

    it('returns empty array when all providers fail', async () => {
      mockHLProvider.getPositions.mockRejectedValue(new Error('Error 1'));
      mockLighterProvider.getPositions.mockRejectedValue(new Error('Error 2'));

      const positions = await aggregatedProvider.getPositions();

      expect(positions).toEqual([]);
    });
  });

  describe('Read Operations - getMarkets', () => {
    it('aggregates markets from all providers', async () => {
      mockHLProvider.getMarkets.mockResolvedValue([createMockMarket('BTC')]);
      mockLighterProvider.getMarkets.mockResolvedValue([
        createMockMarket('ETH'),
      ]);

      const markets = await aggregatedProvider.getMarkets();

      expect(markets).toHaveLength(2);
      expect(markets).toContainEqual(
        expect.objectContaining({ name: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(markets).toContainEqual(
        expect.objectContaining({ name: 'ETH', providerId: 'lighter' }),
      );
    });

    it('keeps same market from different providers', async () => {
      mockHLProvider.getMarkets.mockResolvedValue([createMockMarket('BTC')]);
      mockLighterProvider.getMarkets.mockResolvedValue([
        createMockMarket('BTC'),
      ]);

      const markets = await aggregatedProvider.getMarkets();

      // Both should be kept since they have different providerIds
      expect(markets).toHaveLength(2);
    });
  });

  describe('Read Operations - getOrders', () => {
    it('aggregates orders from all providers', async () => {
      mockHLProvider.getOrders.mockResolvedValue([
        createMockOrder('hl-order', 'BTC'),
      ]);
      mockLighterProvider.getOrders.mockResolvedValue([
        createMockOrder('lighter-order', 'ETH'),
      ]);

      const orders = await aggregatedProvider.getOrders();

      expect(orders).toHaveLength(2);
      expect(orders).toContainEqual(
        expect.objectContaining({
          orderId: 'hl-order',
          providerId: 'hyperliquid',
        }),
      );
      expect(orders).toContainEqual(
        expect.objectContaining({
          orderId: 'lighter-order',
          providerId: 'lighter',
        }),
      );
    });
  });

  describe('Read Operations - getAccountState', () => {
    // Worked fixture from the implementation spec. Expected aggregates are
    // independent literals, not recomputed by the test.
    const hlState: AccountState = {
      totalBalance: '1000.10',
      spendableBalance: '700.05',
      withdrawableBalance: '600.02',
      marginUsed: '200',
      unrealizedPnl: '30',
      returnOnEquity: '15',
      crossMarginSummary: {
        accountValue: '1000.10',
        maintenanceMargin: '20',
        marginUsed: '200',
        notional: '4000',
      },
      subAccountBreakdown: {
        main: {
          totalBalance: '1000.10',
          spendableBalance: '700.05',
          withdrawableBalance: '600.02',
        },
      },
    };
    const lighterState: AccountState = {
      totalBalance: '250.20',
      spendableBalance: '150.15',
      withdrawableBalance: '120.08',
      marginUsed: '50',
      unrealizedPnl: '-5',
      returnOnEquity: '-10',
      subAccountBreakdown: {
        main: {
          totalBalance: '250.20',
          spendableBalance: '150.15',
          withdrawableBalance: '120.08',
        },
      },
    };

    it('queries every provider and returns per-provider states plus decimal-safe combined totals', async () => {
      mockHLProvider.getAccountState.mockResolvedValue({ ...hlState });
      mockLighterProvider.getAccountState.mockResolvedValue({
        ...lighterState,
      });

      const result = await aggregatedProvider.getAccountState();

      expect(result.totalBalance).toBe('1250.3');
      expect(result.spendableBalance).toBe('850.2');
      expect(result.withdrawableBalance).toBe('720.1');
      expect(result.marginUsed).toBe('250');
      expect(result.unrealizedPnl).toBe('25');
      // Rate semantics: combined RoE is 100 x sum(pnl) / sum(marginUsed) =
      // 100 x 25 / 250 = 10. Neither summing rates (5) nor an unweighted
      // average (2.5) may pass.
      expect(result.returnOnEquity).toBe('10');
      expect(result.providerStates?.hyperliquid).toStrictEqual({
        status: 'available',
        providerId: 'hyperliquid',
        state: { ...hlState, providerId: 'hyperliquid' },
      });
      expect(result.providerStates?.lighter).toStrictEqual({
        status: 'available',
        providerId: 'lighter',
        state: { ...lighterState, providerId: 'lighter' },
      });
      expect(result.aggregate).toStrictEqual({
        status: 'complete',
        availableProviders: ['hyperliquid', 'lighter'],
        unavailableProviders: [],
      });
    });

    it('keeps venue-local sub-account data under each provider entry without cross-venue key collisions', async () => {
      mockHLProvider.getAccountState.mockResolvedValue({ ...hlState });
      mockLighterProvider.getAccountState.mockResolvedValue({
        ...lighterState,
      });

      const result = await aggregatedProvider.getAccountState();

      // Identical sub-account names at different venues must not collide: each
      // venue's 'main' entry keeps its own balances.
      expect(result.providerStates?.hyperliquid?.status).toBe('available');
      expect(result.providerStates?.lighter?.status).toBe('available');
      if (
        result.providerStates?.hyperliquid?.status === 'available' &&
        result.providerStates?.lighter?.status === 'available'
      ) {
        expect(
          result.providerStates.hyperliquid.state.subAccountBreakdown?.main
            .totalBalance,
        ).toBe('1000.10');
        expect(
          result.providerStates.lighter.state.subAccountBreakdown?.main
            .totalBalance,
        ).toBe('250.20');
      }
      // The combined total does not carry a merged subAccountBreakdown or a
      // merged crossMarginSummary: cross-venue collateral is not mutually usable.
      expect(result.crossMarginSummary).toBeUndefined();
      expect(result.subAccountBreakdown).toBeUndefined();
    });

    it('does not stamp the combined total with the default provider identity, even when the default changes mid-request', async () => {
      const pending = createDeferred<AccountState>();
      mockHLProvider.getAccountState.mockReturnValueOnce(pending.promise);
      mockLighterProvider.getAccountState.mockResolvedValue({
        ...lighterState,
      });

      const request = aggregatedProvider.getAccountState();
      aggregatedProvider.setDefaultProvider('lighter');
      pending.resolve({ ...hlState });

      const result = await request;
      // Each entry is attributed to the provider that actually served it.
      expect(result.providerStates?.hyperliquid?.status).toBe('available');
      expect(result.providerStates?.lighter?.status).toBe('available');
      // The combined total is not attributed to either venue.
      expect(result.providerId).toBeUndefined();
    });

    it('marks the aggregate partial when a venue read fails and still sums the available venue', async () => {
      mockHLProvider.getAccountState.mockResolvedValue({ ...hlState });
      mockLighterProvider.getAccountState.mockRejectedValue(
        new Error('venue down'),
      );

      const result = await aggregatedProvider.getAccountState();

      expect(result.totalBalance).toBe('1000.1');
      expect(result.aggregate).toStrictEqual({
        status: 'partial',
        availableProviders: ['hyperliquid'],
        unavailableProviders: ['lighter'],
      });
      expect(result.providerStates?.lighter).toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        error: 'venue down',
      });
    });

    it('reports a confirmed zero balance as available, not unavailable', async () => {
      mockHLProvider.getAccountState.mockResolvedValue({ ...hlState });
      mockLighterProvider.getAccountState.mockResolvedValue({
        totalBalance: '0',
        spendableBalance: '0',
        withdrawableBalance: '0',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });

      const result = await aggregatedProvider.getAccountState();

      expect(result.aggregate?.status).toBe('complete');
      expect(result.totalBalance).toBe('1000.1');
    });

    it('throws instead of manufacturing an all-zero total when every venue read fails', async () => {
      mockHLProvider.getAccountState.mockRejectedValue(new Error('hl down'));
      mockLighterProvider.getAccountState.mockRejectedValue(
        new Error('lighter down'),
      );

      await expect(aggregatedProvider.getAccountState()).rejects.toThrow();
    });
  });

  describe('Read Operations - getAccountSupport', () => {
    it('routes to the default provider', async () => {
      const unsupportedResult = {
        isSupported: false,
        reason: 'multi_sig_account',
      } as const;
      mockHLProvider.getAccountSupport?.mockResolvedValue(unsupportedResult);

      const result = await aggregatedProvider.getAccountSupport();

      expect(result).toEqual(unsupportedResult);
      expect(mockHLProvider.getAccountSupport).toHaveBeenCalledWith(undefined);
      expect(mockLighterProvider.getAccountSupport).not.toHaveBeenCalled();
    });

    it('routes to the explicitly selected provider', async () => {
      const unsupportedResult = {
        isSupported: false,
        reason: 'multi_sig_account',
      } as const;
      mockLighterProvider.getAccountSupport?.mockResolvedValue(
        unsupportedResult,
      );

      const result = await aggregatedProvider.getAccountSupport({
        providerId: 'lighter',
      });

      expect(result).toEqual(unsupportedResult);
      expect(mockLighterProvider.getAccountSupport).toHaveBeenCalledWith({
        providerId: 'lighter',
      });
      expect(mockHLProvider.getAccountSupport).not.toHaveBeenCalled();
    });

    it('treats a provider without an account support hook as supported', async () => {
      const {
        getAccountSupport: _getAccountSupport,
        ...providerWithoutAccountSupport
      } = mockLighterProvider;
      aggregatedProvider.addProvider('lighter', providerWithoutAccountSupport);

      const result = await aggregatedProvider.getAccountSupport({
        providerId: 'lighter',
      });

      expect(result).toEqual({ isSupported: true });
    });
  });

  describe('Read Operations - getMarketDataWithPrices', () => {
    it('aggregates market data from all providers', async () => {
      mockHLProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          maxLeverage: '50x',
          price: '50000',
          change24h: '100',
          change24hPercent: '0.2',
          volume: '1000000',
        },
      ]);
      mockLighterProvider.getMarketDataWithPrices.mockResolvedValue([
        {
          symbol: 'ETH',
          name: 'Ethereum',
          maxLeverage: '25x',
          price: '3000',
          change24h: '50',
          change24hPercent: '1.5',
          volume: '500000',
        },
      ]);

      const result = await aggregatedProvider.getMarketDataWithPrices();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(
        expect.objectContaining({ symbol: 'BTC', providerId: 'hyperliquid' }),
      );
      expect(result).toContainEqual(
        expect.objectContaining({ symbol: 'ETH', providerId: 'lighter' }),
      );
    });
  });

  describe('Read Operations - getOrderFills', () => {
    it('aggregates order fills from all providers', async () => {
      mockHLProvider.getOrderFills.mockResolvedValue([
        {
          orderId: '1',
          symbol: 'BTC',
          side: 'buy',
          size: '0.1',
          price: '50000',
          pnl: '0',
          direction: 'long',
          fee: '5',
          feeToken: 'USDC',
          timestamp: Date.now(),
        },
      ]);
      mockLighterProvider.getOrderFills.mockResolvedValue([
        {
          orderId: '2',
          symbol: 'ETH',
          side: 'sell',
          size: '1',
          price: '3000',
          pnl: '0',
          direction: 'short',
          fee: '3',
          feeToken: 'USDC',
          timestamp: Date.now(),
        },
      ]);

      const result = await aggregatedProvider.getOrderFills();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(
        expect.objectContaining({ orderId: '1', providerId: 'hyperliquid' }),
      );
    });
  });

  describe('Read Operations - getOpenOrders', () => {
    it('aggregates open orders from all providers', async () => {
      mockHLProvider.getOpenOrders.mockResolvedValue([
        createMockOrder('1', 'BTC'),
      ]);
      mockLighterProvider.getOpenOrders.mockResolvedValue([
        createMockOrder('2', 'ETH'),
      ]);

      const result = await aggregatedProvider.getOpenOrders();

      expect(result).toHaveLength(2);
      expect(result).toContainEqual(
        expect.objectContaining({ orderId: '1', providerId: 'hyperliquid' }),
      );
    });
  });

  describe('Read Operations - getFunding', () => {
    it('aggregates funding data from all providers', async () => {
      mockHLProvider.getFunding.mockResolvedValue([
        { symbol: 'BTC', amountUsd: '10', rate: '0.01', timestamp: Date.now() },
      ]);
      mockLighterProvider.getFunding.mockResolvedValue([
        { symbol: 'ETH', amountUsd: '5', rate: '0.02', timestamp: Date.now() },
      ]);

      const result = await aggregatedProvider.getFunding();

      expect(result).toHaveLength(2);
    });
  });

  describe('TWAP lifecycle operations', () => {
    const twapOrder: TwapOrder = {
      orderId: '987',
      symbol: 'ETH',
      side: 'buy',
      size: '1',
      executedSize: '0.4',
      remainingSize: '0.6',
      executedNotional: '1200',
      averagePrice: '3000',
      fillProgressBps: 4000,
      timeProgressBps: 5000,
      elapsedTimeMilliseconds: 300_000,
      durationMinutes: 10,
      randomize: true,
      reduceOnly: false,
      status: 'active',
      startedAt: 1,
      lastUpdated: 2,
      fills: [],
    };

    it('aggregates TWAP records with their provider IDs', async () => {
      mockHLProvider.getTwapOrders?.mockResolvedValue([twapOrder]);

      expect(await aggregatedProvider.getTwapOrders()).toContainEqual({
        ...twapOrder,
        providerId: 'hyperliquid',
      });
    });
  });

  describe('Chase lifecycle operations', () => {
    const chaseOrder: ChaseOrder = {
      handle: 'chase-1',
      symbol: 'ETH',
      side: 'buy',
      originalSize: '1',
      remainingSize: '1',
      arrivalPrice: '3000',
      restingPrice: '3000',
      restingOrderId: '55',
      distanceChasedBps: 0,
      repricings: 0,
      startedAt: 1,
      status: 'active',
    };

    it('aggregates Chase snapshots with their provider IDs', async () => {
      mockHLProvider.getChaseOrders?.mockResolvedValue([chaseOrder]);

      await expect(aggregatedProvider.getChaseOrders()).resolves.toContainEqual(
        { ...chaseOrder, providerId: 'hyperliquid' },
      );
    });

    it('retains successful Chase snapshots when another provider fails', async () => {
      mockHLProvider.getChaseOrders?.mockResolvedValue([chaseOrder]);
      mockLighterProvider.getChaseOrders?.mockRejectedValue(
        new Error('snapshot failed'),
      );

      await expect(aggregatedProvider.getChaseOrders()).resolves.toStrictEqual([
        { ...chaseOrder, providerId: 'hyperliquid' },
      ]);
    });

    it('suspends every provider and retains provider IDs', async () => {
      const backgrounded = {
        ...chaseOrder,
        status: 'backgrounded' as const,
      };
      mockHLProvider.suspendChaseOrders?.mockResolvedValue([backgrounded]);

      await expect(
        aggregatedProvider.suspendChaseOrders(),
      ).resolves.toContainEqual({
        ...backgrounded,
        providerId: 'hyperliquid',
      });
    });

    it('waits for every suspension attempt before rejecting a provider failure', async () => {
      const backgrounded = {
        ...chaseOrder,
        status: 'backgrounded' as const,
      };
      let resolveHyperLiquid: (orders: ChaseOrder[]) => void = () => undefined;
      const hyperLiquidSuspension = new Promise<ChaseOrder[]>((resolve) => {
        resolveHyperLiquid = resolve;
      });
      let hyperLiquidCompleted = false;
      mockHLProvider.suspendChaseOrders?.mockImplementation(async () => {
        const orders = await hyperLiquidSuspension;
        hyperLiquidCompleted = true;
        return orders;
      });
      const providerFailure = new Error('suspension failed');
      mockLighterProvider.suspendChaseOrders?.mockRejectedValue(
        providerFailure,
      );

      const suspension = aggregatedProvider.suspendChaseOrders();
      let aggregateSettled = false;
      void suspension.then(
        () => {
          aggregateSettled = true;
        },
        () => {
          aggregateSettled = true;
        },
      );
      await new Promise((resolve) => setImmediate(resolve));

      expect(aggregateSettled).toBe(false);
      resolveHyperLiquid([backgrounded]);
      await expect(suspension).rejects.toMatchObject({
        name: 'ChaseOrderSuspensionError',
        message: 'Failed to suspend Chase orders for: lighter',
        suspendedOrders: [{ ...backgrounded, providerId: 'hyperliquid' }],
        failures: [{ providerId: 'lighter', reason: providerFailure }],
      });
      expect(hyperLiquidCompleted).toBe(true);
    });
  });

  describe('Write Operations - placeOrder', () => {
    it('accepts an ordinary order held as the routed parameter type', async () => {
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      };

      await aggregatedProvider.placeOrder(params);

      expect(mockHLProvider.placeOrder).toHaveBeenCalledWith(params);
    });

    it('routes to default provider when no providerId specified', async () => {
      await aggregatedProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
      });

      expect(mockHLProvider.placeOrder).toHaveBeenCalled();
      expect(mockLighterProvider.placeOrder).not.toHaveBeenCalled();
    });

    it('routes to specified provider when providerId is provided', async () => {
      await aggregatedProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'lighter',
      });

      expect(mockLighterProvider.placeOrder).toHaveBeenCalled();
      expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s order to Lighter when explicitly requested',
      async (orderType) => {
        const params = {
          symbol: 'RHEA',
          isBuy: true,
          size: '0.1',
          orderType,
          providerId: 'lighter',
        } as const;

        await routedProvider.placeOrder(params);

        expect(mockLighterProvider.placeOrder).toHaveBeenCalledWith(params);
        expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
      },
    );

    it('injects providerId into result', async () => {
      mockLighterProvider.placeOrder.mockResolvedValue({
        success: true,
        orderId: 'lighter-order-123',
      });

      const result = await aggregatedProvider.placeOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'lighter',
      });

      expect(result.providerId).toBe('lighter');
      expect(result.orderId).toBe('lighter-order-123');
    });

    it('rejects an unregistered explicit provider for an ordinary order', async () => {
      aggregatedProvider.removeProvider('lighter');

      await expect(
        aggregatedProvider.placeOrder({
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType: 'market',
          providerId: 'lighter',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
      expect(mockLighterProvider.placeOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects an unregistered explicit provider for a %s order',
      async (orderType) => {
        aggregatedProvider.removeProvider('lighter');

        await expect(
          routedProvider.placeOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType,
            providerId: 'lighter',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
        expect(mockHLProvider.placeOrder).not.toHaveBeenCalled();
        expect(mockLighterProvider.placeOrder).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s order without providerId to the default provider',
      async (orderType) => {
        const params = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType,
        };

        await routedProvider.placeOrder(params);

        expect(mockHLProvider.placeOrder).toHaveBeenCalledWith(params);
        expect(mockLighterProvider.placeOrder).not.toHaveBeenCalled();
      },
    );
  });

  describe('Write Operations - cancelOrder', () => {
    it('accepts an ordinary cancel held as the routed parameter type', async () => {
      const params: CancelOrderParams = {
        orderId: 'order-123',
        symbol: 'BTC',
      };

      await aggregatedProvider.cancelOrder(params);

      expect(mockHLProvider.cancelOrder).toHaveBeenCalledWith(params);
    });

    it('routes to specified provider', async () => {
      await aggregatedProvider.cancelOrder({
        orderId: 'order-123',
        symbol: 'BTC',
        providerId: 'lighter',
      });

      expect(mockLighterProvider.cancelOrder).toHaveBeenCalledWith(
        expect.objectContaining({ orderId: 'order-123' }),
      );
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s cancel to Lighter when explicitly requested',
      async (orderType) => {
        const params = {
          orderId: 'strategy-123',
          symbol: 'RHEA',
          orderType,
          providerId: 'lighter',
        } as const;

        await routedProvider.cancelOrder(params);

        expect(mockLighterProvider.cancelOrder).toHaveBeenCalledWith(params);
        expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
      },
    );

    it('injects providerId into result', async () => {
      mockLighterProvider.cancelOrder.mockResolvedValue({
        success: true,
        orderId: 'order-123',
      });

      const result = await aggregatedProvider.cancelOrder({
        orderId: 'order-123',
        symbol: 'BTC',
        providerId: 'lighter',
      });

      expect(result.providerId).toBe('lighter');
    });

    it('rejects an unregistered explicit provider for an ordinary cancel', async () => {
      aggregatedProvider.removeProvider('lighter');

      await expect(
        aggregatedProvider.cancelOrder({
          orderId: 'order-123',
          symbol: 'BTC',
          orderType: 'limit',
          providerId: 'lighter',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
      expect(mockLighterProvider.cancelOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects an unregistered explicit provider for a %s cancel',
      async (orderType) => {
        aggregatedProvider.removeProvider('lighter');

        await expect(
          routedProvider.cancelOrder({
            orderId: 'strategy-123',
            symbol: 'BTC',
            orderType,
            providerId: 'lighter',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
        expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
        expect(mockLighterProvider.cancelOrder).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s cancel without providerId to the default provider',
      async (orderType) => {
        const params = {
          orderId: 'strategy-123',
          symbol: 'BTC',
          orderType,
        };

        await routedProvider.cancelOrder(params);

        expect(mockHLProvider.cancelOrder).toHaveBeenCalledWith(params);
        expect(mockLighterProvider.cancelOrder).not.toHaveBeenCalled();
      },
    );
  });

  describe('Mixed-venue batch routing', () => {
    const cancelResult = (
      orderId: string,
      symbol: string,
      success = true,
    ): CancelOrdersResult => ({
      success,
      successCount: success ? 1 : 0,
      failureCount: success ? 0 : 1,
      results: [
        { orderId, symbol, success, error: success ? undefined : 'nope' },
      ],
    });

    it('sends each tagged cancel target to its own venue and attributes results', async () => {
      mockHLProvider.cancelOrders.mockResolvedValue(
        cancelResult('hl-1', 'BTC'),
      );
      mockLighterProvider.cancelOrders.mockResolvedValue(
        cancelResult('lt-1', 'BTC'),
      );

      const result = await aggregatedProvider.cancelOrders([
        { orderId: 'hl-1', symbol: 'BTC', providerId: 'hyperliquid' },
        { orderId: 'lt-1', symbol: 'BTC', providerId: 'lighter' },
      ]);

      // Each venue receives only its own targets — same symbol, different venue.
      expect(mockHLProvider.cancelOrders).toHaveBeenCalledWith([
        { orderId: 'hl-1', symbol: 'BTC', providerId: 'hyperliquid' },
      ]);
      expect(mockLighterProvider.cancelOrders).toHaveBeenCalledWith([
        { orderId: 'lt-1', symbol: 'BTC', providerId: 'lighter' },
      ]);
      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(0);
      expect(result.results).toEqual([
        {
          orderId: 'hl-1',
          symbol: 'BTC',
          success: true,
          providerId: 'hyperliquid',
        },
        {
          orderId: 'lt-1',
          symbol: 'BTC',
          success: true,
          providerId: 'lighter',
        },
      ]);
    });

    it('never hides one venue successes behind another venue failure', async () => {
      mockHLProvider.cancelOrders.mockResolvedValue(
        cancelResult('hl-1', 'BTC'),
      );
      mockLighterProvider.cancelOrders.mockResolvedValue({
        success: false,
        successCount: 0,
        failureCount: 1,
        results: [
          {
            orderId: 'lt-1',
            symbol: 'BTC',
            success: false,
            error: 'venue down',
          },
        ],
      });

      const result = await aggregatedProvider.cancelOrders([
        { orderId: 'hl-1', symbol: 'BTC', providerId: 'hyperliquid' },
        { orderId: 'lt-1', symbol: 'BTC', providerId: 'lighter' },
      ]);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results).toEqual([
        {
          orderId: 'hl-1',
          symbol: 'BTC',
          success: true,
          providerId: 'hyperliquid',
        },
        {
          orderId: 'lt-1',
          symbol: 'BTC',
          success: false,
          error: 'venue down',
          providerId: 'lighter',
        },
      ]);
    });

    it('reports a thrown venue batch as explicit per-target failures', async () => {
      mockHLProvider.cancelOrders.mockRejectedValue(
        new Error('batch rejected'),
      );
      mockLighterProvider.cancelOrders.mockResolvedValue(
        cancelResult('lt-1', 'ETH'),
      );

      const result = await aggregatedProvider.cancelOrders([
        { orderId: 'hl-1', symbol: 'BTC', providerId: 'hyperliquid' },
        { orderId: 'lt-1', symbol: 'ETH', providerId: 'lighter' },
      ]);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results).toEqual([
        {
          orderId: 'hl-1',
          symbol: 'BTC',
          success: false,
          error: 'batch rejected',
          providerId: 'hyperliquid',
        },
        {
          orderId: 'lt-1',
          symbol: 'ETH',
          success: true,
          providerId: 'lighter',
        },
      ]);
    });

    it('reports an explicit per-target failure for a venue without batch cancel support', async () => {
      delete (mockHLProvider as Partial<MockPerpsProvider>).cancelOrders;
      mockLighterProvider.cancelOrders.mockResolvedValue(
        cancelResult('lt-1', 'BTC'),
      );

      const result = await aggregatedProvider.cancelOrders([
        { orderId: 'hl-1', symbol: 'BTC', providerId: 'hyperliquid' },
        { orderId: 'lt-1', symbol: 'BTC', providerId: 'lighter' },
      ]);

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.results).toEqual([
        {
          orderId: 'hl-1',
          symbol: 'BTC',
          success: false,
          error: 'Batch cancel not supported',
          providerId: 'hyperliquid',
        },
        {
          orderId: 'lt-1',
          symbol: 'BTC',
          success: true,
          providerId: 'lighter',
        },
      ]);
    });

    it('refuses untagged targets while multiple venues are registered', async () => {
      await expect(
        aggregatedProvider.cancelOrders([{ orderId: '1', symbol: 'BTC' }]),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED);
      expect(mockHLProvider.cancelOrders).not.toHaveBeenCalled();
      expect(mockLighterProvider.cancelOrders).not.toHaveBeenCalled();
    });

    it('routes untagged targets to the venue when only one is registered', async () => {
      aggregatedProvider.removeProvider('lighter');
      mockHLProvider.cancelOrders.mockResolvedValue(
        cancelResult('hl-1', 'BTC'),
      );

      const result = await aggregatedProvider.cancelOrders([
        { orderId: 'hl-1', symbol: 'BTC' },
      ]);

      expect(mockHLProvider.cancelOrders).toHaveBeenCalledWith([
        { orderId: 'hl-1', symbol: 'BTC' },
      ]);
      expect(result.successCount).toBe(1);
    });

    it('fans a mixed-venue close out to each named venue and attributes results', async () => {
      mockHLProvider.closePositions.mockResolvedValue({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ symbol: 'BTC', success: true }],
      });
      mockLighterProvider.closePositions.mockResolvedValue({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ symbol: 'BTC', success: true }],
      });

      const result = await aggregatedProvider.closePositions({
        targets: [
          { symbol: 'BTC', providerId: 'hyperliquid' },
          { symbol: 'BTC', providerId: 'lighter' },
        ],
      });

      // Identical symbols on both venues close independently.
      expect(mockHLProvider.closePositions).toHaveBeenCalledWith({
        symbols: ['BTC'],
      });
      expect(mockLighterProvider.closePositions).toHaveBeenCalledWith({
        symbols: ['BTC'],
      });
      expect(result.successCount).toBe(2);
      expect(result.results).toEqual([
        { symbol: 'BTC', success: true, providerId: 'hyperliquid' },
        { symbol: 'BTC', success: true, providerId: 'lighter' },
      ]);
    });

    it('fans closeAll out to every enabled venue', async () => {
      mockHLProvider.closePositions.mockResolvedValue({
        success: true,
        successCount: 2,
        failureCount: 0,
        results: [
          { symbol: 'BTC', success: true },
          { symbol: 'ETH', success: true },
        ],
      });
      mockLighterProvider.closePositions.mockResolvedValue({
        success: false,
        successCount: 0,
        failureCount: 1,
        results: [{ symbol: 'BTC', success: false, error: 'rejected' }],
      });

      const result = await aggregatedProvider.closePositions({
        closeAll: true,
      });

      expect(mockHLProvider.closePositions).toHaveBeenCalledWith({
        closeAll: true,
      });
      expect(mockLighterProvider.closePositions).toHaveBeenCalledWith({
        closeAll: true,
      });
      // Hyperliquid's two successes are not hidden by Lighter's failure.
      expect(result.success).toBe(true);
      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.results).toEqual([
        { symbol: 'BTC', success: true, providerId: 'hyperliquid' },
        { symbol: 'ETH', success: true, providerId: 'hyperliquid' },
        {
          symbol: 'BTC',
          success: false,
          error: 'rejected',
          providerId: 'lighter',
        },
      ]);
    });

    it('refuses a legacy symbols-only close while multiple venues are registered', async () => {
      await expect(
        aggregatedProvider.closePositions({ symbols: ['BTC'] }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_ROUTE_REQUIRED);
      expect(mockHLProvider.closePositions).not.toHaveBeenCalled();
      expect(mockLighterProvider.closePositions).not.toHaveBeenCalled();
    });

    it('records a per-symbol failure when a tagged venue close throws', async () => {
      mockHLProvider.closePositions.mockRejectedValue(
        new Error('batch rejected'),
      );
      mockLighterProvider.closePositions.mockResolvedValue({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ symbol: 'ETH', success: true }],
      });

      const result = await aggregatedProvider.closePositions({
        targets: [
          { symbol: 'BTC', providerId: 'hyperliquid' },
          { symbol: 'ETH', providerId: 'lighter' },
        ],
      });

      // The thrown venue's target stays in the result. A partial close is
      // not reported as fully successful.
      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(1);
      expect(result.error).toBe('hyperliquid: batch rejected');
      expect(result.results).toEqual([
        {
          symbol: 'BTC',
          success: false,
          error: 'batch rejected',
          providerId: 'hyperliquid',
        },
        { symbol: 'ETH', success: true, providerId: 'lighter' },
      ]);
    });

    it('closes only the tagged symbols when one venue is registered', async () => {
      aggregatedProvider.removeProvider('lighter');
      mockHLProvider.closePositions.mockResolvedValue({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ symbol: 'BTC', success: true }],
      });

      const result = await aggregatedProvider.closePositions({
        targets: [{ symbol: 'BTC', providerId: 'hyperliquid' }],
      });

      // The venue must see a symbol list. Forwarding `targets` alone is
      // close-all on a provider that only reads `symbols` and `closeAll`.
      expect(mockHLProvider.closePositions).toHaveBeenCalledWith({
        symbols: ['BTC'],
      });
      expect(result.results).toEqual([
        { symbol: 'BTC', success: true, providerId: 'hyperliquid' },
      ]);
    });

    it('does not close the loaded venue when the only target names another venue', async () => {
      aggregatedProvider.removeProvider('lighter');

      const result = await aggregatedProvider.closePositions({
        targets: [{ symbol: 'BTC', providerId: 'lighter' }],
      });

      expect(mockHLProvider.closePositions).not.toHaveBeenCalled();
      expect(mockHLProvider.closePosition).not.toHaveBeenCalled();
      expect(result).toEqual({
        success: false,
        successCount: 0,
        failureCount: 1,
        results: [
          {
            symbol: 'BTC',
            success: false,
            error: PERPS_ERROR_CODES.PROVIDER_NOT_FOUND,
            providerId: 'lighter',
          },
        ],
      });
    });

    it('closes tagged symbols one by one when the only venue has no batch close', async () => {
      aggregatedProvider.removeProvider('lighter');
      delete (mockHLProvider as Partial<MockPerpsProvider>).closePositions;
      mockHLProvider.closePosition.mockResolvedValue({ success: true });

      const result = await aggregatedProvider.closePositions({
        targets: [{ symbol: 'BTC', providerId: 'hyperliquid' }],
      });

      expect(mockHLProvider.closePosition).toHaveBeenCalledTimes(1);
      expect(mockHLProvider.closePosition).toHaveBeenCalledWith({
        symbol: 'BTC',
      });
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });

    it('passes a legacy symbols-only close through when only one venue is registered', async () => {
      aggregatedProvider.removeProvider('lighter');
      mockHLProvider.closePositions.mockResolvedValue({
        success: true,
        successCount: 1,
        failureCount: 0,
        results: [{ symbol: 'BTC', success: true }],
      });

      await expect(
        aggregatedProvider.closePositions({ symbols: ['BTC'] }),
      ).resolves.toMatchObject({ successCount: 1 });
      expect(mockHLProvider.closePositions).toHaveBeenCalledWith({
        symbols: ['BTC'],
      });
    });
  });

  describe('Write Operations - replacePositionTPSLLeg', () => {
    it('routes to the specified provider and tags the result', async () => {
      const replacePositionTPSLLeg = vi
        .fn()
        .mockResolvedValue({ success: true, orderId: 'TP/SL orders placed' });
      Object.assign(mockLighterProvider, { replacePositionTPSLLeg });
      const params = {
        symbol: 'BTC',
        leg: 'tp' as const,
        triggerPrice: '60000',
        providerId: 'lighter' as const,
      };

      const result = await aggregatedProvider.replacePositionTPSLLeg(params);

      expect(replacePositionTPSLLeg).toHaveBeenCalledWith(params);
      expect(result).toStrictEqual({
        success: true,
        orderId: 'TP/SL orders placed',
        providerId: 'lighter',
      });
    });

    it('rejects with the typed unsupported error when the provider cannot replace a leg', async () => {
      await expect(
        aggregatedProvider.replacePositionTPSLLeg({
          symbol: 'BTC',
          leg: 'sl',
          triggerPrice: '45000',
        }),
      ).rejects.toMatchObject({
        errorCode: PERPS_ERROR_CODES.TPSL_LEG_REPLACE_UNSUPPORTED,
      });
      expect(mockHLProvider.updatePositionTPSL).not.toHaveBeenCalled();
    });
  });

  describe('Write Operations - closePosition', () => {
    it('routes to specified provider', async () => {
      await aggregatedProvider.closePosition({
        symbol: 'BTC',
        providerId: 'lighter',
      });

      expect(mockLighterProvider.closePosition).toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('validates order with specified provider', async () => {
      await aggregatedProvider.validateOrder({
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'lighter',
      });

      expect(mockLighterProvider.validateOrder).toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes %s validation to Lighter when explicitly requested',
      async (orderType) => {
        const params = {
          symbol: 'RHEA',
          isBuy: true,
          size: '0.1',
          orderType,
          providerId: 'lighter',
        } as const;

        await routedProvider.validateOrder(params);

        expect(mockLighterProvider.validateOrder).toHaveBeenCalledWith(params);
        expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
      },
    );

    it('rejects an unregistered provider during ordinary validation', async () => {
      aggregatedProvider.removeProvider('lighter');
      const params: OrderParams = {
        symbol: 'BTC',
        isBuy: true,
        size: '0.1',
        orderType: 'market',
        providerId: 'lighter',
      };

      await expect(aggregatedProvider.validateOrder(params)).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_NOT_FOUND,
      );

      expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
      expect(mockLighterProvider.validateOrder).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'rejects an unregistered explicit provider for %s validation',
      async (orderType) => {
        aggregatedProvider.removeProvider('lighter');

        await expect(
          routedProvider.validateOrder({
            symbol: 'BTC',
            isBuy: true,
            size: '0.1',
            orderType,
            providerId: 'lighter',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
        expect(mockHLProvider.validateOrder).not.toHaveBeenCalled();
        expect(mockLighterProvider.validateOrder).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'routes %s validation without providerId to the default provider',
      async (orderType) => {
        const params = {
          symbol: 'BTC',
          isBuy: true,
          size: '0.1',
          orderType,
        };

        await routedProvider.validateOrder(params);

        expect(mockHLProvider.validateOrder).toHaveBeenCalledWith(params);
        expect(mockLighterProvider.validateOrder).not.toHaveBeenCalled();
      },
    );

    it('uses default provider for validateDeposit', async () => {
      await aggregatedProvider.validateDeposit({
        amount: '100',
        assetId: 'eip155:42161/erc20:0x1234/default',
      });

      expect(mockHLProvider.validateDeposit).toHaveBeenCalled();
    });

    it('routes validateClosePosition to specified provider', async () => {
      const params = { symbol: 'BTC', providerId: 'lighter' as const };

      await aggregatedProvider.validateClosePosition(params);

      expect(mockLighterProvider.validateClosePosition).toHaveBeenCalledWith(
        params,
      );
    });

    it('routes validateWithdrawal to specified provider', async () => {
      const params = { amount: '100', providerId: 'lighter' as const };

      await aggregatedProvider.validateWithdrawal(params);

      expect(mockLighterProvider.validateWithdrawal).toHaveBeenCalledWith(
        params,
      );
    });
  });

  describe('Lifecycle', () => {
    it('initializes default provider', async () => {
      const result = await aggregatedProvider.initialize();

      expect(mockHLProvider.initialize).toHaveBeenCalled();
      expect(result).toEqual({ success: true });
    });

    it('disconnects all providers', async () => {
      const result = await aggregatedProvider.disconnect();

      expect(mockHLProvider.disconnect).toHaveBeenCalled();
      expect(mockLighterProvider.disconnect).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('delegates isReadyToTrade to default provider', async () => {
      mockHLProvider.isReadyToTrade.mockResolvedValue({
        ready: true,
        walletConnected: true,
        networkSupported: true,
      });

      const result = await aggregatedProvider.isReadyToTrade();

      expect(result.ready).toBe(true);
      expect(mockHLProvider.isReadyToTrade).toHaveBeenCalled();
    });

    it('prepares every provider and reports the first one not ready', async () => {
      const prepareHyperLiquid = vi.fn().mockResolvedValue({ ready: true });
      const prepareLighter = vi.fn().mockResolvedValue({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      Object.assign(mockHLProvider, {
        prepareTradingWallet: prepareHyperLiquid,
      });
      Object.assign(mockLighterProvider, {
        prepareTradingWallet: prepareLighter,
      });

      const result = await aggregatedProvider.prepareTradingWallet();

      expect(result).toStrictEqual({
        ready: false,
        error: PERPS_ERROR_CODES.KEYRING_LOCKED,
      });
      expect(prepareHyperLiquid.mock.calls).toStrictEqual([[]]);
      expect(prepareLighter.mock.calls).toStrictEqual([[]]);
    });

    it('reports ready when every provider is ready or has no deferred setup', async () => {
      const prepareHyperLiquid = vi.fn().mockResolvedValue({ ready: true });
      Object.assign(mockHLProvider, {
        prepareTradingWallet: prepareHyperLiquid,
      });

      const result = await aggregatedProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: true });
      expect(prepareHyperLiquid.mock.calls).toStrictEqual([[]]);
    });

    it('reports the first not-ready provider when several are not ready', async () => {
      const prepareHyperLiquid = vi
        .fn()
        .mockResolvedValue({ ready: false, error: 'first' });
      const prepareLighter = vi
        .fn()
        .mockResolvedValue({ ready: false, error: 'second' });
      Object.assign(mockHLProvider, {
        prepareTradingWallet: prepareHyperLiquid,
      });
      Object.assign(mockLighterProvider, {
        prepareTradingWallet: prepareLighter,
      });

      const result = await aggregatedProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false, error: 'first' });
      // Lighter is still prepared after HyperLiquid reported not ready.
      expect(prepareHyperLiquid.mock.calls).toStrictEqual([[]]);
      expect(prepareLighter.mock.calls).toStrictEqual([[]]);
    });

    it('still prepares the other providers when one throws', async () => {
      const crash = new Error('provider crashed');
      const prepareLighter = vi.fn().mockResolvedValue({ ready: true });
      Object.assign(mockHLProvider, {
        prepareTradingWallet: vi.fn().mockRejectedValue(crash),
      });
      Object.assign(mockLighterProvider, {
        prepareTradingWallet: prepareLighter,
      });

      const result = await aggregatedProvider.prepareTradingWallet();

      expect(result).toStrictEqual({ ready: false, error: 'provider crashed' });
      expect(prepareLighter.mock.calls).toStrictEqual([[]]);
      expect(
        (mockInfrastructure.logger.error as Mock).mock.calls,
      ).toStrictEqual([
        [
          crash,
          {
            tags: {
              feature: PERPS_CONSTANTS.FeatureName,
              provider: 'hyperliquid',
            },
            context: {
              name: 'AggregatedPerpsProvider',
              data: {
                method: 'prepareTradingWallet',
                providerId: 'hyperliquid',
              },
            },
          },
        ],
      ]);
    });

    it.each([
      [
        'nothing',
        undefined,
        'Unknown error (no details provided) [AggregatedPerpsProvider.prepareTradingWallet]',
      ],
      ['a string', 'provider crashed', 'provider crashed'],
    ])(
      'reports and logs a provider that throws %s instead of an Error',
      async (_thrown, thrown, message) => {
        Object.assign(mockHLProvider, {
          prepareTradingWallet: vi.fn().mockRejectedValue(thrown),
        });
        Object.assign(mockLighterProvider, {
          prepareTradingWallet: vi.fn().mockResolvedValue({ ready: true }),
        });

        const result = await aggregatedProvider.prepareTradingWallet();

        expect(result).toStrictEqual({ ready: false, error: message });
        expect(
          (mockInfrastructure.logger.error as Mock).mock.calls,
        ).toStrictEqual([
          [
            new Error(message),
            {
              tags: {
                feature: PERPS_CONSTANTS.FeatureName,
                provider: 'hyperliquid',
              },
              context: {
                name: 'AggregatedPerpsProvider',
                data: {
                  method: 'prepareTradingWallet',
                  providerId: 'hyperliquid',
                },
              },
            },
          ],
        ]);
      },
    );

    it.each([
      [true, 'testnet'],
      [false, 'mainnet'],
    ])(
      'tags a logged preparation failure with the network (isTestnet: %s)',
      async (isTestnet, network) => {
        const networkProvider = new AggregatedPerpsProvider({
          providers: new Map([['hyperliquid', mockHLProvider]]),
          defaultProvider: 'hyperliquid',
          infrastructure: mockInfrastructure,
          isTestnet,
        });
        const crash = new Error('provider crashed');
        Object.assign(mockHLProvider, {
          prepareTradingWallet: vi.fn().mockRejectedValue(crash),
        });

        await networkProvider.prepareTradingWallet();

        expect(
          (mockInfrastructure.logger.error as Mock).mock.calls,
        ).toStrictEqual([
          [
            crash,
            {
              tags: {
                feature: PERPS_CONSTANTS.FeatureName,
                provider: 'hyperliquid',
                network,
              },
              context: {
                name: 'AggregatedPerpsProvider',
                data: {
                  method: 'prepareTradingWallet',
                  providerId: 'hyperliquid',
                },
              },
            },
          ],
        ]);
      },
    );

    it('tags a logged Lighter failure with the network while Lighter is not pinned to testnet', async () => {
      vi.spyOn(
        PROVIDER_CONFIG as { LIGHTER_TESTNET_ONLY: boolean },
        'LIGHTER_TESTNET_ONLY',
        'get',
      ).mockReturnValue(false);
      const networkProvider = new AggregatedPerpsProvider({
        providers: new Map([['lighter', mockLighterProvider]]),
        defaultProvider: 'lighter',
        infrastructure: mockInfrastructure,
        isTestnet: false,
      });
      const crash = new Error('provider crashed');
      Object.assign(mockLighterProvider, {
        prepareTradingWallet: vi.fn().mockRejectedValue(crash),
      });

      await networkProvider.prepareTradingWallet();

      expect(
        (mockInfrastructure.logger.error as Mock).mock.calls,
      ).toStrictEqual([
        [
          crash,
          {
            tags: {
              feature: PERPS_CONSTANTS.FeatureName,
              provider: 'lighter',
              network: 'mainnet',
            },
            context: {
              name: 'AggregatedPerpsProvider',
              data: { method: 'prepareTradingWallet', providerId: 'lighter' },
            },
          },
        ],
      ]);
    });

    it('tags a logged Lighter failure with testnet while Lighter is pinned to testnet', async () => {
      vi.spyOn(
        PROVIDER_CONFIG as { LIGHTER_TESTNET_ONLY: boolean },
        'LIGHTER_TESTNET_ONLY',
        'get',
      ).mockReturnValue(true);
      const networkProvider = new AggregatedPerpsProvider({
        providers: new Map([['lighter', mockLighterProvider]]),
        defaultProvider: 'lighter',
        infrastructure: mockInfrastructure,
        isTestnet: false,
      });
      const crash = new Error('provider crashed');
      Object.assign(mockLighterProvider, {
        prepareTradingWallet: vi.fn().mockRejectedValue(crash),
      });

      await networkProvider.prepareTradingWallet();

      expect(
        (mockInfrastructure.logger.error as Mock).mock.calls,
      ).toStrictEqual([
        [
          crash,
          {
            tags: {
              feature: PERPS_CONSTANTS.FeatureName,
              provider: 'lighter',
              network: 'testnet',
            },
            context: {
              name: 'AggregatedPerpsProvider',
              data: { method: 'prepareTradingWallet', providerId: 'lighter' },
            },
          },
        ],
      ]);
    });

    it('prepares the next provider only after the previous one settles', async () => {
      const hyperLiquidAsked = createDeferred<void>();
      const firstPreparation = createDeferred<{ ready: boolean }>();
      const prepareHyperLiquid = vi.fn(async () => {
        hyperLiquidAsked.resolve();
        return await firstPreparation.promise;
      });
      const prepareLighter = vi.fn().mockResolvedValue({ ready: true });
      Object.assign(mockHLProvider, {
        prepareTradingWallet: prepareHyperLiquid,
      });
      Object.assign(mockLighterProvider, {
        prepareTradingWallet: prepareLighter,
      });

      const preparing = aggregatedProvider.prepareTradingWallet();
      await hyperLiquidAsked.promise;
      const hyperLiquidCallsBeforeSettling = [...prepareHyperLiquid.mock.calls];
      const lighterCallsBeforeSettling = [...prepareLighter.mock.calls];
      firstPreparation.resolve({ ready: true });
      const result = await preparing;

      expect(hyperLiquidCallsBeforeSettling).toStrictEqual([[]]);
      expect(lighterCallsBeforeSettling).toStrictEqual([]);
      expect(prepareHyperLiquid.mock.calls).toStrictEqual([[]]);
      expect(prepareLighter.mock.calls).toStrictEqual([[]]);
      expect(result).toStrictEqual({ ready: true });
    });

    it('delegates toggleTestnet to default provider', async () => {
      mockHLProvider.toggleTestnet.mockResolvedValue({
        success: true,
        isTestnet: true,
      });

      const result = await aggregatedProvider.toggleTestnet();

      expect(mockHLProvider.toggleTestnet).toHaveBeenCalled();
      expect(result).toEqual({ success: true, isTestnet: true });
    });
  });

  describe('Configuration', () => {
    it('applies setLiveDataConfig to all providers', () => {
      aggregatedProvider.setLiveDataConfig({ priceThrottleMs: 1000 });

      expect(mockHLProvider.setLiveDataConfig).toHaveBeenCalledWith({
        priceThrottleMs: 1000,
      });
      expect(mockLighterProvider.setLiveDataConfig).toHaveBeenCalledWith({
        priceThrottleMs: 1000,
      });
    });

    it('applies setUserFeeDiscount to all providers', () => {
      aggregatedProvider.setUserFeeDiscount(1000);

      expect(mockHLProvider.setUserFeeDiscount).toHaveBeenCalledWith(1000);
      expect(mockLighterProvider.setUserFeeDiscount).toHaveBeenCalledWith(1000);
    });

    it('preserves the fee source for providers that support full resolutions', () => {
      const resolution = {
        feeBips: 0,
        discountBips: 10000,
        source: 'subscription' as const,
        subscription: { eligible: true, reason: 'eligible' as const },
      };
      mockLighterProvider.setUserFeeResolution = undefined;

      aggregatedProvider.setUserFeeResolution(resolution);

      expect(mockHLProvider.setUserFeeResolution).toHaveBeenCalledWith(
        resolution,
      );
      expect(mockLighterProvider.setUserFeeDiscount).toHaveBeenCalledWith(
        10000,
      );
    });

    it('delegates subscription builder approval to the default provider', async () => {
      await expect(
        aggregatedProvider.approveSubscriptionBuilderFee(),
      ).resolves.toBe(true);

      expect(
        mockHLProvider.approveSubscriptionBuilderFee,
      ).toHaveBeenCalledTimes(1);
      expect(
        mockLighterProvider.approveSubscriptionBuilderFee,
      ).not.toHaveBeenCalled();
    });
  });

  describe('Chase cancellation reconciliation routing', () => {
    const params = (): ReconcileChaseOrderCancellationParams => ({
      providerId: 'lighter',
      handle: 'lighter-chase:100',
      clientOrderId: '101',
      owner: {
        providerId: 'lighter',
        walletAddress: '0xabc',
        network: 'testnet',
        accountIndex: 28,
        apiKeyIndex: 7,
      },
      cancellation: { nonce: 209, txHash: 'b'.repeat(64), expiresAt: 110000 },
    });
    const unsupported: ReconcileChaseOrderCancellationResult = {
      status: 'unsupported',
      providerId: 'lighter',
      handle: 'lighter-chase:100',
      reason: 'Test capability unavailable',
    };

    it('routes once to the exact provider and preserves captured identity', async () => {
      const reconcile = vi.fn().mockResolvedValue(unsupported);
      mockLighterProvider.reconcileChaseOrderCancellation = reconcile;
      const input = params();
      const expected = structuredClone(input);
      const pending = aggregatedProvider.reconcileChaseOrderCancellation(input);
      input.owner.apiKeyIndex = 8;
      input.cancellation.nonce = 210;
      expect(await pending).toStrictEqual(unsupported);
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(reconcile).toHaveBeenCalledWith(expected);
      expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
      expect(mockLighterProvider.cancelOrder).not.toHaveBeenCalled();
    });
    it('reports unsupported without an ordinary cancellation fallback', async () => {
      expect(
        await aggregatedProvider.reconcileChaseOrderCancellation(params()),
      ).toMatchObject({ status: 'unsupported', providerId: 'lighter' });
      expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
      expect(mockLighterProvider.cancelOrder).not.toHaveBeenCalled();
    });
    it('refuses a missing exact route rather than using the default provider', async () => {
      aggregatedProvider.removeProvider('lighter');
      await expect(
        aggregatedProvider.reconcileChaseOrderCancellation(params()),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
      expect(mockHLProvider.cancelOrder).not.toHaveBeenCalled();
    });
    it('refuses mismatched owner and route before provider calls', async () => {
      const reconcile = vi.fn().mockResolvedValue(unsupported);
      mockLighterProvider.reconcileChaseOrderCancellation = reconcile;
      const input = params();
      input.owner.providerId = 'hyperliquid';
      await expect(
        aggregatedProvider.reconcileChaseOrderCancellation(input),
      ).rejects.toThrow(/matching owner/u);
      expect(reconcile).not.toHaveBeenCalled();
    });
    it('fences a provider replacement during reconciliation', async () => {
      const result = createDeferred<ReconcileChaseOrderCancellationResult>();
      mockLighterProvider.reconcileChaseOrderCancellation = vi.fn(
        () => result.promise,
      );
      const pending =
        aggregatedProvider.reconcileChaseOrderCancellation(params());
      aggregatedProvider.addProvider('lighter', createMockProvider('lighter'));
      result.resolve(unsupported);
      await expect(pending).rejects.toThrow(
        PERPS_ERROR_CODES.PROVIDER_LIFECYCLE_STALE,
      );
      expect(mockLighterProvider.cancelOrder).not.toHaveBeenCalled();
    });
  });

  describe('Provider Management', () => {
    it('adds new provider', () => {
      // Using 'lighter' as an existing valid provider type for this test
      // (simulating adding a duplicate or re-adding after removal)
      const newProvider = createMockProvider('lighter');
      aggregatedProvider.addProvider('lighter', newProvider);

      expect(aggregatedProvider.hasProvider('lighter')).toBe(true);
      expect(aggregatedProvider.getProviderIds()).toContain('lighter');
    });

    it('removes provider', () => {
      const removed = aggregatedProvider.removeProvider('lighter');

      expect(removed).toBe(true);
      expect(aggregatedProvider.hasProvider('lighter')).toBe(false);
    });

    it('returns false when removing non-existent provider', () => {
      aggregatedProvider.removeProvider('lighter');
      const removed = aggregatedProvider.removeProvider('lighter');

      expect(removed).toBe(false);
    });
  });

  describe('Asset Routes', () => {
    const route = (contractAddress: string) => ({
      assetId:
        'eip155:42161/erc20:0x0000000000000000000000000000000000000000/default' as const,
      chainId: 'eip155:42161' as const,
      contractAddress: contractAddress as never,
    });

    it('lists deposit routes from every venue, each tagged with its provider', () => {
      mockHLProvider.getDepositRoutes.mockReturnValue([route('0xhl')]);
      mockLighterProvider.getDepositRoutes.mockReturnValue([route('0xlt')]);

      const routes = aggregatedProvider.getDepositRoutes({
        symbol: 'USDC',
      });

      // Identical asset/chain routes belonging to different venues are not
      // collapsed: the venue is who settles the money movement.
      expect(routes).toEqual([
        { ...route('0xhl'), providerId: 'hyperliquid' },
        { ...route('0xlt'), providerId: 'lighter' },
      ]);
      expect(mockHLProvider.getDepositRoutes).toHaveBeenCalledWith({
        symbol: 'USDC',
      });
      expect(mockLighterProvider.getDepositRoutes).toHaveBeenCalledWith({
        symbol: 'USDC',
      });
    });

    it('lists withdrawal routes from every venue and keeps venue-unmatched routes distinct', () => {
      mockHLProvider.getWithdrawalRoutes.mockReturnValue([route('0xhl')]);
      mockLighterProvider.getWithdrawalRoutes.mockReturnValue([route('0xhl')]);

      const routes = aggregatedProvider.getWithdrawalRoutes();

      expect(routes).toEqual([
        { ...route('0xhl'), providerId: 'hyperliquid' },
        { ...route('0xhl'), providerId: 'lighter' },
      ]);
    });

    it('keeps listing routes when one venue contributes none', () => {
      mockHLProvider.getDepositRoutes.mockReturnValue([route('0xhl')]);
      mockLighterProvider.getDepositRoutes.mockReturnValue([]);

      expect(aggregatedProvider.getDepositRoutes()).toEqual([
        { ...route('0xhl'), providerId: 'hyperliquid' },
      ]);
    });
  });

  describe('Calculations', () => {
    it('delegates calculateLiquidationPrice to default provider', async () => {
      await aggregatedProvider.calculateLiquidationPrice({
        entryPrice: 50000,
        leverage: 10,
        direction: 'long',
      });

      expect(mockHLProvider.calculateLiquidationPrice).toHaveBeenCalled();
    });

    it('routes calculateLiquidationPrice to the selected position provider', async () => {
      mockLighterProvider.calculateLiquidationPrice.mockResolvedValue('12345');

      const result = await aggregatedProvider.calculateLiquidationPrice({
        entryPrice: 50000,
        leverage: 10,
        direction: 'long',
        providerId: 'lighter',
      });

      expect(result).toBe('12345');
      expect(
        mockLighterProvider.calculateLiquidationPrice,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'lighter' }),
      );
      expect(mockHLProvider.calculateLiquidationPrice).not.toHaveBeenCalled();
    });

    it('delegates getMaxLeverage to default provider', async () => {
      await aggregatedProvider.getMaxLeverage('BTC');

      expect(mockHLProvider.getMaxLeverage).toHaveBeenCalledWith('BTC');
    });

    it('routes getMaxLeverage to the selected market provider', async () => {
      mockLighterProvider.getMaxLeverage.mockResolvedValue(17);

      const result = await aggregatedProvider.getMaxLeverage('BTC', 'lighter');

      expect(result).toBe(17);
      expect(mockLighterProvider.getMaxLeverage).toHaveBeenCalledWith('BTC');
      expect(mockHLProvider.getMaxLeverage).not.toHaveBeenCalled();
    });

    it('delegates calculateMaintenanceMargin to default provider', async () => {
      mockHLProvider.calculateMaintenanceMargin.mockResolvedValue(0.05);

      const result = await aggregatedProvider.calculateMaintenanceMargin({
        asset: 'BTC',
        positionSize: 1,
      });

      expect(result).toBe(0.05);
      expect(mockHLProvider.calculateMaintenanceMargin).toHaveBeenCalled();
    });

    it('routes calculateMaintenanceMargin to the selected position provider', async () => {
      mockLighterProvider.calculateMaintenanceMargin.mockResolvedValue(0.012);

      const result = await aggregatedProvider.calculateMaintenanceMargin({
        asset: 'BTC',
        positionSize: 1,
        providerId: 'lighter',
      });

      expect(result).toBe(0.012);
      expect(
        mockLighterProvider.calculateMaintenanceMargin,
      ).toHaveBeenCalledWith(
        expect.objectContaining({ providerId: 'lighter' }),
      );
      expect(mockHLProvider.calculateMaintenanceMargin).not.toHaveBeenCalled();
    });

    it('delegates calculateFees to default provider', async () => {
      mockHLProvider.calculateFees.mockResolvedValue({ feeRate: 0.001 });

      const result = await aggregatedProvider.calculateFees({
        orderType: 'market',
        symbol: 'BTC',
      });

      expect(result).toEqual({ feeRate: 0.001 });
      expect(mockHLProvider.calculateFees).toHaveBeenCalled();
    });

    it('delegates previewPositionModify to default provider', async () => {
      mockHLProvider.previewPositionModify.mockResolvedValue({
        status: 'none',
      });

      const params = {
        position: createMockPosition('BTC', '1'),
        direction: 'long' as const,
        size: '0.1',
        price: '50000',
        leverage: 10,
      };

      await aggregatedProvider.previewPositionModify(params);

      expect(mockHLProvider.previewPositionModify).toHaveBeenCalledWith(params);
    });

    it('routes previewPositionModify to an explicit provider', async () => {
      mockLighterProvider.previewPositionModify.mockResolvedValue({
        status: 'unsupported',
        reason: 'provider',
      });

      const params = {
        position: createMockPosition('RHEA', '1'),
        direction: 'long' as const,
        size: '0.1',
        price: '1',
        leverage: 5,
        providerId: 'lighter' as const,
      };

      await expect(
        aggregatedProvider.previewPositionModify(params),
      ).resolves.toStrictEqual({
        status: 'unsupported',
        reason: 'provider',
      });
      expect(mockLighterProvider.previewPositionModify).toHaveBeenCalledWith(
        params,
      );
      expect(mockHLProvider.previewPositionModify).not.toHaveBeenCalled();
    });

    it('routes previewPositionModify from position.providerId', async () => {
      mockLighterProvider.previewPositionModify.mockResolvedValue({
        status: 'unsupported',
        reason: 'provider',
      });

      const params = {
        position: {
          ...createMockPosition('RHEA', '1'),
          providerId: 'lighter' as const,
        },
        direction: 'long' as const,
        size: '0.1',
        price: '1',
        leverage: 5,
      };

      await expect(
        aggregatedProvider.previewPositionModify(params),
      ).resolves.toStrictEqual({
        status: 'unsupported',
        reason: 'provider',
      });
      expect(mockLighterProvider.previewPositionModify).toHaveBeenCalledWith(
        params,
      );
      expect(mockHLProvider.previewPositionModify).not.toHaveBeenCalled();
    });

    it('rejects an unregistered previewPositionModify route', async () => {
      aggregatedProvider.removeProvider('lighter');

      await expect(
        aggregatedProvider.previewPositionModify({
          position: createMockPosition('BTC', '1'),
          direction: 'long',
          size: '0.1',
          price: '50000',
          leverage: 10,
          providerId: 'lighter',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.previewPositionModify).not.toHaveBeenCalled();
      expect(mockLighterProvider.previewPositionModify).not.toHaveBeenCalled();
    });

    it('accepts an ordinary fee request held as the routed parameter type', async () => {
      const params: FeeCalculationParams = {
        orderType: 'market',
        symbol: 'BTC',
      };

      await aggregatedProvider.calculateFees(params);

      expect(mockHLProvider.calculateFees).toHaveBeenCalledWith(params);
    });

    it('routes calculateFees to an explicit provider', async () => {
      mockLighterProvider.calculateFees.mockResolvedValue({ feeRate: 0.002 });

      await expect(
        routedProvider.calculateFees({
          orderType: 'market',
          symbol: 'RHEA',
          providerId: 'lighter',
        }),
      ).resolves.toEqual({ feeRate: 0.002 });
      expect(mockLighterProvider.calculateFees).toHaveBeenCalledWith({
        orderType: 'market',
        symbol: 'RHEA',
        providerId: 'lighter',
      });
      expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
    });

    it('rejects an unregistered ordinary fee route', async () => {
      mockHLProvider.calculateFees.mockResolvedValue({ feeRate: 0.001 });
      aggregatedProvider.removeProvider('lighter');

      await expect(
        routedProvider.calculateFees({
          orderType: 'market',
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);

      expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
      expect(mockLighterProvider.calculateFees).not.toHaveBeenCalled();
    });

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s fee quote without providerId to the default provider',
      async (orderType) => {
        const params = {
          orderType,
          symbol: 'BTC',
        };

        await routedProvider.calculateFees(params);

        expect(mockHLProvider.calculateFees).toHaveBeenCalledWith(params);
        expect(mockLighterProvider.calculateFees).not.toHaveBeenCalled();
      },
    );

    it.each(STRATEGY_ORDER_TYPES)(
      'routes a %s fee quote to its explicit provider',
      async (orderType) => {
        mockLighterProvider.calculateFees.mockRejectedValueOnce(
          new Error(PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED),
        );

        await expect(
          aggregatedProvider.calculateFees({
            orderType,
            symbol: 'RHEA',
            providerId: 'lighter',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_STRATEGY_MARKET_UNSUPPORTED);
        expect(mockLighterProvider.calculateFees).toHaveBeenCalledWith({
          orderType,
          symbol: 'RHEA',
          providerId: 'lighter',
        });
        expect(mockHLProvider.calculateFees).not.toHaveBeenCalled();
      },
    );

    it('gets order capabilities from the default provider', async () => {
      const capabilities = Object.freeze({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: Object.freeze(['twap', 'scale', 'chase']),
        supportedTriggerOrderTypes: Object.freeze([
          'stop_market',
          'take_profit_limit',
        ]),
        supportedMarginModes: Object.freeze(['isolated', 'cross']),
      });
      mockHLProvider.getOrderCapabilities.mockResolvedValue(capabilities);

      await expect(
        aggregatedProvider.getOrderCapabilities({ symbol: 'BTC' }),
      ).resolves.toStrictEqual(capabilities);
      expect(mockHLProvider.getOrderCapabilities).toHaveBeenCalledWith({
        symbol: 'BTC',
        providerId: 'hyperliquid',
      });
    });

    it('gets order capabilities from an explicit provider route', async () => {
      mockLighterProvider.getOrderCapabilities.mockResolvedValue({
        status: 'ready',
        providerId: 'lighter',
        supportedStrategies: [],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_market',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'position-snapshot',
          partialCoverage: {
            single: true,
            pair: 'equal-quantity-oco',
            replacement: 'cancel-before-create',
            recovery: 'explicit-current-position-intent',
          },
        },
      });

      await expect(
        aggregatedProvider.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'ready',
        providerId: 'lighter',
        supportedStrategies: [],
        positionTpsl: {
          supportsExpectedPosition: true,
          childOrderIds: 'request-correlated',
          takeProfitOrderType: 'take_profit_market',
          stopLossOrderType: 'stop_market',
          defaultCoverage: 'position-snapshot',
          partialCoverage: {
            single: true,
            pair: 'equal-quantity-oco',
            replacement: 'cancel-before-create',
            recovery: 'explicit-current-position-intent',
          },
        },
      });
      expect(mockLighterProvider.getOrderCapabilities).toHaveBeenCalledWith({
        symbol: 'BTC',
        providerId: 'lighter',
      });
    });

    it('rejects capabilities attributed to a different provider', async () => {
      mockLighterProvider.getOrderCapabilities.mockResolvedValue({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: [],
      });

      await expect(
        aggregatedProvider.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_routable',
      });
    });

    it('attaches the route when unavailable capabilities omit provider identity', async () => {
      mockLighterProvider.getOrderCapabilities.mockResolvedValue({
        status: 'unavailable',
        reason: 'market_not_found',
      });

      await expect(
        aggregatedProvider.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'market_not_found',
      });
    });

    it('reports an explicit provider route that is not registered', async () => {
      const providerWithoutLighter = new AggregatedPerpsProvider({
        providers: new Map([['hyperliquid', mockHLProvider]]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });

      await expect(
        providerWithoutLighter.getOrderCapabilities({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_found',
      });
      expect(mockHLProvider.getOrderCapabilities).not.toHaveBeenCalled();
    });

    it('reports unavailable when the routed provider omits the optional hook', async () => {
      mockHLProvider.getOrderCapabilities = undefined;

      await expect(
        aggregatedProvider.getOrderCapabilities({ symbol: 'BTC' }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'not_implemented',
      });
    });

    it('reports unavailable when the routed capability read throws', async () => {
      mockHLProvider.getOrderCapabilities.mockRejectedValueOnce(
        new Error('offline'),
      );

      await expect(
        aggregatedProvider.getOrderCapabilities({ symbol: 'BTC' }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        '[AggregatedPerpsProvider] Order capabilities unavailable',
        { providerId: 'hyperliquid', error: 'offline' },
      );
    });

    it('gets the margin mode lock from the routed provider', async () => {
      mockLighterProvider.getMarginModeLock = vi.fn().mockResolvedValue({
        status: 'locked',
        providerId: 'lighter',
        marginMode: 'cross',
        reason: 'position',
      });

      await expect(
        aggregatedProvider.getMarginModeLock({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'locked',
        providerId: 'lighter',
        marginMode: 'cross',
        reason: 'position',
      });
      expect(mockLighterProvider.getMarginModeLock).toHaveBeenCalledWith({
        symbol: 'BTC',
        providerId: 'lighter',
      });
    });

    it('reports a margin mode lock route that is not registered', async () => {
      const providerWithoutLighter = new AggregatedPerpsProvider({
        providers: new Map([['hyperliquid', mockHLProvider]]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });

      await expect(
        providerWithoutLighter.getMarginModeLock({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_found',
      });
    });

    it('reports not_implemented when the routed provider has no margin mode lock hook', async () => {
      mockHLProvider.getMarginModeLock = undefined;

      await expect(
        aggregatedProvider.getMarginModeLock({ symbol: 'BTC' }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'not_implemented',
      });
    });

    it('rejects a margin mode lock attributed to a different provider', async () => {
      mockLighterProvider.getMarginModeLock = vi.fn().mockResolvedValue({
        status: 'unlocked',
        providerId: 'hyperliquid',
      });

      await expect(
        aggregatedProvider.getMarginModeLock({
          symbol: 'BTC',
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_routable',
      });
    });

    it('reports unavailable when the routed margin mode lock read throws', async () => {
      mockHLProvider.getMarginModeLock = vi
        .fn()
        .mockRejectedValue(new Error('offline'));

      await expect(
        aggregatedProvider.getMarginModeLock({ symbol: 'BTC' }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'hyperliquid',
        reason: 'provider_unavailable',
      });
      expect(mockInfrastructure.debugLogger.log).toHaveBeenCalledWith(
        '[AggregatedPerpsProvider] Margin mode lock unavailable',
        { providerId: 'hyperliquid', error: 'offline' },
      );
    });
  });

  describe('Scale price ladder', () => {
    const params = {
      symbol: 'BTC',
      minPrice: 100,
      maxPrice: 200,
      count: 3,
    };

    it('uses the default provider when providerId is omitted', async () => {
      await expect(
        aggregatedProvider.getScalePriceLadder(params),
      ).resolves.toStrictEqual({
        status: 'ready',
        providerId: 'hyperliquid',
        prices: ['100', '150', '200'],
      });
      expect(mockHLProvider.getScalePriceLadder).toHaveBeenCalledWith({
        ...params,
        providerId: 'hyperliquid',
      });
      expect(mockLighterProvider.getScalePriceLadder).not.toHaveBeenCalled();
    });

    it('routes an explicit providerId', async () => {
      mockLighterProvider.getScalePriceLadder.mockResolvedValueOnce({
        status: 'ready',
        providerId: 'lighter',
        prices: ['100', '125', '150'],
      });

      await expect(
        aggregatedProvider.getScalePriceLadder({
          ...params,
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'ready',
        providerId: 'lighter',
        prices: ['100', '125', '150'],
      });
      expect(mockLighterProvider.getScalePriceLadder).toHaveBeenCalledWith({
        ...params,
        providerId: 'lighter',
      });
      expect(mockHLProvider.getScalePriceLadder).not.toHaveBeenCalled();
    });

    it('reports a provider that does not implement ladder normalization', async () => {
      mockLighterProvider.getScalePriceLadder = undefined;

      await expect(
        aggregatedProvider.getScalePriceLadder({
          ...params,
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'not_implemented',
      });
    });

    it('reports an explicit provider route that is not registered', async () => {
      const providerWithoutLighterLadder = new AggregatedPerpsProvider({
        providers: new Map([['hyperliquid', mockHLProvider]]),
        defaultProvider: 'hyperliquid',
        infrastructure: mockInfrastructure,
      });

      await expect(
        providerWithoutLighterLadder.getScalePriceLadder({
          ...params,
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_found',
      });
      expect(mockHLProvider.getScalePriceLadder).not.toHaveBeenCalled();
    });

    it('rejects a ladder attributed to another provider', async () => {
      mockLighterProvider.getScalePriceLadder.mockResolvedValueOnce({
        status: 'ready',
        providerId: 'hyperliquid',
        prices: ['100', '150', '200'],
      });

      await expect(
        aggregatedProvider.getScalePriceLadder({
          ...params,
          providerId: 'lighter',
        }),
      ).resolves.toStrictEqual({
        status: 'unavailable',
        providerId: 'lighter',
        reason: 'provider_not_routable',
      });
    });

    it('preserves provider validation errors', async () => {
      mockHLProvider.getScalePriceLadder.mockRejectedValueOnce(
        new Error(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID),
      );

      await expect(
        aggregatedProvider.getScalePriceLadder(params),
      ).rejects.toThrow(PERPS_ERROR_CODES.ORDER_SCALE_RANGE_INVALID);
    });
  });

  describe('Subscriptions', () => {
    it('subscribes to prices via multiplexer', () => {
      const callback = vi.fn();
      aggregatedProvider.subscribeToPrices({
        symbols: ['BTC'],
        callback,
      });

      expect(mockHLProvider.subscribeToPrices).toHaveBeenCalled();
      expect(mockLighterProvider.subscribeToPrices).toHaveBeenCalled();
    });

    it('fans the account subscription out to every enabled venue', () => {
      const callback = vi.fn();
      aggregatedProvider.subscribeToAccount({ callback });

      expect(mockHLProvider.subscribeToAccount).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToAccount).toHaveBeenCalledTimes(1);
    });

    it('forwards account identity through the multiplexer', () => {
      const callback = vi.fn();
      aggregatedProvider.subscribeToAccount({
        callback,
        accountId: 'eip155:1:0xabc',
      });

      expect(mockHLProvider.subscribeToAccount).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'eip155:1:0xabc' }),
      );
      expect(mockLighterProvider.subscribeToAccount).toHaveBeenCalledWith(
        expect.objectContaining({ accountId: 'eip155:1:0xabc' }),
      );
    });

    it('aggregates per-venue emissions into combined totals and marks the aggregate incomplete before every venue reports', () => {
      const callback = vi.fn();
      aggregatedProvider.subscribeToAccount({ callback });

      const hlCallback =
        mockHLProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallback =
        mockLighterProvider.subscribeToAccount.mock.calls[0][0].callback;

      // First venue emits: the aggregate is explicitly incomplete.
      hlCallback({
        totalBalance: '1000.10',
        spendableBalance: '700.05',
        withdrawableBalance: '600.02',
        marginUsed: '200',
        unrealizedPnl: '30',
        returnOnEquity: '15',
      });
      expect(callback).toHaveBeenCalledTimes(1);
      const first = callback.mock.calls[0][0] as AccountState | null;
      expect(first?.totalBalance).toBe('1000.1');
      expect(first?.aggregate?.status).toBe('partial');
      expect(first?.aggregate?.availableProviders).toEqual(['hyperliquid']);
      expect(first?.aggregate?.unavailableProviders).toEqual(['lighter']);

      // Second venue emits: totals cover every venue.
      lighterCallback({
        totalBalance: '250.20',
        spendableBalance: '150.15',
        withdrawableBalance: '120.08',
        marginUsed: '50',
        unrealizedPnl: '-5',
        returnOnEquity: '-10',
      });
      expect(callback).toHaveBeenCalledTimes(2);
      const second = callback.mock.calls[1][0] as AccountState | null;
      expect(second?.totalBalance).toBe('1250.3');
      expect(second?.aggregate?.status).toBe('complete');
      expect(second?.providerStates?.hyperliquid?.status).toBe('available');
      expect(second?.providerStates?.lighter?.status).toBe('available');
    });

    it('invalidates a venue whose update is null instead of keeping its previous value as current', () => {
      const callback = vi.fn();
      aggregatedProvider.subscribeToAccount({ callback });

      const hlCallback =
        mockHLProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallback =
        mockLighterProvider.subscribeToAccount.mock.calls[0][0].callback;

      hlCallback({
        totalBalance: '1000.10',
        spendableBalance: '700.05',
        withdrawableBalance: '600.02',
        marginUsed: '200',
        unrealizedPnl: '30',
        returnOnEquity: '15',
      });
      lighterCallback({
        totalBalance: '250.20',
        spendableBalance: '150.15',
        withdrawableBalance: '120.08',
        marginUsed: '50',
        unrealizedPnl: '-5',
        returnOnEquity: '-10',
      });
      expect(callback.mock.calls[1][0].totalBalance).toBe('1250.3');

      // Lighter's balance is no longer known: it must not stay in the total,
      // and must not become a zero either.
      lighterCallback(null);
      const invalid = callback.mock.calls[2][0] as AccountState | null;
      expect(invalid?.totalBalance).toBe('1000.1');
      expect(invalid?.aggregate?.status).toBe('partial');
      expect(invalid?.aggregate?.unavailableProviders).toEqual(['lighter']);
    });

    it('emits null when no enabled venue has usable data', () => {
      const callback = vi.fn();
      aggregatedProvider.subscribeToAccount({ callback });

      const hlCallback =
        mockHLProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallback =
        mockLighterProvider.subscribeToAccount.mock.calls[0][0].callback;
      hlCallback(null);
      lighterCallback(null);

      expect(callback).toHaveBeenCalledWith(null);
    });

    it('keeps both venue subscriptions when the routing default changes', () => {
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      mockHLProvider.subscribeToAccount.mockReturnValue(hlCleanup);
      mockLighterProvider.subscribeToAccount.mockReturnValue(lighterCleanup);
      const callback = vi.fn();

      const cleanup = aggregatedProvider.subscribeToAccount({ callback });
      expect(mockHLProvider.subscribeToAccount).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToAccount).toHaveBeenCalledTimes(1);

      aggregatedProvider.setDefaultProvider('lighter');

      // The other venue's account subscription is not dropped and no null
      // invalidation is emitted: the all-venue total remains valid.
      expect(hlCleanup).not.toHaveBeenCalled();
      expect(lighterCleanup).not.toHaveBeenCalled();
      expect(mockHLProvider.subscribeToAccount).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToAccount).toHaveBeenCalledTimes(1);
      expect(callback).not.toHaveBeenCalled();

      cleanup();
      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(lighterCleanup).toHaveBeenCalledTimes(1);
    });

    it('cleans up every venue subscription when setup fails partway', () => {
      const hlCleanup = vi.fn();
      mockHLProvider.subscribeToAccount.mockReturnValue(hlCleanup);
      mockLighterProvider.subscribeToAccount.mockImplementation(() => {
        throw new Error('CLIENT_NOT_INITIALIZED');
      });

      expect(() =>
        aggregatedProvider.subscribeToAccount({ callback: vi.fn() }),
      ).toThrow('CLIENT_NOT_INITIALIZED');
      expect(hlCleanup).toHaveBeenCalledTimes(1);
    });

    it('does not let one account subscription cleanup erase another subscription venue data', () => {
      const callbackA = vi.fn();
      const callbackB = vi.fn();
      aggregatedProvider.subscribeToAccount({ callback: callbackA });
      aggregatedProvider.subscribeToAccount({ callback: callbackB });

      const hlCallbackA =
        mockHLProvider.subscribeToAccount.mock.calls[0][0].callback;
      const hlCallbackB =
        mockHLProvider.subscribeToAccount.mock.calls[1][0].callback;
      const lighterCallbackA =
        mockLighterProvider.subscribeToAccount.mock.calls[0][0].callback;
      const lighterCallbackB =
        mockLighterProvider.subscribeToAccount.mock.calls[1][0].callback;

      hlCallbackA({
        totalBalance: '1000.10',
        spendableBalance: '700.05',
        withdrawableBalance: '600.02',
        marginUsed: '200',
        unrealizedPnl: '30',
        returnOnEquity: '15',
      });
      hlCallbackB({
        totalBalance: '500',
        spendableBalance: '500',
        withdrawableBalance: '500',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });
      lighterCallbackA({
        totalBalance: '250.20',
        spendableBalance: '150.15',
        withdrawableBalance: '120.08',
        marginUsed: '50',
        unrealizedPnl: '-5',
        returnOnEquity: '-10',
      });
      lighterCallbackB({
        totalBalance: '100',
        spendableBalance: '100',
        withdrawableBalance: '100',
        marginUsed: '0',
        unrealizedPnl: '0',
        returnOnEquity: '0',
      });

      // Subscription A tears down; subscription B must keep both venues.
      // (Order of teardown does not matter: each subscription owns its cache.)
      const cleanupA1 = mockHLProvider.subscribeToAccount.mock.results[0]
        .value as () => void;
      const cleanupA2 = mockLighterProvider.subscribeToAccount.mock.results[0]
        .value as () => void;
      cleanupA1();
      cleanupA2();

      lighterCallbackB(null);
      // B's last emission: hyperliquid still available at 500, lighter gone.
      const lastB = callbackB.mock.calls.at(-1)?.[0] as AccountState | null;
      expect(lastB?.totalBalance).toBe('500');
      expect(lastB?.aggregate?.status).toBe('partial');
    });

    it('delegates subscribeToOICaps to default provider', () => {
      const callback = vi.fn();

      aggregatedProvider.subscribeToOICaps({ callback });

      expect(mockHLProvider.subscribeToOICaps).toHaveBeenCalled();
    });

    it('sends an explicitly routed candle subscription to that venue, even for a symbol both venues list', () => {
      const params = {
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
        providerId: 'lighter' as const,
      };
      aggregatedProvider.subscribeToCandles(params);

      expect(mockLighterProvider.subscribeToCandles).toHaveBeenCalledWith(
        params,
      );
      expect(mockHLProvider.subscribeToCandles).not.toHaveBeenCalled();
    });

    it('pins an explicitly routed candle subscription when the default changes', () => {
      const cleanup = vi.fn();
      mockLighterProvider.subscribeToCandles.mockReturnValue(cleanup);
      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
        providerId: 'lighter',
      });

      aggregatedProvider.setDefaultProvider('hyperliquid');

      // Pinned: the stream is not torn down or rebound to the new default.
      expect(cleanup).not.toHaveBeenCalled();
      expect(mockHLProvider.subscribeToCandles).not.toHaveBeenCalled();
    });

    it('keeps default-routed candle behavior when no explicit route is supplied', () => {
      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
      });
      expect(mockHLProvider.subscribeToCandles).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToCandles).not.toHaveBeenCalled();

      aggregatedProvider.setDefaultProvider('lighter');
      expect(mockHLProvider.subscribeToCandles).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToCandles).toHaveBeenCalledTimes(1);
    });

    it('routes order-book and OI-cap subscriptions to the explicit venue', () => {
      aggregatedProvider.subscribeToOrderBook({
        symbol: 'BTC',
        callback: vi.fn(),
        providerId: 'lighter',
      });
      aggregatedProvider.subscribeToOICaps({
        callback: vi.fn(),
        providerId: 'lighter',
      });

      expect(mockLighterProvider.subscribeToOrderBook).toHaveBeenCalledTimes(1);
      expect(mockHLProvider.subscribeToOrderBook).not.toHaveBeenCalled();
      expect(mockLighterProvider.subscribeToOICaps).toHaveBeenCalledTimes(1);
      expect(mockHLProvider.subscribeToOICaps).not.toHaveBeenCalled();
    });

    it('reports an invalid explicit stream route and never subscribes to a different venue', () => {
      aggregatedProvider.removeProvider('hyperliquid');
      const onError = vi.fn();

      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
        onError,
        providerId: 'hyperliquid',
      });
      aggregatedProvider.subscribeToOrderBook({
        symbol: 'BTC',
        callback: vi.fn(),
        onError,
        providerId: 'hyperliquid',
      });

      // Each invalid route reports once: no silent fallback to another venue.
      expect(onError).toHaveBeenCalledTimes(2);
      expect(mockLighterProvider.subscribeToCandles).not.toHaveBeenCalled();
      expect(mockLighterProvider.subscribeToOrderBook).not.toHaveBeenCalled();
    });

    it('delegates subscribeToCandles to default provider', () => {
      const callback = vi.fn();

      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback,
      });

      expect(mockHLProvider.subscribeToCandles).toHaveBeenCalled();
    });

    it('delegates subscribeToOrderBook to default provider', () => {
      const callback = vi.fn();

      aggregatedProvider.subscribeToOrderBook({ symbol: 'BTC', callback });

      expect(mockHLProvider.subscribeToOrderBook).toHaveBeenCalled();
    });

    describe('public trades', () => {
      const trade = {
        id: '1',
        symbol: 'BTC',
        price: '50000',
        size: '0.1',
        side: 'buy' as const,
        timestamp: 1000,
        providerId: 'lighter' as const,
      };

      it('reads from the default provider when no route is given', async () => {
        mockHLProvider.getPublicTrades = vi.fn().mockResolvedValue([]);

        await aggregatedProvider.getPublicTrades({ symbol: 'BTC', limit: 5 });

        expect(mockHLProvider.getPublicTrades).toHaveBeenCalledWith({
          symbol: 'BTC',
          limit: 5,
          providerId: 'hyperliquid',
        });
      });

      it('reads from the explicit provider', async () => {
        mockLighterProvider.getPublicTrades = vi
          .fn()
          .mockResolvedValue([trade]);
        mockHLProvider.getPublicTrades = vi.fn();

        const trades = await aggregatedProvider.getPublicTrades({
          symbol: 'BTC',
          providerId: 'lighter',
        });

        expect(trades).toStrictEqual([trade]);
        expect(mockHLProvider.getPublicTrades).not.toHaveBeenCalled();
      });

      it('rejects a read from a provider without a public trade feed', async () => {
        await expect(
          aggregatedProvider.getPublicTrades({
            symbol: 'BTC',
            providerId: 'lighter',
          }),
        ).rejects.toThrow('Public trades not supported by provider lighter');
      });

      it('rejects a read from an unregistered route', async () => {
        const providerWithoutLighter = new AggregatedPerpsProvider({
          providers: new Map([['hyperliquid', mockHLProvider]]),
          defaultProvider: 'hyperliquid',
          infrastructure: mockInfrastructure,
        });

        await expect(
          providerWithoutLighter.getPublicTrades({
            symbol: 'BTC',
            providerId: 'lighter',
          }),
        ).rejects.toThrow(PERPS_ERROR_CODES.PROVIDER_NOT_FOUND);
      });

      it('streams from the explicit provider, else the default one', () => {
        const unsubscribe = vi.fn();
        mockLighterProvider.subscribeToPublicTrades = vi
          .fn()
          .mockReturnValue(unsubscribe);
        mockHLProvider.subscribeToPublicTrades = vi
          .fn()
          .mockReturnValue(vi.fn());
        const callback = vi.fn();

        const cleanup = aggregatedProvider.subscribeToPublicTrades({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });
        aggregatedProvider.subscribeToPublicTrades({ symbol: 'ETH', callback });

        expect(cleanup).toBe(unsubscribe);
        expect(
          mockLighterProvider.subscribeToPublicTrades,
        ).toHaveBeenCalledWith({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });
        expect(mockHLProvider.subscribeToPublicTrades).toHaveBeenCalledWith({
          symbol: 'ETH',
          providerId: 'hyperliquid',
          callback,
        });
      });

      it('returns a no-op stream for a route without a public trade feed', () => {
        const callback = vi.fn();

        const cleanup = aggregatedProvider.subscribeToPublicTrades({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });
        cleanup();

        expect(callback).not.toHaveBeenCalled();
      });
    });

    describe('subscribeToAvailableToTrade', () => {
      it('routes to the default provider when no route is given', () => {
        const unsubscribe = vi.fn();
        mockHLProvider.subscribeToAvailableToTrade = vi
          .fn()
          .mockReturnValue(unsubscribe);
        const callback = vi.fn();

        const cleanup = aggregatedProvider.subscribeToAvailableToTrade({
          symbol: 'BTC',
          callback,
        });

        expect(mockHLProvider.subscribeToAvailableToTrade).toHaveBeenCalledWith(
          { symbol: 'BTC', providerId: 'hyperliquid', callback },
        );
        cleanup();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      });

      it('opens a supported stream when the default moves from Lighter to HyperLiquid', () => {
        const unsubscribe = vi.fn();
        mockHLProvider.subscribeToAvailableToTrade = vi
          .fn()
          .mockReturnValue(unsubscribe);
        aggregatedProvider.setDefaultProvider('lighter');
        const callback = vi.fn();
        const onError = vi.fn();
        const cleanup = aggregatedProvider.subscribeToAvailableToTrade({
          symbol: 'BTC',
          callback,
          onError,
        });
        expect(
          mockHLProvider.subscribeToAvailableToTrade,
        ).not.toHaveBeenCalled();

        aggregatedProvider.setDefaultProvider('hyperliquid');

        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(mockHLProvider.subscribeToAvailableToTrade).toHaveBeenCalledWith(
          {
            symbol: 'BTC',
            providerId: 'hyperliquid',
            callback,
            onError,
          },
        );
        cleanup();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
        aggregatedProvider.setDefaultProvider('lighter');
        expect(onError).toHaveBeenCalledTimes(1);
      });

      it('closes and invalidates the HyperLiquid stream when the default moves to Lighter', () => {
        const unsubscribe = vi.fn();
        mockHLProvider.subscribeToAvailableToTrade = vi
          .fn()
          .mockReturnValue(unsubscribe);
        const callback = vi.fn();
        const onError = vi.fn();
        const cleanup = aggregatedProvider.subscribeToAvailableToTrade({
          symbol: 'BTC',
          callback,
          onError,
        });

        aggregatedProvider.setDefaultProvider('lighter');

        expect(unsubscribe).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
        expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
          onError.mock.invocationCallOrder[0],
        );
        expect(callback).not.toHaveBeenCalled();
        cleanup();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      });

      it('keeps explicitly routed streams on their venue when the default changes', () => {
        const unsubscribe = vi.fn();
        mockHLProvider.subscribeToAvailableToTrade = vi
          .fn()
          .mockReturnValue(unsubscribe);
        const onError = vi.fn();
        const cleanup = aggregatedProvider.subscribeToAvailableToTrade({
          symbol: 'BTC',
          providerId: 'hyperliquid',
          callback: vi.fn(),
          onError,
        });

        aggregatedProvider.setDefaultProvider('lighter');

        expect(unsubscribe).not.toHaveBeenCalled();
        expect(onError).not.toHaveBeenCalled();
        expect(
          mockHLProvider.subscribeToAvailableToTrade,
        ).toHaveBeenCalledTimes(1);
        cleanup();
        expect(unsubscribe).toHaveBeenCalledTimes(1);
      });

      it('routes to the explicit provider', () => {
        mockLighterProvider.subscribeToAvailableToTrade = vi
          .fn()
          .mockReturnValue(vi.fn());
        mockHLProvider.subscribeToAvailableToTrade = vi.fn();
        const callback = vi.fn();

        aggregatedProvider.subscribeToAvailableToTrade({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });

        expect(
          mockLighterProvider.subscribeToAvailableToTrade,
        ).toHaveBeenCalledWith({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });
        expect(
          mockHLProvider.subscribeToAvailableToTrade,
        ).not.toHaveBeenCalled();
      });

      it('leaves the value unknown when the routed provider has no venue value', () => {
        mockHLProvider.subscribeToAvailableToTrade = vi.fn();
        const callback = vi.fn();

        const cleanup = aggregatedProvider.subscribeToAvailableToTrade({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });
        cleanup();

        expect(
          mockHLProvider.subscribeToAvailableToTrade,
        ).not.toHaveBeenCalled();
        expect(callback).not.toHaveBeenCalled();
      });

      it('leaves the value unknown when the route is not registered', () => {
        const providerWithoutLighter = new AggregatedPerpsProvider({
          providers: new Map([['hyperliquid', mockHLProvider]]),
          defaultProvider: 'hyperliquid',
          infrastructure: mockInfrastructure,
        });
        const callback = vi.fn();

        const cleanup = providerWithoutLighter.subscribeToAvailableToTrade({
          symbol: 'BTC',
          providerId: 'lighter',
          callback,
        });
        cleanup();

        expect(callback).not.toHaveBeenCalled();
      });
    });
  });

  describe('setDefaultProvider re-routes default-routed streams', () => {
    it.each(['during unsubscribe', 'after rerouting'])(
      'retains the source venue for TWAP updates delivered %s',
      (deliveryTiming) => {
        const oldOrders = [{ orderId: 'hl-twap' } as TwapOrder];
        const newOrders = [{ orderId: 'lighter-twap' } as TwapOrder];
        const subscribeHL =
          vi.fn<NonNullable<PerpsProvider['subscribeToTwapOrders']>>();
        const hlCleanup = vi.fn(() => {
          if (deliveryTiming === 'during unsubscribe') {
            subscribeHL.mock.calls[0][0].callback(oldOrders, false);
          }
        });
        subscribeHL.mockReturnValue(hlCleanup);
        const lighterCleanup = vi.fn();
        const subscribeLighter = vi
          .fn<NonNullable<PerpsProvider['subscribeToTwapOrders']>>()
          .mockImplementation(({ callback }) => {
            callback(newOrders, true);
            return lighterCleanup;
          });
        mockHLProvider.subscribeToTwapOrders = subscribeHL;
        mockLighterProvider.subscribeToTwapOrders = subscribeLighter;
        const callback = vi.fn();
        const cleanup = aggregatedProvider.subscribeToTwapOrders({ callback });

        aggregatedProvider.setDefaultProvider('lighter');
        if (deliveryTiming === 'after rerouting') {
          subscribeHL.mock.calls[0][0].callback(oldOrders, false);
        }

        const oldUpdate = [
          [{ ...oldOrders[0], providerId: 'hyperliquid' }],
          false,
        ];
        const newUpdate = [[{ ...newOrders[0], providerId: 'lighter' }], true];
        expect(callback.mock.calls).toStrictEqual(
          deliveryTiming === 'during unsubscribe'
            ? [oldUpdate, [[], true], newUpdate]
            : [[[], true], newUpdate, oldUpdate],
        );
        expect(hlCleanup).toHaveBeenCalledTimes(1);
        expect(lighterCleanup).not.toHaveBeenCalled();

        cleanup();
        cleanup();
        expect(hlCleanup).toHaveBeenCalledTimes(1);
        expect(lighterCleanup).toHaveBeenCalledTimes(1);
        aggregatedProvider.setDefaultProvider('hyperliquid');
        expect(subscribeHL).toHaveBeenCalledTimes(1);
      },
    );

    it('clears the previous TWAP snapshot when moving to a venue without a TWAP stream', () => {
      const unsubscribe = vi.fn();
      const subscribeToTwapOrders = vi
        .fn<NonNullable<PerpsProvider['subscribeToTwapOrders']>>()
        .mockReturnValue(unsubscribe);
      mockHLProvider.subscribeToTwapOrders = subscribeToTwapOrders;
      const callback = vi.fn();
      const cleanup = aggregatedProvider.subscribeToTwapOrders({ callback });
      const oldCallback = subscribeToTwapOrders.mock.calls[0][0].callback;
      oldCallback([{ orderId: 'hl-twap' } as TwapOrder], true);
      expect(callback).toHaveBeenLastCalledWith(
        [
          expect.objectContaining({
            orderId: 'hl-twap',
            providerId: 'hyperliquid',
          }),
        ],
        true,
      );

      aggregatedProvider.setDefaultProvider('lighter');

      expect(unsubscribe).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenLastCalledWith([], true);
      expect(unsubscribe.mock.invocationCallOrder[0]).toBeLessThan(
        callback.mock.invocationCallOrder[1],
      );
      cleanup();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('invalidates TWAP orders before opening a supported stream and retains cleanup across moves', () => {
      const unsubscribe = vi.fn();
      mockHLProvider.subscribeToTwapOrders = vi
        .fn()
        .mockImplementation(({ callback }) => {
          callback([{ orderId: 'hl-twap' } as TwapOrder], true);
          return unsubscribe;
        });
      aggregatedProvider.setDefaultProvider('lighter');
      const callback = vi.fn();
      const cleanup = aggregatedProvider.subscribeToTwapOrders({ callback });
      expect(callback).not.toHaveBeenCalled();

      aggregatedProvider.setDefaultProvider('hyperliquid');

      expect(callback).toHaveBeenNthCalledWith(1, [], true);
      expect(callback).toHaveBeenNthCalledWith(
        2,
        [
          expect.objectContaining({
            orderId: 'hl-twap',
            providerId: 'hyperliquid',
          }),
        ],
        true,
      );
      aggregatedProvider.setDefaultProvider('hyperliquid');
      expect(callback).toHaveBeenCalledTimes(2);
      cleanup();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
      aggregatedProvider.setDefaultProvider('lighter');
      expect(callback).toHaveBeenCalledTimes(2);
    });

    it('moves a candles subscription to the new venue without reconnecting transports', () => {
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      mockHLProvider.subscribeToCandles.mockReturnValue(hlCleanup);
      mockLighterProvider.subscribeToCandles.mockReturnValue(lighterCleanup);
      const callback = vi.fn();

      const cleanup = aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback,
      });
      expect(mockHLProvider.subscribeToCandles).toHaveBeenCalledTimes(1);

      aggregatedProvider.setDefaultProvider('lighter');

      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToCandles).toHaveBeenCalledTimes(1);

      cleanup();
      expect(lighterCleanup).toHaveBeenCalledTimes(1);
    });

    it('moves an order-book subscription to the new venue when the default changes', () => {
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      mockHLProvider.subscribeToOrderBook.mockReturnValue(hlCleanup);
      mockLighterProvider.subscribeToOrderBook.mockReturnValue(lighterCleanup);
      const callback = vi.fn();

      const cleanup = aggregatedProvider.subscribeToOrderBook({
        symbol: 'BTC',
        callback,
      });
      expect(mockHLProvider.subscribeToOrderBook).toHaveBeenCalledTimes(1);

      aggregatedProvider.setDefaultProvider('lighter');

      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToOrderBook).toHaveBeenCalledTimes(1);

      cleanup();
      expect(lighterCleanup).toHaveBeenCalledTimes(1);
    });

    it('moves an unrouted public-trades stream to the new venue and keeps a routed one', () => {
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      const routedCleanup = vi.fn();
      mockHLProvider.subscribeToPublicTrades = vi
        .fn()
        .mockReturnValueOnce(hlCleanup)
        .mockReturnValueOnce(routedCleanup);
      mockLighterProvider.subscribeToPublicTrades = vi
        .fn()
        .mockReturnValue(lighterCleanup);
      const callback = vi.fn();

      const cleanup = aggregatedProvider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback,
      });
      const routed = aggregatedProvider.subscribeToPublicTrades({
        symbol: 'BTC',
        providerId: 'hyperliquid',
        callback,
      });

      aggregatedProvider.setDefaultProvider('lighter');

      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(routedCleanup).not.toHaveBeenCalled();
      expect(mockLighterProvider.subscribeToPublicTrades).toHaveBeenCalledWith({
        symbol: 'BTC',
        providerId: 'lighter',
        callback,
      });

      cleanup();
      routed();
      expect(lighterCleanup).toHaveBeenCalledTimes(1);
      expect(routedCleanup).toHaveBeenCalledTimes(1);
    });

    it('keeps an unrouted public-trades stream as a no-op when the new default has no public trade feed', () => {
      const hlCleanup = vi.fn();
      mockHLProvider.subscribeToPublicTrades = vi
        .fn()
        .mockReturnValue(hlCleanup);
      const callback = vi.fn();

      const cleanup = aggregatedProvider.subscribeToPublicTrades({
        symbol: 'BTC',
        callback,
      });
      aggregatedProvider.setDefaultProvider('lighter');
      cleanup();

      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(callback).not.toHaveBeenCalled();
    });

    it('resolves an unrouted public-trades read to an empty list when the default changes in flight', async () => {
      const trade = {
        id: '1',
        symbol: 'BTC',
        price: '50000',
        size: '0.1',
        side: 'buy' as const,
        timestamp: 1000,
        providerId: 'hyperliquid' as const,
      };
      const pendingReads: ((trades: (typeof trade)[]) => void)[] = [];
      mockHLProvider.getPublicTrades = vi.fn(
        async () =>
          new Promise<(typeof trade)[]>((resolve) => {
            pendingReads.push(resolve);
          }),
      );

      const unrouted = aggregatedProvider.getPublicTrades({ symbol: 'BTC' });
      const routedRead = aggregatedProvider.getPublicTrades({
        symbol: 'BTC',
        providerId: 'hyperliquid',
      });
      aggregatedProvider.setDefaultProvider('lighter');
      pendingReads.forEach((resolve) => resolve([trade]));

      expect(await unrouted).toStrictEqual([]);
      expect(await routedRead).toStrictEqual([trade]);
    });

    it('moves an OI-caps subscription to the new venue when the default changes', () => {
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      mockHLProvider.subscribeToOICaps.mockReturnValue(hlCleanup);
      mockLighterProvider.subscribeToOICaps.mockReturnValue(lighterCleanup);
      const callback = vi.fn();

      const cleanup = aggregatedProvider.subscribeToOICaps({ callback });
      expect(mockHLProvider.subscribeToOICaps).toHaveBeenCalledTimes(1);

      aggregatedProvider.setDefaultProvider('lighter');

      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToOICaps).toHaveBeenCalledTimes(1);

      cleanup();
      expect(lighterCleanup).toHaveBeenCalledTimes(1);
    });

    it('continues rerouting after one subscription throws and retries it later', () => {
      mockHLProvider.subscribeToOICaps.mockReturnValue(vi.fn());
      mockLighterProvider.subscribeToOICaps.mockReturnValue(vi.fn());
      mockHLProvider.subscribeToCandles.mockReturnValue(vi.fn());
      const candleCleanup = vi.fn();
      mockLighterProvider.subscribeToCandles
        .mockImplementationOnce(() => {
          throw new Error('CLIENT_NOT_INITIALIZED');
        })
        .mockReturnValueOnce(candleCleanup);

      aggregatedProvider.subscribeToOICaps({ callback: vi.fn() });
      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
      });

      aggregatedProvider.setDefaultProvider('lighter');

      // The OI-caps stream still moved even though candles threw, and the
      // failure was reported rather than aborting the loop.
      expect(mockLighterProvider.subscribeToOICaps).toHaveBeenCalledTimes(1);
      expect(mockInfrastructure.logger.error).toHaveBeenCalledTimes(1);

      // A later call retries only the failed candles stream.
      aggregatedProvider.setDefaultProvider('lighter');
      expect(mockLighterProvider.subscribeToCandles).toHaveBeenCalledTimes(2);
      expect(mockLighterProvider.subscribeToOICaps).toHaveBeenCalledTimes(1);
    });

    it('continues rerouting after the previous venue fails to unsubscribe', () => {
      const hlCandleCleanup = vi.fn(() => {
        throw new Error('unsubscribe failed');
      });
      const lighterCandleCleanup = vi.fn();
      mockHLProvider.subscribeToCandles.mockReturnValue(hlCandleCleanup);
      mockLighterProvider.subscribeToCandles.mockReturnValue(
        lighterCandleCleanup,
      );
      mockHLProvider.subscribeToOICaps.mockReturnValue(vi.fn());
      mockLighterProvider.subscribeToOICaps.mockReturnValue(vi.fn());

      const candleCleanup = aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
      });
      aggregatedProvider.subscribeToOICaps({ callback: vi.fn() });

      expect(() =>
        aggregatedProvider.setDefaultProvider('lighter'),
      ).not.toThrow();

      expect(mockLighterProvider.subscribeToCandles).toHaveBeenCalledTimes(1);
      expect(mockLighterProvider.subscribeToOICaps).toHaveBeenCalledTimes(1);
      expect(mockInfrastructure.logger.error).toHaveBeenCalledTimes(1);

      candleCleanup();
      expect(lighterCandleCleanup).toHaveBeenCalledTimes(1);
      expect(hlCandleCleanup).toHaveBeenCalledTimes(1);
    });

    it('moves a connection-state listener to the new venue and detaches the old one', () => {
      const hlCleanup = vi.fn();
      const lighterCleanup = vi.fn();
      const hlSubscribe = vi.fn().mockImplementation((subscriber) => {
        subscriber(WebSocketConnectionState.Connected, 0);
        return hlCleanup;
      });
      const lighterSubscribe = vi.fn().mockImplementation((subscriber) => {
        subscriber(WebSocketConnectionState.Connecting, 2);
        return lighterCleanup;
      });
      (
        mockHLProvider as MockPerpsProvider & {
          subscribeToConnectionState: Mock;
        }
      ).subscribeToConnectionState = hlSubscribe;
      (
        mockLighterProvider as MockPerpsProvider & {
          subscribeToConnectionState: Mock;
        }
      ).subscribeToConnectionState = lighterSubscribe;
      const listener = vi.fn();

      const cleanup = aggregatedProvider.subscribeToConnectionState(listener);
      expect(hlSubscribe).toHaveBeenCalledWith(listener);
      expect(listener).toHaveBeenLastCalledWith(
        WebSocketConnectionState.Connected,
        0,
      );

      aggregatedProvider.setDefaultProvider('lighter');

      // The old venue is detached, so its later transitions do not reach the
      // listener, and the new venue's current state is delivered.
      expect(hlCleanup).toHaveBeenCalledTimes(1);
      expect(lighterSubscribe).toHaveBeenCalledWith(listener);
      expect(listener).toHaveBeenLastCalledWith(
        WebSocketConnectionState.Connecting,
        2,
      );

      cleanup();
      expect(lighterCleanup).toHaveBeenCalledTimes(1);
    });

    it('is a no-op when the default does not change', () => {
      const hlCleanup = vi.fn();
      mockHLProvider.subscribeToCandles.mockReturnValue(hlCleanup);

      aggregatedProvider.subscribeToCandles({
        symbol: 'BTC',
        interval: CandlePeriod.OneHour,
        callback: vi.fn(),
      });
      aggregatedProvider.setDefaultProvider('hyperliquid');

      expect(hlCleanup).not.toHaveBeenCalled();
      expect(mockLighterProvider.subscribeToCandles).not.toHaveBeenCalled();
    });
  });

  describe('WebSocket', () => {
    it('delegates getWebSocketConnectionState to default provider', () => {
      // Arrange
      (
        mockHLProvider as MockPerpsProvider & {
          getWebSocketConnectionState: Mock;
        }
      ).getWebSocketConnectionState = vi
        .fn()
        .mockReturnValue(WebSocketConnectionState.Connected);

      // Act
      const result = aggregatedProvider.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Connected);
    });

    it('returns Disconnected when provider lacks getWebSocketConnectionState', () => {
      // Arrange — provider without the optional method
      const noWsProvider = createMockProvider('no-ws');
      const testProvider = new AggregatedPerpsProvider({
        providers: new Map([['no-ws' as PerpsProviderType, noWsProvider]]),
        defaultProvider: 'no-ws' as PerpsProviderType,
        infrastructure: mockInfrastructure,
      });

      // Act
      const result = testProvider.getWebSocketConnectionState();

      // Assert
      expect(result).toBe(WebSocketConnectionState.Disconnected);
    });

    it('delegates subscribeToConnectionState to default provider', () => {
      // Arrange
      const unsubscribe = vi.fn();
      (
        mockHLProvider as MockPerpsProvider & {
          subscribeToConnectionState: Mock;
        }
      ).subscribeToConnectionState = vi.fn().mockReturnValue(unsubscribe);
      const listener = vi.fn();

      // Act
      const cleanup = aggregatedProvider.subscribeToConnectionState(listener);

      // Assert
      expect(
        (
          mockHLProvider as MockPerpsProvider & {
            subscribeToConnectionState: Mock;
          }
        ).subscribeToConnectionState,
      ).toHaveBeenCalledWith(listener);
      cleanup();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('calls listener with Disconnected when provider lacks subscribeToConnectionState', () => {
      // Arrange
      const noWsProvider = createMockProvider('no-ws');
      const testProvider = new AggregatedPerpsProvider({
        providers: new Map([['no-ws' as PerpsProviderType, noWsProvider]]),
        defaultProvider: 'no-ws' as PerpsProviderType,
        infrastructure: mockInfrastructure,
      });
      const listener = vi.fn();

      // Act
      const cleanup = testProvider.subscribeToConnectionState(listener);
      cleanup();

      // Assert
      expect(listener).toHaveBeenCalledWith(
        WebSocketConnectionState.Disconnected,
        0,
      );
    });

    it('delegates reconnect to default provider', async () => {
      // Arrange
      (
        mockHLProvider as MockPerpsProvider & {
          reconnect: Mock;
        }
      ).reconnect = vi.fn().mockResolvedValue(undefined);

      // Act
      await aggregatedProvider.reconnect();

      // Assert
      expect(
        (
          mockHLProvider as MockPerpsProvider & {
            reconnect: Mock;
          }
        ).reconnect,
      ).toHaveBeenCalled();
    });

    it('does not throw when provider lacks reconnect', async () => {
      // Arrange — provider without reconnect
      const noWsProvider = createMockProvider('no-ws');
      const testProvider = new AggregatedPerpsProvider({
        providers: new Map([['no-ws' as PerpsProviderType, noWsProvider]]),
        defaultProvider: 'no-ws' as PerpsProviderType,
        infrastructure: mockInfrastructure,
      });

      // Act & Assert
      await expect(testProvider.reconnect()).resolves.toBeUndefined();
    });
  });
});
