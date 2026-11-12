import { describe, expect, it } from 'vitest';

import { selectAssetsToStream } from './MarketStatsPriceStream.js';

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
