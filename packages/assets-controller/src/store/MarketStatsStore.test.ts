import { describe, expect, it, vi } from 'vitest';

import {
  MarketStatsStore,
  marketStatsAssetKey,
  readLiveQuote,
} from './MarketStatsStore.js';

const SOL = 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
const USDC_LOWER = 'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const USDC_CHECKSUM =
  'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const PEPE_LOWER = 'eip155:1/erc20:0x6982508145454ce325ddbe47a25d4ec3d2311933';
const PEPE_CHECKSUM =
  'eip155:1/erc20:0x6982508145454Ce325dDbE47a25d4ec3d2311933';

describe('MarketStatsStore', () => {
  it('checksums an EVM ERC-20 id from a lowercased tick', () => {
    const store = new MarketStatsStore();

    store.ingestPrices({
      updates: [
        {
          assetId: USDC_LOWER,
          currency: 'usd',
          price: 1.01,
          pricePercentChange1d: 0.4,
        },
      ],
    });

    expect(marketStatsAssetKey(USDC_LOWER)).toBe(USDC_CHECKSUM);
    expect(store.getSnapshot().get(USDC_CHECKSUM)).toStrictEqual({
      price: 1.01,
      pricePercentChange1d: 0.4,
    });
    expect(readLiveQuote(store.getSnapshot(), USDC_CHECKSUM)).toStrictEqual({
      price: 1.01,
      pricePercentChange1d: 0.4,
    });
  });

  it('matches a checksummed list id to a lowercased tick', () => {
    const store = new MarketStatsStore();

    store.ingestPrices({
      updates: [
        {
          assetId: PEPE_LOWER,
          currency: 'usd',
          price: 0.0000042,
          pricePercentChange1d: 1.2,
        },
      ],
    });

    expect(readLiveQuote(store.getSnapshot(), PEPE_CHECKSUM)).toStrictEqual({
      price: 0.0000042,
      pricePercentChange1d: 1.2,
    });
  });

  it('keeps a non-EVM id as given', () => {
    const store = new MarketStatsStore();

    store.ingestPrices({
      updates: [
        {
          assetId: SOL,
          currency: 'usd',
          price: '87.5',
          pricePercentChange1d: null,
        },
      ],
    });

    expect(store.getSnapshot().get(SOL)).toStrictEqual({ price: 87.5 });
  });

  it('drops an update in another currency', () => {
    const store = new MarketStatsStore();

    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'eur', price: 80 }],
    });

    expect(store.getSnapshot().get(SOL)).toBeUndefined();
  });

  it('reads a price whose currency differs only by case', () => {
    const store = new MarketStatsStore();

    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'USD', price: 10 }],
    });

    expect(store.getSnapshot().get(SOL)).toStrictEqual({ price: 10 });
  });

  it('ignores an argument list instead of the published object', () => {
    const store = new MarketStatsStore();

    store.ingestPrices([
      { updates: [{ assetId: SOL, currency: 'usd', price: 10 }] },
    ]);

    expect(store.getSnapshot().size).toBe(0);
  });

  it('keeps the snapshot reference when the tick does not change a quote', () => {
    const store = new MarketStatsStore();
    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'usd', price: 10 }],
    });
    const snapshot = store.getSnapshot();
    const listener = vi.fn();
    store.subscribe(listener);

    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'usd', price: 10 }],
    });

    expect(store.getSnapshot()).toBe(snapshot);
    expect(listener).not.toHaveBeenCalled();
  });

  it('drops a quote when its chain is down and stores a later tick', () => {
    const store = new MarketStatsStore();
    const listener = vi.fn();
    store.subscribe(listener);

    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'usd', price: 87 }],
    });
    store.ingestChainStatus({
      chainIds: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp', 1],
      status: 'down',
    });

    expect(store.getSnapshot().get(SOL)).toBeUndefined();

    store.ingestChainStatus({
      chainIds: ['solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
      status: 'up',
    });
    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'usd', price: 88 }],
    });

    expect(store.getSnapshot().get(SOL)).toStrictEqual({ price: 88 });
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('ignores a payload that is not a price batch', () => {
    const store = new MarketStatsStore();

    store.ingestPrices({ prices: { [SOL]: { price: 1 } } });
    store.ingestChainStatus(null);

    expect(store.getSnapshot().size).toBe(0);
  });

  describe('setCurrency', () => {
    it('clears quotes from the previous currency without notifying', () => {
      const store = new MarketStatsStore();
      store.ingestPrices({
        updates: [{ assetId: SOL, currency: 'usd', price: 87 }],
      });
      const listener = vi.fn();
      store.subscribe(listener);

      store.setCurrency('eur');

      expect(store.getSnapshot().size).toBe(0);
      expect(listener).not.toHaveBeenCalled();

      store.ingestPrices({
        updates: [{ assetId: SOL, currency: 'eur', price: 80 }],
      });
      expect(store.getSnapshot().get(SOL)).toStrictEqual({ price: 80 });
      store.ingestPrices({
        updates: [{ assetId: SOL, currency: 'usd', price: 87 }],
      });
      expect(store.getSnapshot().get(SOL)?.price).toBe(80);
    });

    it('keeps quotes when the currency is the same aside from case', () => {
      const store = new MarketStatsStore();
      store.ingestPrices({
        updates: [{ assetId: SOL, currency: 'usd', price: 87 }],
      });
      const snapshot = store.getSnapshot();

      store.setCurrency('USD');

      expect(store.getSnapshot()).toBe(snapshot);
    });
  });

  it('stops notifying after unsubscribe', () => {
    const store = new MarketStatsStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    unsubscribe();
    store.ingestPrices({
      updates: [{ assetId: SOL, currency: 'usd', price: 1 }],
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
