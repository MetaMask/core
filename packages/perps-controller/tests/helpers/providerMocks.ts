/* eslint-disable */
/**
 * Shared provider mocks for Perps tests
 * Provides reusable mock implementations for HyperLiquidProvider and related interfaces
 */
import { type HyperLiquidProvider } from '@metamask/perps-controller';

import { REFERRAL_CONFIG } from '../../src/constants/hyperLiquidConfig.js';

export const createMockHyperLiquidProvider =
  (): jest.Mocked<HyperLiquidProvider> =>
    ({
      protocolId: 'hyperliquid',
      initialize: jest.fn(),
      isReadyToTrade: jest.fn(),
      toggleTestnet: jest.fn(),
      getPositions: jest.fn(),
      getAccountState: jest.fn(),
      getHistoricalPortfolio: jest.fn().mockResolvedValue({
        totalBalance24hAgo: '10000',
        totalBalance7dAgo: '9500',
        totalBalance30dAgo: '9000',
      }),
      getMarkets: jest.fn(),
      getAccountSupport: jest.fn().mockResolvedValue({ isSupported: true }),
      getOrderCapabilities: jest.fn().mockResolvedValue({
        status: 'ready',
        providerId: 'hyperliquid',
        supportedStrategies: ['twap', 'scale', 'chase'],
      }),
      getScalePriceLadder: jest.fn().mockResolvedValue({
        status: 'ready',
        providerId: 'hyperliquid',
        prices: ['100', '150', '200'],
      }),
      placeOrder: jest.fn(),
      editOrder: jest.fn(),
      cancelOrder: jest.fn(),
      cancelOrders: jest.fn(),
      getTwapOrders: jest.fn().mockResolvedValue([]),
      getChaseOrders: jest.fn().mockResolvedValue([]),
      suspendChaseOrders: jest.fn().mockResolvedValue([]),
      closePosition: jest.fn(),
      closePositions: jest.fn(),
      withdraw: jest.fn(),
      getDepositRoutes: jest.fn(),
      getWithdrawalRoutes: jest.fn(),
      validateDeposit: jest.fn().mockResolvedValue({ isValid: true }),
      validateOrder: jest.fn().mockResolvedValue({ isValid: true }),
      validateClosePosition: jest.fn().mockResolvedValue({ isValid: true }),
      validateWithdrawal: jest.fn().mockResolvedValue({ isValid: true }),
      subscribeToPrices: jest.fn(),
      subscribeToPositions: jest.fn(),
      subscribeToOrderFills: jest.fn(),
      setLiveDataConfig: jest.fn(),
      disconnect: jest.fn(),
      updatePositionTPSL: jest.fn(),
      calculateLiquidationPrice: jest.fn(),
      calculateMaintenanceMargin: jest.fn(),
      getMaxLeverage: jest.fn(),
      calculateFees: jest.fn(),
      previewPositionModify: jest.fn(),
      getMarketDataWithPrices: jest.fn(),
      getBlockExplorerUrl: jest.fn(),
      getOrderFills: jest.fn(),
      getOrders: jest.fn(),
      getFunding: jest.fn(),
      getCurrentAccountId: jest
        .fn()
        .mockResolvedValue(
          'eip155:1:0x0000000000000000000000000000000000000001',
        ),
      getIsFirstTimeUser: jest.fn(),
      getOpenOrders: jest.fn(),
      subscribeToOrders: jest.fn(),
      subscribeToAccount: jest.fn(),
      setUserFeeDiscount: jest.fn(),
      // WebSocket connection state methods
      getWebSocketConnectionState: jest.fn(),
      subscribeToConnectionState: jest.fn().mockReturnValue(() => undefined),
      reconnect: jest.fn().mockResolvedValue(undefined),
    }) as unknown as jest.Mocked<HyperLiquidProvider>;

export const createMockOrder = (overrides = {}) => ({
  orderId: 'order-1',
  symbol: 'BTC',
  side: 'buy' as const,
  orderType: 'limit' as const,
  size: '0.1',
  originalSize: '0.1',
  price: '50000',
  filledSize: '0',
  remainingSize: '0.1',
  status: 'open' as const,
  timestamp: Date.now(),
  ...overrides,
});

export const createMockPosition = (overrides = {}) => ({
  symbol: 'BTC',
  size: '0.5',
  entryPrice: '50000',
  positionValue: '25000',
  unrealizedPnl: '100',
  marginUsed: '1000',
  leverage: { type: 'cross' as const, value: 25 },
  liquidationPrice: '48000',
  maxLeverage: 50,
  returnOnEquity: '10',
  cumulativeFunding: {
    allTime: '0',
    sinceOpen: '0',
    sinceChange: '0',
  },
  roi: '10',
  takeProfitPrice: undefined,
  stopLossPrice: undefined,
  takeProfitCount: 0,
  stopLossCount: 0,
  marketPrice: '50200',
  timestamp: Date.now(),
  ...overrides,
});

// HyperLiquid SDK info and exchange client mocks for provider tests.
/**
 * An order as HyperLiquid's `frontendOpenOrders` returns it.
 *
 * @param overrides - Fields that differ from a resting BTC limit buy.
 * @returns The open order.
 */
export function createFrontendOpenOrder(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    coin: 'BTC',
    side: 'B',
    limitPx: '49000',
    sz: '0.1',
    origSz: '0.1',
    oid: 123,
    timestamp: 1,
    orderType: 'Limit',
    tif: 'Gtc',
    isTrigger: false,
    triggerPx: '0',
    triggerCondition: 'N/A',
    reduceOnly: false,
    isPositionTpsl: false,
    cloid: null,
    children: [],
    ...overrides,
  };
}

export const createMockInfoClient = (
  overrides: Record<string, unknown> = {},
) => ({
  clearinghouseState: jest.fn().mockResolvedValue({
    marginSummary: {
      totalMarginUsed: '500',
      accountValue: '10500',
    },
    withdrawable: '9500',
    assetPositions: [
      {
        position: {
          coin: 'BTC',
          szi: '0.1',
          entryPx: '50000',
          positionValue: '5000',
          unrealizedPnl: '100',
          marginUsed: '500',
          leverage: { type: 'cross', value: 10 },
          liquidationPx: '45000',
          maxLeverage: 50,
          returnOnEquity: '20',
          cumFunding: { allTime: '10', sinceOpen: '5', sinceChange: '2' },
        },
        type: 'oneWay',
      },
      {
        position: {
          coin: 'ETH',
          szi: '1.5',
          entryPx: '3000',
          positionValue: '4500',
          unrealizedPnl: '50',
          marginUsed: '450',
          leverage: { type: 'cross', value: 10 },
          liquidationPx: '2700',
          maxLeverage: 50,
          returnOnEquity: '10',
          cumFunding: { allTime: '5', sinceOpen: '2', sinceChange: '1' },
        },
        type: 'oneWay',
      },
    ],
    crossMarginSummary: {
      accountValue: '10000',
      totalMarginUsed: '5000',
    },
  }),
  spotClearinghouseState: jest.fn().mockResolvedValue({
    balances: [{ coin: 'USDC', hold: '1000', total: '10000' }],
  }),
  // Mode-aware fold gate reads userAbstraction; default to unifiedAccount
  // so tests that predated the gate still see spot folded into spendable/withdrawable.
  userAbstraction: jest.fn().mockResolvedValue('unifiedAccount'),
  // Single-signer account by default; Hyperliquid returns null when the user
  // has no multi-sig signer set.
  userToMultiSigSigners: jest.fn().mockResolvedValue(null),
  meta: jest.fn().mockResolvedValue({
    universe: [
      { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
      { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
    ],
  }),
  metaAndAssetCtxs: jest.fn().mockResolvedValue([
    {
      universe: [
        { name: 'BTC', szDecimals: 3, maxLeverage: 50 },
        { name: 'ETH', szDecimals: 4, maxLeverage: 50 },
      ],
    },
    [
      {
        funding: '0.0001',
        openInterest: '1000',
        prevDayPx: '49000',
        dayNtlVlm: '1000000',
        markPx: '50000',
        midPx: '50000',
        oraclePx: '50000',
      },
      {
        funding: '0.0001',
        openInterest: '500',
        prevDayPx: '2900',
        dayNtlVlm: '500000',
        markPx: '3000',
        midPx: '3000',
        oraclePx: '3000',
      },
    ],
  ]),
  perpDexs: jest.fn().mockResolvedValue([null]),
  allMids: jest.fn().mockResolvedValue({ BTC: '50000', ETH: '3000' }),
  frontendOpenOrders: jest.fn().mockResolvedValue([]),
  referral: jest.fn().mockResolvedValue({
    referrerState: {
      stage: 'ready',
      data: { code: REFERRAL_CONFIG.MainnetCode },
    },
  }),
  maxBuilderFee: jest.fn().mockResolvedValue(1),
  userFees: jest.fn().mockResolvedValue({
    feeSchedule: {
      cross: '0.00030',
      add: '0.00010',
      spotCross: '0.00040',
      spotAdd: '0.00020',
    },
    dailyUserVlm: [],
  }),
  userNonFundingLedgerUpdates: jest.fn().mockResolvedValue([
    {
      delta: { type: 'deposit', usdc: '100' },
      time: Date.now(),
      hash: '0x123abc',
    },
    {
      delta: { type: 'withdraw', usdc: '50' },
      time: Date.now() - 3600000,
      hash: '0x456def',
    },
  ]),
  portfolio: jest.fn().mockResolvedValue([
    null,
    [
      null,
      {
        accountValueHistory: [
          [Date.now() - 86400000, '10000'], // 24h ago
          [Date.now() - 172800000, '9500'], // 48h ago
          [Date.now() - 259200000, '9000'], // 72h ago
        ],
      },
    ],
  ]),
  spotMeta: jest.fn().mockResolvedValue({
    tokens: [
      { name: 'USDC', tokenId: '0xdef456', index: 0 },
      { name: 'USDT', tokenId: '0x789abc', index: 1 },
    ],
    universe: [],
  }),
  historicalOrders: jest.fn().mockResolvedValue([]),
  userFills: jest.fn().mockResolvedValue([]),
  userFillsByTime: jest.fn().mockResolvedValue([]),
  userFunding: jest.fn().mockResolvedValue([]),
  ...overrides,
});

export const createMockExchangeClient = (
  overrides: Record<string, unknown> = {},
) => ({
  order: jest.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: [{ resting: { oid: 123 } }] } },
  }),
  modify: jest.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: [{ resting: { oid: '123' } }] } },
  }),
  cancel: jest.fn().mockResolvedValue({
    status: 'ok',
    response: { data: { statuses: ['success'] } },
  }),
  withdraw3: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  updateLeverage: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  updateIsolatedMargin: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  approveBuilderFee: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  setReferrer: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  sendAsset: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  agentSetAbstraction: jest.fn().mockResolvedValue({
    status: 'ok',
  }),
  ...overrides,
});
