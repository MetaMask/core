import type { SupportedCurrency } from '@metamask/core-backend';
import { describe, expect, it, vi } from 'vitest';
import type { Mock } from 'vitest';

import type { Caip19AssetId } from '../types.js';
import { normalizeAssetId } from '../utils/index.js';
import type { MarketStatsPriceStreamMessenger } from './MarketStatsPriceStream.js';
import {
  MARKET_STATS_PRICE_STREAM_CALLER,
  MarketStatsPriceStream,
  selectAssetsToStream,
} from './MarketStatsPriceStream.js';

const NATIVE = 'eip155:1/slip44:60' as Caip19AssetId;
const TOKEN = 'eip155:1/erc20:0xaaa' as Caip19AssetId;

function canonical(assetId: string): string {
  try {
    return normalizeAssetId(assetId as Caip19AssetId);
  } catch {
    return assetId;
  }
}

function createMessenger(): {
  messenger: MarketStatsPriceStreamMessenger;
  subscribe: Mock;
} {
  const subscribe = vi.fn().mockResolvedValue(undefined);
  const messenger = {
    call: async (method: string, ...params: unknown[]) => {
      if (method === 'MarketStatsService:subscribe') {
        await subscribe(...params);
        return;
      }
      throw new Error(`Unexpected method ${method}`);
    },
  } as unknown as MarketStatsPriceStreamMessenger;
  return { messenger, subscribe };
}

function createStream(
  messenger: MarketStatsPriceStreamMessenger,
  currency: SupportedCurrency = 'usd',
): MarketStatsPriceStream {
  return new MarketStatsPriceStream({
    messenger,
    getSelectedCurrency: (): SupportedCurrency => currency,
  });
}

describe('selectAssetsToStream', () => {
  it('keeps assets the Price API marks as streamable', () => {
    const selected = selectAssetsToStream([
      {
        assetId: 'eip155:1/slip44:60',
        wssSupport: true,
      },
      {
        assetId: 'eip155:1/erc20:0xaaa',
        wssSupport: false,
      },
      {
        assetId: 'eip155:137/slip44:966',
        wssSupport: true,
      },
    ]);

    expect(selected).toStrictEqual([
      'eip155:1/slip44:60',
      'eip155:137/slip44:966',
    ]);
  });
});

describe('MarketStatsPriceStream', () => {
  it('sends the streamable assets as this caller', async () => {
    const { messenger, subscribe } = createMessenger();
    const stream = createStream(messenger);

    await stream.reconcile([
      { assetId: NATIVE, wssSupport: true },
      { assetId: TOKEN, wssSupport: false },
    ]);

    expect(subscribe).toHaveBeenCalledWith(
      [{ assetId: canonical(NATIVE), currency: 'usd' }],
      MARKET_STATS_PRICE_STREAM_CALLER,
    );
  });

  it('sends the assets that remain when one leaves the set', async () => {
    const { messenger, subscribe } = createMessenger();
    const stream = createStream(messenger);

    await stream.reconcile([
      { assetId: NATIVE, wssSupport: true },
      { assetId: TOKEN, wssSupport: true },
    ]);
    await stream.reconcile([{ assetId: NATIVE, wssSupport: true }]);

    expect(subscribe).toHaveBeenLastCalledWith(
      [{ assetId: canonical(NATIVE), currency: 'usd' }],
      MARKET_STATS_PRICE_STREAM_CALLER,
    );
  });

  it('sends an empty list to release this caller', async () => {
    const { messenger, subscribe } = createMessenger();
    const stream = createStream(messenger, 'eur');

    await stream.reconcile([{ assetId: NATIVE, wssSupport: true }]);
    await stream.releaseSubscriptions();

    expect(subscribe).toHaveBeenLastCalledWith(
      [],
      MARKET_STATS_PRICE_STREAM_CALLER,
    );
  });

  it('sends the full list again after a subscribe failure', async () => {
    const { messenger, subscribe } = createMessenger();
    subscribe.mockRejectedValueOnce(new Error('socket down'));
    const stream = createStream(messenger);
    const candidates = [
      { assetId: NATIVE, wssSupport: true },
      { assetId: TOKEN, wssSupport: true },
    ];

    await stream.reconcile(candidates);
    await stream.reconcile(candidates);

    expect(subscribe).toHaveBeenLastCalledWith(
      [
        { assetId: canonical(NATIVE), currency: 'usd' },
        { assetId: canonical(TOKEN), currency: 'usd' },
      ],
      MARKET_STATS_PRICE_STREAM_CALLER,
    );
  });
});
