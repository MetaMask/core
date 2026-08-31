import type { MarketDataFormatters } from '../../../src/types/index.js';
import type {
  LighterApiOrder,
  LighterApiPosition,
  LighterOrderBookDetail,
  LighterOrderBookMeta,
  LighterSubAccount,
  LighterWsUserStats,
} from '../../../src/types/lighter-types.js';
import {
  adaptFillFromLighterTrade,
  adaptAccountStateFromLighter,
  adaptAccountStateFromLighterUserStats,
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
      const market = adaptMarketFromLighter(btcMarket, 25);
      expect(market).toStrictEqual({
        name: 'BTC',
        szDecimals: 5,
        maxLeverage: 25,
        marginTableId: 0,
        minimumOrderSize: 10,
        providerId: 'lighter',
      });
    });

    it('flags inactive markets as delisted', () => {
      const market = adaptMarketFromLighter(
        {
          ...btcMarket,
          status: 'inactive',
        },
        25,
      );
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
      minInitialMarginFraction: 400,
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

    it('rejects market data without authoritative leverage metadata', () => {
      expect(() =>
        adaptMarketDataFromLighter(
          { ...detail, minInitialMarginFraction: undefined },
          buildFormatters(),
        ),
      ).toThrow('Invalid Lighter venue data');
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

    it('rejects malformed numeric position sizes at the adaptation boundary', () => {
      // The REST layer type-casts JSON without runtime validation; a
      // prefix-parsed '0.1oops' would become a canonical '0.1' that TP/SL
      // cover-sizing then signs. Runtime-cast cases (undefined/null/number)
      // and overflow exponents must ALL surface the data-integrity prefix,
      // never a generic TypeError that reads swallow into false-empty.
      const badSizes: unknown[] = [
        '0.1oops',
        'oops',
        '',
        undefined,
        null,
        0.1,
        '1e999',
      ];
      for (const badSize of badSizes) {
        expect(() =>
          adaptPositionFromLighter({
            ...position,
            position: badSize as string,
          }),
        ).toThrow('Invalid Lighter venue data');
      }
    });

    it('rejects negative magnitudes and malformed signs at the adaptation boundary', () => {
      // Documented representation: NONNEGATIVE magnitude + sign exactly
      // ±1. '-0.1' with sign 1 would flip the canonical direction, so a
      // close/TPSL would act OPPOSITE the real position; sign 0/2/'1'
      // would be silently coerced by a > 0 ternary.
      expect(() =>
        adaptPositionFromLighter({ ...position, position: '-0.1', sign: 1 }),
      ).toThrow('Invalid Lighter venue data');
      for (const badSign of [0, 2, -2, '1', null, undefined]) {
        expect(() =>
          adaptPositionFromLighter({
            ...position,
            sign: badSign as number,
          }),
        ).toThrow('Invalid Lighter venue data');
      }
      // The documented contract holds for FLAT positions too: sign must
      // still be exactly ±1 (zero magnitudes are filtered downstream).
      expect(() =>
        adaptPositionFromLighter({
          ...position,
          position: '0',
          sign: 0 as number,
        }),
      ).toThrow('Invalid Lighter venue data');
      expect(
        adaptPositionFromLighter({ ...position, position: '0', sign: 1 }).size,
      ).toBe('0');
    });

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

    it('maps the venue margin mode and defaults older captures to cross', () => {
      const isolated = adaptPositionFromLighter({
        ...position,
        marginMode: 1,
      });
      expect(isolated.leverage.type).toBe('isolated');

      const cross = adaptPositionFromLighter({ ...position, marginMode: 0 });
      expect(cross.leverage.type).toBe('cross');
      expect(adaptPositionFromLighter(position).leverage.type).toBe('cross');
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

    it.each([
      ['collateral', { collateral: '10000USD' }],
      ['available balance', { availableBalance: '8000oops' }],
      [
        'position unrealized PnL',
        {
          positions: [{ ...account.positions?.[0], unrealizedPnl: '500oops' }],
        },
      ],
    ])(
      'rejects malformed REST %s instead of prefix-parsing it',
      (_label, overrides) => {
        expect(() =>
          adaptAccountStateFromLighter({
            ...account,
            ...overrides,
          } as LighterSubAccount),
        ).toThrow('Invalid Lighter venue data');
      },
    );
  });

  describe('adaptAccountStateFromLighterUserStats', () => {
    const stats: LighterWsUserStats = {
      collateral: '10000',
      portfolioValue: '11000',
      leverage: '2',
      availableBalance: '6000',
      marginUsage: '40',
      buyingPower: '0',
    };

    it.each([
      ['collateral', { collateral: '10000USD' }],
      ['available balance', { availableBalance: '6000oops' }],
      ['portfolio value', { portfolioValue: '11000oops' }],
    ])('rejects malformed WebSocket %s', (_label, overrides) => {
      expect(() =>
        adaptAccountStateFromLighterUserStats({ ...stats, ...overrides }),
      ).toThrow('Invalid Lighter venue data');
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
      bidAccountPnl: '0',
      takerPositionSizeBefore: '0.133',
      takerPositionSignChanged: true,
      makerPositionSizeBefore: '0.000',
      makerPositionSignChanged: true,
    };

    it('adapts the real venue payload: a taker sell of the full position is Close Long', () => {
      const fill = adaptFillFromLighterTrade(REAL_TRADE, 'SOL', 28);
      expect(fill).toMatchObject({
        orderId: '844424944383120',
        symbol: 'SOL',
        side: 'sell',
        // Position before 0.133, sold 0.133, sign changed → closed a long.
        direction: 'Close Long',
        size: '0.133',
        price: '75.180',
        pnl: '-0.012901',
        // No fee fields in the payload → venue-true zero.
        fee: '0',
        feeToken: 'USDC',
        timestamp: 1786878754951,
      });
    });

    it('adapts the counterparty: a buy from a flat position is Open Long', () => {
      const fill = adaptFillFromLighterTrade(REAL_TRADE, 'SOL', 7);
      expect(fill.side).toBe('buy');
      expect(fill.direction).toBe('Open Long');
      expect(fill.orderId).toBe('1125899892620735');
      expect(fill.pnl).toBe('0');
    });

    it('derives buy-close, sell-open, flip, and side-only fallbacks', () => {
      // Buy that flattens a short: before 0.5, bought 0.5, sign changed.
      const buyClose = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          isMakerAsk: true,
          bidAccountId: 28,
          askAccountId: 7,
          takerPositionSizeBefore: '0.5',
          takerPositionSignChanged: true,
          size: '0.5',
          bidAccountPnl: '1.25',
        },
        'SOL',
        28,
      );
      expect(buyClose.direction).toBe('Close Short');
      expect(buyClose.pnl).toBe('1.25');

      // Sell from flat opens a short even with zero pnl.
      const sellOpen = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          takerPositionSizeBefore: '0.000',
          takerPositionSignChanged: true,
          askAccountPnl: '0',
        },
        'SOL',
        28,
      );
      expect(sellOpen.direction).toBe('Open Short');

      // Selling more than the long flips it.
      const flip = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          size: '0.300',
          takerPositionSizeBefore: '0.133',
          takerPositionSignChanged: true,
        },
        'SOL',
        28,
      );
      expect(flip.direction).toBe('Long > Short');

      expect(() =>
        adaptFillFromLighterTrade(
          {
            ...REAL_TRADE,
            takerPositionSizeBefore: undefined,
            takerPositionSignChanged: undefined,
          },
          'SOL',
          28,
        ),
      ).toThrow('Invalid Lighter venue data');
    });

    it('a nonzero-pnl partial reduce without sign change is a close', () => {
      const partial = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          size: '0.050',
          takerPositionSizeBefore: '0.133',
          takerPositionSignChanged: false,
          askAccountPnl: '0.5',
        },
        'SOL',
        28,
      );
      expect(partial.direction).toBe('Close Long');
      expect(partial.startPosition).toBe('0.133');
    });

    it('an exactly break-even partial without sign change falls back to side-only', () => {
      // Zero pnl + no sign change is genuinely ambiguous from this payload
      // (break-even partial close and an add both fit) — never assert Open
      // without evidence.
      const ambiguous = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          size: '0.050',
          takerPositionSizeBefore: '0.133',
          takerPositionSignChanged: false,
          askAccountPnl: '0',
        },
        'SOL',
        28,
      );
      expect(ambiguous.direction).toBe('Sell');
      expect(ambiguous.startPosition).toBeUndefined();
    });

    it('flips carry a SIGNED startPosition for post-flip sizing', () => {
      // Long 0.133 flipped by selling 0.300 → Long > Short, start +0.133.
      const longToShort = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          size: '0.300',
          takerPositionSizeBefore: '0.133',
          takerPositionSignChanged: true,
        },
        'SOL',
        28,
      );
      expect(longToShort.direction).toBe('Long > Short');
      expect(longToShort.startPosition).toBe('0.133');

      // Short 0.133 flipped by buying 0.300 → Short > Long, start -0.133.
      const shortToLong = adaptFillFromLighterTrade(
        {
          ...REAL_TRADE,
          isMakerAsk: true,
          bidAccountId: 28,
          askAccountId: 7,
          size: '0.300',
          takerPositionSizeBefore: '0.133',
          takerPositionSignChanged: true,
          bidAccountPnl: '0.7',
        },
        'SOL',
        28,
      );
      expect(shortToLong.direction).toBe('Short > Long');
      expect(shortToLong.startPosition).toBe('-0.133');
    });

    it('refuses nonzero fees loudly instead of coercing them to zero', () => {
      // Standard accounts pay zero fees (the provider gates Premium); a
      // present nonzero fee has an unverified wire unit and silently
      // showing $0 would be financially false.
      for (const takerFee of [45000, '45000', '0.0450'] as const) {
        expect(() =>
          adaptFillFromLighterTrade({ ...REAL_TRADE, takerFee }, 'SOL', 28),
        ).toThrow('fee unit is unverified');
      }
      // Explicit zeros (any representation) are venue truth.
      expect(
        adaptFillFromLighterTrade(
          { ...REAL_TRADE, takerFee: 0, makerFee: '0.0000' },
          'SOL',
          28,
        ).fee,
      ).toBe('0');
    });

    it('rejects missing maker role instead of manufacturing neutral history', () => {
      const roleless = {
        ...REAL_TRADE,
        isMakerAsk: undefined,
      };
      expect(() => adaptFillFromLighterTrade(roleless, 'SOL', 28)).toThrow(
        'Invalid Lighter venue data',
      );
    });

    it('rejects missing account pnl instead of manufacturing zero', () => {
      expect(() =>
        adaptFillFromLighterTrade(
          { ...REAL_TRADE, askAccountPnl: undefined },
          'SOL',
          28,
        ),
      ).toThrow('Invalid Lighter venue data');
    });

    it('keeps a Standard fill whose Premium counterparty paid the fee', () => {
      // Account 28 is the taker; the MAKER (counterparty) fee being nonzero
      // must not drop our valid zero-fee fill.
      const counterpartyFee = {
        ...REAL_TRADE,
        takerFee: 0,
        makerFee: 45000,
      };
      const fill = adaptFillFromLighterTrade(counterpartyFee, 'SOL', 28);
      expect(fill.fee).toBe('0');
      expect(fill.direction).toBe('Close Long');
    });

    it.each([null, false, 'not-a-fee', '1e999'])(
      'rejects malformed counterparty fee %p while preserving valid nonzero counterparty fees',
      (makerFee) => {
        expect(() =>
          adaptFillFromLighterTrade(
            { ...REAL_TRADE, takerFee: 0, makerFee },
            'SOL',
            28,
          ),
        ).toThrow('Invalid Lighter venue data');
      },
    );

    it.each([
      ['size', { size: '1e999' }],
      ['price', { price: '75oops' }],
      ['pnl', { askAccountPnl: '1e999' }],
      ['position context', { takerPositionSizeBefore: '1e999' }],
      ['fee', { takerFee: 'fee-free' }],
    ])('rejects malformed or non-finite %s', (_field, overrides) => {
      expect(() =>
        adaptFillFromLighterTrade({ ...REAL_TRADE, ...overrides }, 'SOL', 28),
      ).toThrow('Invalid Lighter venue data');
    });

    it('rejects an account that did not participate in the trade', () => {
      expect(() => adaptFillFromLighterTrade(REAL_TRADE, 'SOL', 999)).toThrow(
        'Invalid Lighter venue data',
      );
    });

    it.each([
      ['wrong maker role type', { isMakerAsk: 1 }],
      ['null fee', { takerFee: null }],
      ['unsafe trade id', { tradeId: Number.MAX_SAFE_INTEGER + 1 }],
      ['negative market id', { marketId: -1 }],
      ['negative ask id', { askId: -1 }],
      ['unsafe bid id', { bidId: Number.MAX_SAFE_INTEGER + 1 }],
    ])('rejects %s at the raw fill boundary', (_field, overrides) => {
      expect(() =>
        adaptFillFromLighterTrade({ ...REAL_TRADE, ...overrides }, 'SOL', 28),
      ).toThrow('Invalid Lighter venue data');
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

    it('maps the trigger LEVEL separately from the execution price on trigger orders', () => {
      // Live venue payload: `price` on a take-profit is the ±5% protection
      // EXECUTION price (107.265), while the user's TP level is
      // `triggerPrice` (112.911). Confusing them shows the wrong number in
      // every TP/SL surface.
      const adapted = adaptOrderFromLighter(
        {
          ...order,
          type: 'take-profit',
          isAsk: true,
          reduceOnly: 1,
          price: '107.265',
          triggerPrice: '112.911',
        },
        'SOL',
      );
      expect(adapted.isTrigger).toBe(true);
      expect(adapted.price).toBe('107.265');
      expect(adapted.triggerPrice).toBe('112.911');
    });

    it('maps semantic trigger order types instead of generic limit', () => {
      const cases = [
        {
          type: 'take-profit',
          orderType: 'market',
          triggerOrderType: 'take_profit_market',
          detailed: 'Take Profit Market',
        },
        {
          type: 'stop-loss',
          orderType: 'market',
          triggerOrderType: 'stop_market',
          detailed: 'Stop Market',
        },
        {
          type: 'take-profit-limit',
          orderType: 'limit',
          triggerOrderType: 'take_profit_limit',
          detailed: 'Take Profit Limit',
        },
        {
          type: 'stop-loss-limit',
          orderType: 'limit',
          triggerOrderType: 'stop_limit',
          detailed: 'Stop Limit',
        },
      ] as const;
      for (const testCase of cases) {
        const adapted = adaptOrderFromLighter(
          { ...order, type: testCase.type, triggerPrice: '110000' },
          'BTC',
        );
        expect(adapted.orderType).toBe(testCase.orderType);
        expect(adapted.triggerOrderType).toBe(testCase.triggerOrderType);
        expect(adapted.detailedOrderType).toBe(testCase.detailed);
      }
      // Plain orders stay untyped.
      const plain = adaptOrderFromLighter(order, 'BTC');
      expect(plain.triggerOrderType).toBeUndefined();
      expect(plain.detailedOrderType).toBeUndefined();
    });

    it('omits triggerPrice on non-trigger orders and zero venue values', () => {
      expect(adaptOrderFromLighter(order, 'BTC').triggerPrice).toBeUndefined();
      expect(
        adaptOrderFromLighter({ ...order, triggerPrice: '0' }, 'BTC')
          .triggerPrice,
      ).toBeUndefined();
    });

    it.each([
      'canceled',
      'cancelled',
      'canceled-post-only',
      'canceled-reduce-only',
      'canceled-position-not-allowed',
      'canceled-margin-not-allowed',
      'canceled-too-much-slippage',
      'canceled-not-enough-liquidity',
      'canceled-self-trade',
      'canceled-expired',
      'canceled-oco',
      'canceled-child',
      'canceled-liquidation',
      'canceled-invalid-balance',
    ])('normalizes terminal status %s', (status) => {
      expect(adaptOrderFromLighter({ ...order, status }, 'BTC').status).toBe(
        'canceled',
      );
    });

    it('normalizes filled status', () => {
      const adapted = adaptOrderFromLighter(
        { ...order, status: 'filled' },
        'BTC',
      );
      expect(adapted.status).toBe('filled');
    });

    it('fails closed for an unknown order status', () => {
      expect(() =>
        adaptOrderFromLighter({ ...order, status: 'venue-added-state' }, 'BTC'),
      ).toThrow('Invalid Lighter venue data');
    });
  });
});
