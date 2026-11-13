import { describe, expect, it } from 'vitest';

import type { HyperLiquidPublicTrade } from '../../../src/types/hyperliquid-types.js';
import { adaptPublicTradesFromHyperLiquid } from '../../../src/utils/hyperLiquidAdapter.js';
import { adaptPublicTradesFromLighter } from '../../../src/utils/lighterAdapter.js';
import {
  buildPublicTrade,
  sortPublicTradesNewestFirst,
} from '../../../src/utils/publicTrades.js';
import type { PublicTradeFields } from '../../../src/utils/publicTrades.js';

const FIELDS: PublicTradeFields = {
  id: '7',
  symbol: 'BTC',
  price: '50000.5',
  size: '0.25',
  side: 'buy',
  timestamp: 1700000000000,
  txHash: '0xabc',
  providerId: 'hyperliquid',
};

describe('buildPublicTrade', () => {
  it('builds the shared trade shape', () => {
    expect(buildPublicTrade(FIELDS)).toStrictEqual({
      id: '7',
      symbol: 'BTC',
      price: '50000.5',
      size: '0.25',
      side: 'buy',
      timestamp: 1700000000000,
      txHash: '0xabc',
      providerId: 'hyperliquid',
    });
  });

  it('omits a missing transaction hash', () => {
    expect(
      buildPublicTrade({ ...FIELDS, txHash: undefined }),
    ).not.toHaveProperty('txHash');
  });

  it.each([
    ['an empty id', { id: '' }],
    ['a numeric id', { id: 7 }],
    ['a zero price', { price: '0' }],
    ['a negative size', { size: '-1' }],
    ['a non-decimal price', { price: '1e3' }],
    ['a numeric size', { size: 0.25 }],
    ['no side', { side: null }],
    ['a fractional timestamp', { timestamp: 1.5 }],
    ['a zero timestamp', { timestamp: 0 }],
    ['a string timestamp', { timestamp: '1700000000000' }],
  ])('rejects %s', (_case, override) => {
    expect(buildPublicTrade({ ...FIELDS, ...override })).toBeNull();
  });
});

describe('sortPublicTradesNewestFirst', () => {
  it('orders by timestamp descending without mutating the input', () => {
    const base = {
      symbol: 'BTC',
      price: '1',
      size: '1',
      side: 'buy' as const,
      providerId: 'lighter' as const,
    };
    const older = { ...base, id: '1', timestamp: 1 };
    const newer = { ...base, id: '2', timestamp: 2 };
    const input = [older, newer];

    expect(sortPublicTradesNewestFirst(input)).toStrictEqual([newer, older]);
    expect(input).toStrictEqual([older, newer]);
  });
});

describe('adaptPublicTradesFromHyperLiquid', () => {
  const sdkTrade = (
    overrides: Partial<HyperLiquidPublicTrade> = {},
  ): HyperLiquidPublicTrade => ({
    coin: 'BTC',
    side: 'B',
    px: '50000.5',
    sz: '0.25',
    time: 1000,
    hash: `0x${'ab'.repeat(32)}`,
    tid: 14439441413857,
    users: [
      '0x0000000000000000000000000000000000000001',
      '0x0000000000000000000000000000000000000002',
    ],
    ...overrides,
  });

  it('maps the coin, time and tid identity, price, size, aggressor side, time and hash, newest first', () => {
    const trades = adaptPublicTradesFromHyperLiquid(
      [sdkTrade(), sdkTrade({ side: 'A', tid: 2, time: 2000 })],
      'BTC',
    );

    expect(trades).toStrictEqual([
      {
        id: 'BTC:2000:2',
        symbol: 'BTC',
        price: '50000.5',
        size: '0.25',
        side: 'sell',
        timestamp: 2000,
        txHash: `0x${'ab'.repeat(32)}`,
        providerId: 'hyperliquid',
      },
      {
        id: 'BTC:1000:14439441413857',
        symbol: 'BTC',
        price: '50000.5',
        size: '0.25',
        side: 'buy',
        timestamp: 1000,
        txHash: `0x${'ab'.repeat(32)}`,
        providerId: 'hyperliquid',
      },
    ]);
  });

  it('gives a tid repeated at another block time a distinct id', () => {
    const trades = adaptPublicTradesFromHyperLiquid(
      [sdkTrade({ tid: 7, time: 1000 }), sdkTrade({ tid: 7, time: 2000 })],
      'BTC',
    );

    expect(trades.map((trade) => trade.id)).toStrictEqual([
      'BTC:2000:7',
      'BTC:1000:7',
    ]);
  });

  it('drops the zero hash the venue sends for trades without a transaction', () => {
    const [trade] = adaptPublicTradesFromHyperLiquid(
      [sdkTrade({ hash: `0x${'0'.repeat(64)}` })],
      'BTC',
    );

    expect(trade).not.toHaveProperty('txHash');
  });

  it('drops trades for another coin and malformed trades', () => {
    expect(
      adaptPublicTradesFromHyperLiquid(
        [
          sdkTrade({ coin: 'ETH' }),
          sdkTrade({ px: 'abc' }),
          // @ts-expect-error -- malformed venue payload: side outside 'A' | 'B'
          sdkTrade({ side: 'X' }),
          sdkTrade({ tid: undefined }),
        ],
        'BTC',
      ),
    ).toStrictEqual([]);
  });
});

describe('adaptPublicTradesFromLighter', () => {
  const venueTrade = (
    overrides: Record<string, unknown> = {},
  ): Record<string, unknown> => ({
    tradeId: 39702355148,
    tradeIdStr: '39702355148',
    txHash: 'd15b',
    marketId: 0,
    size: '1.3204',
    price: '2049.20',
    isMakerAsk: true,
    timestamp: 1000,
    ...overrides,
  });

  it('maps the trade id, a maker ask to a taker buy, and orders newest first', () => {
    const trades = adaptPublicTradesFromLighter(
      [
        venueTrade(),
        venueTrade({
          tradeId: 2,
          tradeIdStr: undefined,
          isMakerAsk: false,
          timestamp: 2000,
        }),
      ],
      0,
      'ETH',
    );

    expect(trades).toStrictEqual([
      {
        id: '2',
        symbol: 'ETH',
        price: '2049.20',
        size: '1.3204',
        side: 'sell',
        timestamp: 2000,
        txHash: 'd15b',
        providerId: 'lighter',
      },
      {
        id: '39702355148',
        symbol: 'ETH',
        price: '2049.20',
        size: '1.3204',
        side: 'buy',
        timestamp: 1000,
        txHash: 'd15b',
        providerId: 'lighter',
      },
    ]);
  });

  it('drops trades for another market and malformed entries', () => {
    expect(
      adaptPublicTradesFromLighter(
        [
          null,
          'trade',
          venueTrade({ marketId: 1 }),
          venueTrade({ isMakerAsk: 'yes' }),
          venueTrade({ tradeId: -1, tradeIdStr: undefined }),
          venueTrade({ size: '0' }),
          venueTrade({ txHash: 42, price: 'x' }),
        ],
        0,
        'ETH',
      ),
    ).toStrictEqual([]);
  });
});
