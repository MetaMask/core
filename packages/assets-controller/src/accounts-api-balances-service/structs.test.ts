import { is } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { describe, expect, it } from 'vitest';

import {
  V5BalancesResponseStruct,
  V6BalancesResponseStruct,
} from './structs.js';
import type { BalancesResponse } from './structs.js';

const V5_ITEM = {
  object: 'token',
  symbol: 'ETH',
  name: 'Ether',
  type: 'native',
  decimals: 18,
  assetId: 'eip155:1/slip44:60',
  balance: '1.5',
  accountId: 'eip155:0:0xabc',
};

const V6_ITEM = {
  accountId: 'eip155:0:0xabc',
  object: 'token',
  type: 'erc20',
  assetId: 'eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7',
  name: 'Tether',
  symbol: 'USDT',
  decimals: 6,
  balance: '10',
  price: '1.0',
  labels: ['stable'],
  canonicalHead: 'eip155:1/erc20:0xdac1',
  metadata: { limit: '100', authorized: true },
};

describe('balances response structs', () => {
  it('accepts a v5 response with unprocessedNetworks', () => {
    const response = {
      count: 1,
      unprocessedNetworks: ['eip155:999'],
      balances: [{ ...V5_ITEM, metadata: { sponsored: false }, extra: 1 }],
      extraField: 'ok',
    };

    expect(is(response, V5BalancesResponseStruct)).toBe(true);
  });

  it('accepts a v6 response with unprocessedIncludeAssetIds and token rows', () => {
    const response = {
      unprocessedNetworks: [],
      unprocessedIncludeAssetIds: ['eip155:1/erc20:0xabc'],
      balances: [
        V6_ITEM,
        {
          ...V6_ITEM,
          object: 'defi',
          metadata: {
            protocolId: 'aave',
            productName: 'Aave',
            description: 'd',
            protocolUrl: 'https://aave.com',
            positionType: 'deposit',
            poolAddress: '0x1',
            groupId: 'g',
          },
        },
      ],
      processingDefiPositions: ['eip155:0:0xabc'],
    };

    expect(is(response, V6BalancesResponseStruct)).toBe(true);
  });

  it('accepts rows with a null name or an unknown type', () => {
    const v5Response = {
      count: 2,
      unprocessedNetworks: [],
      balances: [
        { ...V5_ITEM, name: null },
        { ...V5_ITEM, type: 'erc721', object: 'nft' },
      ],
    };
    const v6Response = {
      unprocessedNetworks: [],
      unprocessedIncludeAssetIds: [],
      balances: [
        { ...V6_ITEM, name: null, symbol: null, decimals: null },
        { ...V6_ITEM, type: 'something-new', object: 'something-new' },
      ],
    };

    expect(is(v5Response, V5BalancesResponseStruct)).toBe(true);
    expect(is(v6Response, V6BalancesResponseStruct)).toBe(true);
  });

  it('accepts rows carrying only the fields the data source reads', () => {
    const v5Response = {
      count: 1,
      unprocessedNetworks: [],
      balances: [{ accountId: 'eip155:0:0xabc', assetId: 'a', balance: '1' }],
    };
    const v6Response = {
      unprocessedNetworks: [],
      unprocessedIncludeAssetIds: [],
      balances: [
        {
          accountId: 'eip155:0:0xabc',
          assetId: 'a',
          balance: '1',
          object: 'token',
        },
      ],
    };

    expect(is(v5Response, V5BalancesResponseStruct)).toBe(true);
    expect(is(v6Response, V6BalancesResponseStruct)).toBe(true);
  });

  it('rejects rows missing a field the data source reads', () => {
    for (const field of ['accountId', 'assetId', 'balance']) {
      const { [field]: _omitted, ...v5Item } = V5_ITEM as Record<
        string,
        unknown
      >;
      const { [field]: _omitted6, ...v6Item } = V6_ITEM as Record<
        string,
        unknown
      >;
      expect(
        is(
          { count: 1, unprocessedNetworks: [], balances: [v5Item] },
          V5BalancesResponseStruct,
        ),
      ).toBe(false);
      expect(
        is(
          {
            unprocessedNetworks: [],
            unprocessedIncludeAssetIds: [],
            balances: [v6Item],
          },
          V6BalancesResponseStruct,
        ),
      ).toBe(false);
    }
    const { object: _object, ...v6WithoutObject } = V6_ITEM;
    expect(
      is(
        {
          unprocessedNetworks: [],
          unprocessedIncludeAssetIds: [],
          balances: [v6WithoutObject],
        },
        V6BalancesResponseStruct,
      ),
    ).toBe(false);
  });

  it('accepts a v5 row with null metadata', () => {
    const response = {
      count: 1,
      unprocessedNetworks: [],
      balances: [{ ...V5_ITEM, metadata: null }],
    };

    expect(is(response, V5BalancesResponseStruct)).toBe(true);
  });

  it('accepts a v6 row with null metadata', () => {
    const response = {
      unprocessedNetworks: [],
      unprocessedIncludeAssetIds: [],
      balances: [{ ...V6_ITEM, metadata: null }],
    };

    expect(is(response, V6BalancesResponseStruct)).toBe(true);
  });

  it('accepts a v6 response with null processingDefiPositions', () => {
    const response = {
      unprocessedNetworks: [],
      unprocessedIncludeAssetIds: [],
      balances: [],
      processingDefiPositions: null,
    };

    expect(is(response, V6BalancesResponseStruct)).toBe(true);
  });

  it('rejects a response missing balances', () => {
    expect(
      is({ count: 0, unprocessedNetworks: [] }, V5BalancesResponseStruct),
    ).toBe(false);
    expect(
      is(
        { unprocessedNetworks: [], unprocessedIncludeAssetIds: [] },
        V6BalancesResponseStruct,
      ),
    ).toBe(false);
  });

  it('infers a BalancesResponse type assignable to Json', () => {
    const assertJson = (_value: Json): void => undefined;
    const response = {} as BalancesResponse;

    assertJson(response);
    expect(true).toBe(true);
  });
});
