import { describe, expect, it } from 'vitest';

import { parseMarketStatsBatch, parseMarketStatsChannel } from './normalize.js';

describe('parseMarketStatsBatch', () => {
  it('reads the rows the gateway sends', () => {
    expect(
      parseMarketStatsBatch([
        {
          assetId: 'eip155:1/slip44:60',
          currency: 'usd',
          price: 1765.16154669136,
          pricePercentChange1d: 2.55,
        },
      ]),
    ).toStrictEqual([
      {
        assetId: 'eip155:1/slip44:60',
        currency: 'usd',
        price: 1765.16154669136,
        pricePercentChange1d: 2.55,
      },
    ]);
  });

  it('reads a null percent change when the gateway omits it', () => {
    expect(
      parseMarketStatsBatch([
        { assetId: 'eip155:1/slip44:60', currency: 'usd', price: 1 },
        {
          assetId: 'eip155:137/slip44:966',
          currency: 'usd',
          price: 2,
          pricePercentChange1d: null,
        },
      ]).map(({ pricePercentChange1d }) => pricePercentChange1d),
    ).toStrictEqual([null, null]);
  });

  it('drops a row without a numeric price and returns none for a non-list', () => {
    expect(
      parseMarketStatsBatch([
        { assetId: 'eip155:1/slip44:60', currency: 'usd', price: '1' },
      ]),
    ).toStrictEqual([]);
    expect(parseMarketStatsBatch({})).toStrictEqual([]);
  });
});

describe('parseMarketStatsChannel', () => {
  it('returns the asset and currency', () => {
    expect(
      parseMarketStatsChannel('market-stats.v1.eip155:1/slip44:60.eur'),
    ).toStrictEqual({
      assetId: 'eip155:1/slip44:60',
      currency: 'eur',
    });
  });

  it('returns undefined when the channel is not a market-stats channel', () => {
    expect(
      parseMarketStatsChannel('ohlcv.v1.eip155:1/slip44:60.eur'),
    ).toBeUndefined();
  });

  it('returns undefined when the currency is missing', () => {
    expect(parseMarketStatsChannel('market-stats.v1.')).toBeUndefined();
    expect(
      parseMarketStatsChannel('market-stats.v1.eip155:1/slip44:60.'),
    ).toBeUndefined();
    expect(parseMarketStatsChannel('market-stats.v1..eur')).toBeUndefined();
  });
});
