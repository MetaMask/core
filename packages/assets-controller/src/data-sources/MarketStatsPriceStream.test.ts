import { describe, expect, it } from 'vitest';

import { selectAssetsToStream } from './MarketStatsPriceStream.js';

describe('selectAssetsToStream', () => {
  it('keeps the highest-volume streamable assets up to the channel cap', () => {
    const selected = selectAssetsToStream(
      [
        {
          assetId: 'eip155:1/slip44:60',
          wssSupport: true,
          totalVolume: 10,
        },
        {
          assetId: 'eip155:1/erc20:0xaaa',
          wssSupport: false,
          totalVolume: 999,
        },
        {
          assetId: 'eip155:137/slip44:966',
          wssSupport: true,
          totalVolume: 50,
        },
        {
          assetId: 'eip155:1/erc20:0xbbb',
          wssSupport: true,
          totalVolume: 50,
        },
      ],
      2,
    );

    expect(selected).toStrictEqual([
      'eip155:1/erc20:0xbbb',
      'eip155:137/slip44:966',
    ]);
  });
});
