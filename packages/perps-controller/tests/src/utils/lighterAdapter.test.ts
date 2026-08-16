import type { MarketDataFormatters } from '../../../src/types/index.js';
import type {
  LighterApiOrder,
  LighterApiPosition,
  LighterOrderBookDetail,
  LighterOrderBookMeta,
  LighterSubAccount,
} from '../../../src/types/lighter-types.js';
import {
  adaptFillFromLighterTrade,
  adaptAccountStateFromLighter,
  adaptMarketDataFromLighter,
  adaptMarketFromLighter,
  adaptOrderFromLighter,
  adaptPositionFromLighter,
} from '../../../src/utils/lighterAdapter.js';

// Built per-test (jest resetMocks wipes module-scope jest.fn implementations).
const buildFormatters = (): MarketDataFormatters => ({
  formatPerpsFiat: (value: number) => `$${value.toFixed(2)}`,
  formatVolume: (value: number) => `$${value}`,
  formatPercentage: (percent: number) => `${percent.toFixed(2)}%`,
  priceRangesUniversal: [],
});

const btcMarket: LighterOrderBookMeta = {
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

describe('lighterAdapter', () => {
  describe('adaptMarketFromLighter', () => {
    it('maps market metadata onto MarketInfo', () => {
      const market = adaptMarketFromLighter(btcMarket);
      expect(market).toStrictEqual({
        name: 'BTC',
        szDecimals: 5,
        maxLeverage: expect.any(Number),
        marginTableId: 0,
        minimumOrderSize: 10,
        providerId: 'lighter',
      });
    });

    it('flags inactive markets as delisted', () => {
      const market = adaptMarketFromLighter({
        ...btcMarket,
        status: 'inactive',
      });
      expect(market.isDelisted).toBe(true);
    });
  });

  describe('adaptMarketDataFromLighter', () => {
    const detail: LighterOrderBookDetail = {
      ...btcMarket,
      lastTradePrice: 100000,
      dailyTradesCount: 1000,
      dailyBaseTokenVolume: 25,
      dailyQuoteTokenVolume: 2500000,
      dailyPriceLow: 95000,
      dailyPriceHigh: 101000,
      dailyPriceChange: 2.5,
      openInterest: 12345678,
      dailyChart: {},
    };

    it('maps market stats onto PerpsMarketData', () => {
      const data = adaptMarketDataFromLighter(detail, buildFormatters());
      expect(data.symbol).toBe('BTC');
      expect(data.price).toBe('$100000.00');
      expect(data.change24hPercent).toBe('+2.50%');
      expect(data.change24h.startsWith('+$')).toBe(true);
      expect(data.volume).toBe('$2500000');
      expect(data.openInterest).toBe('$12345678');
    });

    it('formats negative change with a minus prefix', () => {
      const data = adaptMarketDataFromLighter(
        { ...detail, dailyPriceChange: -3 },
        buildFormatters(),
      );
      expect(data.change24hPercent).toBe('-3.00%');
      expect(data.change24h.startsWith('-$')).toBe(true);
    });

    it('reports zero change as $0.00', () => {
      const data = adaptMarketDataFromLighter(
        { ...detail, dailyPriceChange: 0 },
        buildFormatters(),
      );
      expect(data.change24h).toBe('$0.00');
    });
  });

  describe('adaptPositionFromLighter', () => {
    const position: LighterApiPosition = {
      marketId: 1,
      symbol: 'BTC',
      initialMarginFraction: '20',
      openOrderCount: 0,
      sign: 1,
      position: '0.5',
      avgEntryPrice: '100000',
      positionValue: '50000',
      unrealizedPnl: '1000',
      realizedPnl: '0',
      liquidationPrice: '80000',
    };

    it('maps a long position', () => {
      const adapted = adaptPositionFromLighter(position);
      expect(adapted.symbol).toBe('BTC');
      expect(adapted.size).toBe('0.5');
      expect(adapted.entryPrice).toBe('100000');
      expect(adapted.leverage.value).toBe(5);
      expect(adapted.marginUsed).toBe('10000');
      expect(adapted.liquidationPrice).toBe('80000');
      expect(adapted.providerId).toBe('lighter');
    });

    it('negates size for short positions', () => {
      const adapted = adaptPositionFromLighter({ ...position, sign: -1 });
      expect(adapted.size).toBe('-0.5');
    });

    it('returns null liquidation price when zero', () => {
      const adapted = adaptPositionFromLighter({
        ...position,
        liquidationPrice: '0',
      });
      expect(adapted.liquidationPrice).toBeNull();
    });
  });

  describe('adaptAccountStateFromLighter', () => {
    const account: LighterSubAccount = {
      code: 0,
      accountType: 0,
      index: 28,
      l1Address: '0xabc',
      cancelAllTime: 0,
      totalOrderCount: 0,
      pendingOrderCount: 0,
      status: 1,
      collateral: '10000',
      availableBalance: '8000',
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

    it('maps collateral and balances', () => {
      const state = adaptAccountStateFromLighter(account);
      expect(state.totalBalance).toBe('10500');
      expect(state.spendableBalance).toBe('8000');
      expect(state.withdrawableBalance).toBe('8000');
      expect(state.marginUsed).toBe('2000');
      expect(state.unrealizedPnl).toBe('500');
      expect(state.providerId).toBe('lighter');
    });

    it('handles accounts with no positions', () => {
      const state = adaptAccountStateFromLighter({
        ...account,
        positions: undefined,
      });
      expect(state.unrealizedPnl).toBe('0');
      expect(state.totalBalance).toBe('10000');
    });
  });

  describe('adaptFillFromLighterTrade', () => {
    // Captured verbatim from GET /api/v1/trades on testnet account 28
    // (2026-08-16, camelized) — the fixture the REST and WebSocket fill
    // paths must both adapt identically.
    const REAL_TRADE = {
      tradeId: 9509524,
      txHash:
        '32e18fe51086d7496a29a8e6d5cf2e66056a1f6f1ee1c7e67214b8f5b607e35d720a7aa65850e9b1',
      type: 'trade',
      marketId: 2,
      size: '0.133',
      price: '75.180',
      usdAmount: '9.998940',
      askId: 844424944383120,
      bidId: 1125899892620735,
      askAccountId: 28,
      bidAccountId: 7,
      isMakerAsk: false,
      timestamp: 1786878754951,
      askAccountPnl: '-0.012901',
    };

    it('adapts the real venue payload with per-side pnl and Buy/Sell direction', () => {
      const fill = adaptFillFromLighterTrade(REAL_TRADE, 'SOL', 28);
      expect(fill).toMatchObject({
        orderId: '844424944383120',
        symbol: 'SOL',
        side: 'sell',
        direction: 'Sell',
        size: '0.133',
        price: '75.180',
        pnl: '-0.012901',
        // Account 28 was the taker (isMakerAsk false, account is ask); no
        // fee fields in the payload → venue-true zero.
        fee: '0',
        feeToken: 'USDC',
        timestamp: 1786878754951,
      });
    });

    it('adapts the counterparty perspective with Buy direction and its own pnl default', () => {
      const fill = adaptFillFromLighterTrade(REAL_TRADE, 'SOL', 7);
      expect(fill.side).toBe('buy');
      expect(fill.direction).toBe('Buy');
      expect(fill.orderId).toBe('1125899892620735');
      expect(fill.pnl).toBe('0');
    });

    it('applies the side-appropriate fee when the venue includes fees', () => {
      const withFees = {
        ...REAL_TRADE,
        takerFee: '0.0450',
        makerFee: '0.0150',
      };
      // Account 28 = ask, isMakerAsk false → taker.
      expect(adaptFillFromLighterTrade(withFees, 'SOL', 28).fee).toBe('0.0450');
      // Account 7 = bid → maker in this trade.
      expect(adaptFillFromLighterTrade(withFees, 'SOL', 7).fee).toBe('0.0150');
    });
  });

  describe('adaptOrderFromLighter', () => {
    const order: LighterApiOrder = {
      orderIndex: 12345,
      clientOrderIndex: 999,
      marketIndex: 1,
      ownerAccountIndex: 28,
      initialBaseAmount: '0.5',
      remainingBaseAmount: '0.3',
      price: '90000',
      isAsk: false,
      type: 'limit',
      timeInForce: 'good-till-time',
      reduceOnly: 0,
      status: 'open',
      orderExpiry: 0,
      timestamp: 1700000000000,
    };

    it('maps an open limit buy order', () => {
      const adapted = adaptOrderFromLighter(order, 'BTC');
      expect(adapted).toMatchObject({
        orderId: '12345',
        symbol: 'BTC',
        side: 'buy',
        orderType: 'limit',
        price: '90000',
        originalSize: '0.5',
        remainingSize: '0.3',
        status: 'open',
        providerId: 'lighter',
      });
      expect(parseFloat(adapted.filledSize)).toBeCloseTo(0.2, 10);
    });

    it('maps ask orders to sell side', () => {
      const adapted = adaptOrderFromLighter({ ...order, isAsk: true }, 'BTC');
      expect(adapted.side).toBe('sell');
    });

    it('normalizes canceled statuses', () => {
      const adapted = adaptOrderFromLighter(
        { ...order, status: 'canceled-post-only' },
        'BTC',
      );
      expect(adapted.status).toBe('canceled');
    });

    it('normalizes filled status', () => {
      const adapted = adaptOrderFromLighter(
        { ...order, status: 'filled' },
        'BTC',
      );
      expect(adapted.status).toBe('filled');
    });
  });
});
