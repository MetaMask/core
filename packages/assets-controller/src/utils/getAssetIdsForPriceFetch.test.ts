import type { InternalAccount } from '@metamask/keyring-internal-api';
import { describe, expect, it, vi } from 'vitest';

import type {
  AssetBalance,
  AssetsControllerState,
  Caip19AssetId,
  ChainId,
  DataRequest,
  FungibleAssetMetadata,
} from '../types.js';
import {
  getAssetIdsForPriceFetch,
  getResponseAssetIdsForPriceFetch,
  getUnpricedResponseAssetIds,
} from './getAssetIdsForPriceFetch.js';
const CHAIN_MAINNET = 'eip155:1' as ChainId;
const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';

const NATIVE_MAINNET = 'eip155:1/slip44:60' as Caip19AssetId;
const TOKEN_MAINNET =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const TOKEN_POLYGON =
  'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as Caip19AssetId;
const CUSTOM_MAINNET =
  'eip155:1/erc20:0x2222222222222222222222222222222222222222' as Caip19AssetId;
const METADATA_MAINNET =
  'eip155:1/erc20:0x1111111111111111111111111111111111111111' as Caip19AssetId;

const ZERO_BALANCE: AssetBalance = { amount: '0' };

const TOKEN_METADATA: FungibleAssetMetadata = {
  type: 'erc20',
  symbol: 'TOK',
  name: 'Token',
  decimals: 18,
};

function createAccount(id: string): InternalAccount {
  return {
    id,
    address: '0x1234567890123456789012345678901234567890',
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: ['eip155:0'],
    metadata: {
      name: 'Test Account',
      keyring: { type: 'HD Key Tree' },
      importTime: Date.now(),
      lastSelected: Date.now(),
    },
  };
}

function createRequest(
  overrides: {
    accountIds?: string[];
    chainIds?: ChainId[];
  } = {},
): Pick<DataRequest, 'accountsWithSupportedChains' | 'chainIds'> {
  const chainIds = overrides.chainIds ?? [CHAIN_MAINNET];
  const accountIds = overrides.accountIds ?? [ACCOUNT_A];
  return {
    chainIds,
    accountsWithSupportedChains: accountIds.map((id) => ({
      account: createAccount(id),
      supportedChains: chainIds,
    })),
  };
}

function emptyState(
  overrides: Partial<
    Pick<
      AssetsControllerState,
      'assetsBalance' | 'customAssets' | 'assetsInfo' | 'assetPreferences'
    >
  > = {},
): Pick<
  AssetsControllerState,
  'assetsBalance' | 'customAssets' | 'assetsInfo' | 'assetPreferences'
> {
  return {
    assetsBalance: {},
    customAssets: {},
    assetsInfo: {},
    assetPreferences: {},
    ...overrides,
  };
}

function sortedIds(ids: Set<Caip19AssetId>): Caip19AssetId[] {
  return [...ids].sort();
}

describe('getAssetIdsForPriceFetch', () => {
  it.each([
    {
      name: 'state balances in account/chain scope',
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [NATIVE_MAINNET]: ZERO_BALANCE },
        },
      }),
      expected: [NATIVE_MAINNET],
    },
    {
      name: 'custom assets in account/chain scope',
      state: emptyState({
        customAssets: { [ACCOUNT_A]: [CUSTOM_MAINNET] },
      }),
      expected: [CUSTOM_MAINNET],
    },
    {
      name: 'union of state balance and custom assets',
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [NATIVE_MAINNET]: ZERO_BALANCE },
        },
        customAssets: { [ACCOUNT_A]: [CUSTOM_MAINNET] },
        assetsInfo: { [METADATA_MAINNET]: TOKEN_METADATA },
      }),
      expected: [NATIVE_MAINNET, CUSTOM_MAINNET].sort(),
    },
  ])('includes $name', ({ state, expected }) => {
    const result = getAssetIdsForPriceFetch({
      state,
      request: createRequest(),
    });

    expect(sortedIds(result)).toStrictEqual([...expected].sort());
  });

  it.each([
    {
      name: 'hidden state balance',
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            [NATIVE_MAINNET]: ZERO_BALANCE,
            [TOKEN_MAINNET]: ZERO_BALANCE,
          },
        },
        assetPreferences: { [TOKEN_MAINNET]: { hidden: true } },
      }),
      expected: [NATIVE_MAINNET],
    },
    {
      name: 'hidden custom asset',
      state: emptyState({
        customAssets: { [ACCOUNT_A]: [CUSTOM_MAINNET] },
        assetPreferences: { [CUSTOM_MAINNET]: { hidden: true } },
      }),
      expected: [],
    },
    {
      name: 'metadata with no balance',
      state: emptyState({
        assetsInfo: { [METADATA_MAINNET]: TOKEN_METADATA },
      }),
      expected: [],
    },
  ])('excludes $name', ({ state, expected }) => {
    const result = getAssetIdsForPriceFetch({
      state,
      request: createRequest(),
    });

    expect(sortedIds(result)).toStrictEqual(expected);
  });

  it('filters balances and custom assets by account ID', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [NATIVE_MAINNET]: ZERO_BALANCE },
          [ACCOUNT_B]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
        customAssets: {
          [ACCOUNT_A]: [CUSTOM_MAINNET],
          [ACCOUNT_B]: [METADATA_MAINNET],
        },
      }),
      request: createRequest({ accountIds: [ACCOUNT_A] }),
    });

    expect(sortedIds(result)).toStrictEqual(
      [NATIVE_MAINNET, CUSTOM_MAINNET].sort(),
    );
  });

  it('filters all sources by chain ID', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            [NATIVE_MAINNET]: ZERO_BALANCE,
            [TOKEN_POLYGON]: ZERO_BALANCE,
          },
        },
        customAssets: {
          [ACCOUNT_A]: [CUSTOM_MAINNET, TOKEN_POLYGON],
        },
        assetsInfo: {
          [METADATA_MAINNET]: TOKEN_METADATA,
          [TOKEN_POLYGON]: TOKEN_METADATA,
        },
      }),
      request: createRequest({ chainIds: [CHAIN_MAINNET] }),
    });

    expect(sortedIds(result)).toStrictEqual(
      [NATIVE_MAINNET, CUSTOM_MAINNET].sort(),
    );
  });

  it('deduplicates the same asset across a state balance and a custom asset', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
        customAssets: { [ACCOUNT_A]: [TOKEN_MAINNET] },
        assetsInfo: { [TOKEN_MAINNET]: TOKEN_METADATA },
      }),
      request: createRequest(),
    });

    expect([...result]).toStrictEqual([TOKEN_MAINNET]);
  });

  it('skips malformed asset IDs and keeps valid ones', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            'not-a-valid-caip19': ZERO_BALANCE,
            [NATIVE_MAINNET]: ZERO_BALANCE,
          } as Record<Caip19AssetId, AssetBalance>,
        },
      }),
      request: createRequest(),
    });

    expect([...result]).toStrictEqual([NATIVE_MAINNET]);
  });

  it('returns every balance on the response', () => {
    const result = getResponseAssetIdsForPriceFetch({
      response: {
        assetsBalance: {
          [ACCOUNT_A]: {
            [TOKEN_MAINNET]: ZERO_BALANCE,
            [TOKEN_POLYGON]: ZERO_BALANCE,
          },
          [ACCOUNT_B]: { [NATIVE_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result)).toStrictEqual(
      [
        NATIVE_MAINNET,
        TOKEN_MAINNET,
        TOKEN_POLYGON,
      ].sort(),
    );
  });

  it('returns unpriced priceable response balances on a supported chain', async () => {
    const result = await getUnpricedResponseAssetIds({
      state: {
        ...emptyState(),
        assetsPrice: {
          [TOKEN_POLYGON]: { price: 1 },
        } as AssetsControllerState['assetsPrice'],
      },
      response: {
        assetsBalance: {
          [ACCOUNT_A]: {
            [TOKEN_MAINNET]: ZERO_BALANCE,
            [TOKEN_POLYGON]: ZERO_BALANCE,
            'tron:728126428/slip44:bandwidth': ZERO_BALANCE,
          },
        },
      },
      getSupportedNetworks: async () => new Set([CHAIN_MAINNET]),
    });

    expect(result).toStrictEqual([TOKEN_MAINNET]);
  });

  it('skips hidden response balances', async () => {
    const getSupportedNetworks = vi.fn(async () => new Set([CHAIN_MAINNET]));

    const result = await getUnpricedResponseAssetIds({
      state: {
        ...emptyState({
          assetPreferences: { [TOKEN_MAINNET]: { hidden: true } },
        }),
        assetsPrice: {},
      },
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
      getSupportedNetworks,
    });

    expect(result).toStrictEqual([]);
    expect(getSupportedNetworks).not.toHaveBeenCalled();
  });

  it('does not load supported networks when nothing priceable remains', async () => {
    const getSupportedNetworks = vi.fn();

    const result = await getUnpricedResponseAssetIds({
      state: { ...emptyState(), assetsPrice: {} },
      response: {
        assetsBalance: {
          [ACCOUNT_A]: {
            'tron:728126428/slip44:bandwidth': ZERO_BALANCE,
          },
        },
      },
      getSupportedNetworks,
    });

    expect(result).toStrictEqual([]);
    expect(getSupportedNetworks).not.toHaveBeenCalled();
  });

  it('returns an empty set when no candidates are in scope', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState(),
      request: createRequest(),
    });

    expect([...result]).toStrictEqual([]);
  });
});
