import { describe, expect, it } from 'vitest';

import { parseMarketStatsChannel } from './normalize.js';

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
