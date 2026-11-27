import { QueryClient } from '@tanstack/query-core';
import { describe, expect, it, vi } from 'vitest';

import {
  applyLiveTokenFiat,
  applyMarketStatsPrices,
  subscribeLiveQuotes,
  liveFiatDelta,
  liveGroupFiatAdjustments,
  liveHoldingFiat,
  marketStatsAssetKey,
  marketStatsQueryKey,
  quotesFor,
  readLiveQuotes,
  shareMarketStatsData,
} from './utils.js';
import type { LivePriceMap, MarketStatsQuoteHandlers } from './utils.js';

const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
const USDC_LOWER = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_CHECKSUM =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const PEPE_LOWER = 'eip155:1/erc20:0x6982508145454ce325ddbe47a25d4ec3d2311933';
const PEPE_CHECKSUM =
  'eip155:1/erc20:0x6982508145454Ce325dDbE47a25d4ec3d2311933';

const EMPTY: LivePriceMap = new Map();

describe('marketStatsQueryKey', () => {
  it('keys a currency without regard to case', () => {
    expect(marketStatsQueryKey('USD')).toStrictEqual([
      'market-stats',
      'quotes',
      'usd',
    ]);
  });
});

describe('quotesFor', () => {
  it('returns one shared empty map when the cache has no entry', () => {
    const cache = new QueryClient();
    const first = quotesFor(cache, 'usd');
    const second = quotesFor(cache, 'eur');

    expect(first.size).toBe(0);
    expect(first).toBe(second);
  });

  it('returns the map stored in the cache', () => {
    const stored: LivePriceMap = new Map([[SOL, { price: 1 }]]);

    const cache = new QueryClient();
    cache.setQueryData(marketStatsQueryKey('usd'), stored);

    expect(quotesFor(cache, 'usd')).toBe(stored);
  });
});

describe('readLiveQuotes', () => {
  it('returns quotes in the requested order and undefined for a missing id', () => {
    const quotes: LivePriceMap = new Map([[SOL, { price: 87 }]]);

    expect(
      readLiveQuotes(quotes, [undefined, SOL, USDC_CHECKSUM]),
    ).toStrictEqual([undefined, { price: 87 }, undefined]);
  });

  it('returns one shared empty array when no assets are requested', () => {
    const quotes: LivePriceMap = new Map([[SOL, { price: 87 }]]);

    expect(readLiveQuotes(quotes, [])).toBe(readLiveQuotes(EMPTY, []));
  });
});

describe('shareMarketStatsData', () => {
  it('keeps the previous list when every quote is the same object', () => {
    const quote = { price: 10 };
    const previous = [quote, undefined];
    const next = [quote, undefined];

    expect(shareMarketStatsData(previous, next)).toBe(previous);
  });

  it('returns the next list when a quote object changed', () => {
    const previous = [{ price: 10 }];
    const next = [{ price: 11 }];

    expect(shareMarketStatsData(previous, next)).toBe(next);
  });

  it('returns the next quote map', () => {
    const previous = new Map([[SOL, { price: 10 }]]);
    const next = new Map([[SOL, { price: 10 }]]);

    expect(shareMarketStatsData(previous, next)).toBe(next);
  });
});

describe('applyMarketStatsPrices', () => {
  it.each([
    undefined,
    null,
    42,
    'text',
    [],
    {},
    { updates: 'nope', removed: 7 },
    { updates: [null, 3, 'x', [], {}] },
  ])('returns the same map for a payload it cannot read: %j', (payload) => {
    expect(applyMarketStatsPrices(EMPTY, 'usd', payload)).toBe(EMPTY);
  });

  it('skips a bad entry and keeps the good ones', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [
        null,
        { assetId: '', currency: 'usd', price: 1 },
        { assetId: SOL, currency: 'usd', price: 'not a number' },
        { assetId: SOL, currency: 7, price: 1 },
        { assetId: SOL, currency: 'usd', price: '12.5', unexpected: true },
      ],
    });

    expect(quotes.get(SOL)).toStrictEqual({ price: 12.5 });
    expect(quotes.size).toBe(1);
  });

  it('uses one list when the other is malformed', () => {
    const existing: LivePriceMap = new Map([[SOL, { price: 1 }]]);

    expect(
      applyMarketStatsPrices(existing, 'usd', {
        updates: 'nope',
        removed: [{ assetId: SOL, currency: 'usd' }],
      }).size,
    ).toBe(0);
    expect(
      applyMarketStatsPrices(EMPTY, 'usd', {
        updates: [{ assetId: SOL, currency: 'usd', price: 2 }],
        removed: 'nope',
      }).get(SOL),
    ).toStrictEqual({ price: 2 });
  });

  it('drops an unreadable percent change and keeps the price', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [
        {
          assetId: SOL,
          currency: 'usd',
          price: 3,
          pricePercentChange1d: Number.POSITIVE_INFINITY,
        },
      ],
    });

    expect(quotes.get(SOL)).toStrictEqual({ price: 3 });
  });

  it('does not change the payload it reads', () => {
    const payload = {
      updates: [{ assetId: SOL, currency: 'usd', price: '9' }],
    };

    applyMarketStatsPrices(EMPTY, 'usd', payload);

    expect(payload).toStrictEqual({
      updates: [{ assetId: SOL, currency: 'usd', price: '9' }],
    });
  });

  it('keys an EVM ERC-20 id in lowercase and finds it from a checksummed id', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [
        {
          assetId: USDC_LOWER,
          currency: 'usd',
          price: 1.01,
          pricePercentChange1d: 0.4,
        },
      ],
    });

    expect(marketStatsAssetKey(USDC_CHECKSUM)).toBe(USDC_LOWER);
    expect(quotes.get(USDC_LOWER)).toStrictEqual({
      price: 1.01,
      pricePercentChange1d: 0.4,
    });
    expect(readLiveQuotes(quotes, [USDC_CHECKSUM])).toStrictEqual([
      {
        price: 1.01,
        pricePercentChange1d: 0.4,
      },
    ]);
  });

  it('matches a checksummed list id to a lowercased tick', () => {
    expect(marketStatsAssetKey(PEPE_CHECKSUM)).toBe(PEPE_LOWER);
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [
        {
          assetId: PEPE_LOWER,
          currency: 'usd',
          price: 0.0000042,
          pricePercentChange1d: 1.2,
        },
      ],
    });

    expect(readLiveQuotes(quotes, [PEPE_CHECKSUM])).toStrictEqual([
      {
        price: 0.0000042,
        pricePercentChange1d: 1.2,
      },
    ]);
  });

  it('leaves an id that is not an EVM CAIP asset unchanged', () => {
    const raw = 'not-caip/0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

    expect(marketStatsAssetKey(raw)).toBe(raw);
  });

  it('keeps a non-EVM id as given', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [
        {
          assetId: SOL,
          currency: 'usd',
          price: '87.5',
          pricePercentChange1d: null,
        },
      ],
    });

    expect(quotes.get(SOL)).toStrictEqual({ price: 87.5 });
  });

  it('drops an update in another currency', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [{ assetId: SOL, currency: 'eur', price: 80 }],
    });

    expect(quotes).toBe(EMPTY);
  });

  it('reads a price whose currency differs only by case', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [{ assetId: SOL, currency: 'USD', price: 10 }],
    });

    expect(quotes.get(SOL)).toStrictEqual({ price: 10 });
  });

  it('ignores an argument list instead of the published object', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', [
      { updates: [{ assetId: SOL, currency: 'usd', price: 10 }] },
    ]);

    expect(quotes).toBe(EMPTY);
  });

  it('returns the same map when the tick does not change a quote', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [{ assetId: SOL, currency: 'usd', price: 10 }],
    });

    expect(
      applyMarketStatsPrices(quotes, 'usd', {
        updates: [{ assetId: SOL, currency: 'usd', price: 10 }],
      }),
    ).toBe(quotes);
  });

  it('ignores a payload that is not a price batch', () => {
    expect(
      applyMarketStatsPrices(EMPTY, 'usd', { prices: { [SOL]: { price: 1 } } }),
    ).toBe(EMPTY);
  });

  it('drops a quote whose channel closed and keeps one in another currency', () => {
    const quotes = applyMarketStatsPrices(EMPTY, 'usd', {
      updates: [
        { assetId: USDC_LOWER, currency: 'usd', price: 1 },
        { assetId: SOL, currency: 'usd', price: 80 },
      ],
    });

    const dropped = applyMarketStatsPrices(quotes, 'usd', {
      updates: [],
      removed: [
        { assetId: USDC_CHECKSUM, currency: 'USD' },
        { assetId: SOL, currency: 'eur' },
      ],
    });

    expect(dropped.get(USDC_LOWER)).toBeUndefined();
    expect(dropped.get(SOL)).toStrictEqual({ price: 80 });
    expect(
      applyMarketStatsPrices(dropped, 'usd', {
        updates: [],
        removed: [{ assetId: USDC_LOWER, currency: 'usd' }],
      }),
    ).toBe(dropped);
  });
});

describe('subscribeLiveQuotes', () => {
  it('writes a changed tick and skips one that leaves the map as it is', async () => {
    const cache = new QueryClient();
    const setQueryData = vi.spyOn(cache, 'setQueryData');
    let handlers: MarketStatsQuoteHandlers | undefined;
    const unsubscribe = vi.fn();

    const stop = subscribeLiveQuotes({
      queryClient: cache,
      currency: 'usd',
      subscribe: (next) => {
        handlers = next;
        return unsubscribe;
      },
    });

    handlers?.onPricesUpdated({
      updates: [{ assetId: SOL, currency: 'usd', price: 10 }],
    });
    expect(quotesFor(cache, 'usd').get(SOL)).toStrictEqual({ price: 10 });

    handlers?.onPricesUpdated({
      updates: [{ assetId: SOL, currency: 'usd', price: 10 }],
    });
    expect(setQueryData).toHaveBeenCalledOnce();

    await Promise.resolve();
    stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('releases a subscribe that returns at once when the listener stops before it settles', async () => {
    const unsubscribe = vi.fn();

    const stop = subscribeLiveQuotes({
      queryClient: new QueryClient(),
      currency: 'usd',
      subscribe: () => unsubscribe,
    });

    stop();
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it('reads an extension argument list and a removed quote', () => {
    const cache = new QueryClient();
    let handlers: MarketStatsQuoteHandlers | undefined;

    subscribeLiveQuotes({
      queryClient: cache,
      currency: 'usd',
      subscribe: (next) => {
        handlers = next;
      },
    });

    handlers?.onPricesUpdated([
      {
        updates: [{ assetId: SOL, currency: 'usd', price: 11 }],
      },
    ]);
    expect(quotesFor(cache, 'usd').get(SOL)).toStrictEqual({ price: 11 });

    handlers?.onPricesUpdated([
      {
        updates: [{ assetId: SOL, currency: 'usd', price: 12 }],
      },
    ]);
    handlers?.onPricesUpdated([
      {
        updates: [],
        removed: [{ assetId: SOL, currency: 'usd' }],
      },
    ]);
    expect(quotesFor(cache, 'usd').get(SOL)).toBeUndefined();
  });

  it('releases a subscribe that resolves after the listener stopped', async () => {
    let resolveSubscribe: (unsubscribe: () => void) => void = () => undefined;
    const unsubscribe = vi.fn();

    const stop = subscribeLiveQuotes({
      queryClient: new QueryClient(),
      currency: 'usd',
      subscribe: () =>
        new Promise((resolve) => {
          resolveSubscribe = resolve;
        }),
    });

    stop();
    resolveSubscribe(unsubscribe);
    await Promise.resolve();

    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});

describe('liveHoldingFiat', () => {
  it('multiplies the token amount by the streamed unit price', () => {
    expect(liveHoldingFiat(0.00181, 2014.93)).toBeCloseTo(3.6470233);
  });

  it('returns undefined when the amount or the price is missing', () => {
    expect(liveHoldingFiat(undefined, 10)).toBeUndefined();
    expect(liveHoldingFiat(1, undefined)).toBeUndefined();
    expect(liveHoldingFiat(Number.NaN, 10)).toBeUndefined();
  });
});

describe('applyLiveTokenFiat', () => {
  it('replaces the fiat balance with balance times the streamed price', () => {
    const token = applyLiveTokenFiat(
      {
        balance: '2',
        tokenFiatAmount: 200,
        fiat: { balance: 200, conversionRate: 2400, currency: 'usd' },
      },
      150,
    );

    expect(token.tokenFiatAmount).toBe(300);
    expect(token.fiat?.balance).toBe(300);
    expect(token.fiat?.conversionRate).toBe(2400);
  });

  it('leaves the row unchanged when there is no streamed price', () => {
    const token = {
      balance: '2',
      tokenFiatAmount: 200,
    };

    expect(applyLiveTokenFiat(token, undefined)).toBe(token);
  });
});

describe('liveFiatDelta', () => {
  it('sums the difference between streamed and polled fiat balances', () => {
    const delta = liveFiatDelta(
      [{ balance: '2', fiat: { balance: 200 } }],
      new Map([['eip155:1/slip44:60', { price: 150 }]]),
      (): string => 'eip155:1/slip44:60',
    );

    expect(delta).toBe(100);
  });
});

describe('liveGroupFiatAdjustments', () => {
  const toAssetId = (): string => 'eip155:1/slip44:60';

  it('moves each account total by the streamed price difference', () => {
    const adjustments = liveGroupFiatAdjustments(
      {
        'wallet/0': {
          'eip155:1': [{ balance: '1', fiat: { balance: 38.02 } }],
        },
        'wallet/1': {
          'eip155:1': [{ balance: '2', fiat: { balance: 10 } }],
        },
      },
      new Map([['eip155:1/slip44:60', { price: 38 }]]),
      toAssetId,
    );

    expect(adjustments.get('wallet/0')).toBeCloseTo(-0.02);
    expect(adjustments.get('wallet/1')).toBe(66);
  });

  it('returns an empty map when nothing is streaming', () => {
    const adjustments = liveGroupFiatAdjustments(
      {
        'wallet/0': {
          'eip155:1': [{ balance: '1', fiat: { balance: 1 } }],
        },
      },
      new Map(),
      toAssetId,
    );

    expect(adjustments.size).toBe(0);
  });
});
