import type { InternalAccount } from '@metamask/keyring-internal-api';

import type {
  AssetBalance,
  AssetsControllerState,
  Caip19AssetId,
  ChainId,
  DataRequest,
  FungibleAssetMetadata,
} from '../types.js';
import { getAssetIdsForPriceFetch } from './getAssetIdsForPriceFetch.js';
import { normalizeAssetId } from './normalizeAssetId.js';

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
      response: {},
      expected: [NATIVE_MAINNET],
    },
    {
      name: 'response balances in account/chain scope',
      state: emptyState(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
      expected: [normalizeAssetId(TOKEN_MAINNET)],
    },
    {
      name: 'custom assets in account/chain scope',
      state: emptyState({
        customAssets: { [ACCOUNT_A]: [CUSTOM_MAINNET] },
      }),
      response: {},
      expected: [normalizeAssetId(CUSTOM_MAINNET)],
    },
    {
      name: 'assetsInfo metadata in chain scope',
      state: emptyState({
        assetsInfo: { [METADATA_MAINNET]: TOKEN_METADATA },
      }),
      response: {},
      expected: [normalizeAssetId(METADATA_MAINNET)],
    },
    {
      name: 'union of state balance, response balance, custom, and metadata',
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [NATIVE_MAINNET]: ZERO_BALANCE },
        },
        customAssets: { [ACCOUNT_A]: [CUSTOM_MAINNET] },
        assetsInfo: { [METADATA_MAINNET]: TOKEN_METADATA },
      }),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
      expected: [
        NATIVE_MAINNET,
        normalizeAssetId(CUSTOM_MAINNET),
        normalizeAssetId(METADATA_MAINNET),
        normalizeAssetId(TOKEN_MAINNET),
      ].sort(),
    },
  ])('includes $name', ({ state, response, expected }) => {
    const result = getAssetIdsForPriceFetch({
      state,
      request: createRequest(),
      response,
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
      response: {},
      expected: [NATIVE_MAINNET],
    },
    {
      name: 'hidden response balance',
      state: emptyState({
        assetPreferences: { [TOKEN_MAINNET]: { hidden: true } },
      }),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: {
            [NATIVE_MAINNET]: ZERO_BALANCE,
            [TOKEN_MAINNET]: ZERO_BALANCE,
          },
        },
      },
      expected: [NATIVE_MAINNET],
    },
    {
      name: 'hidden custom asset',
      state: emptyState({
        customAssets: { [ACCOUNT_A]: [CUSTOM_MAINNET] },
        assetPreferences: { [CUSTOM_MAINNET]: { hidden: true } },
      }),
      response: {},
      expected: [],
    },
    {
      name: 'hidden metadata asset',
      state: emptyState({
        assetsInfo: { [METADATA_MAINNET]: TOKEN_METADATA },
        assetPreferences: { [METADATA_MAINNET]: { hidden: true } },
      }),
      response: {},
      expected: [],
    },
  ])('excludes $name', ({ state, response, expected }) => {
    const result = getAssetIdsForPriceFetch({
      state,
      request: createRequest(),
      response,
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
      response: {
        assetsBalance: {
          [ACCOUNT_B]: { [TOKEN_POLYGON]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result)).toStrictEqual(
      [NATIVE_MAINNET, normalizeAssetId(CUSTOM_MAINNET)].sort(),
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
      response: {
        assetsBalance: {
          [ACCOUNT_A]: {
            [TOKEN_MAINNET]: ZERO_BALANCE,
            [TOKEN_POLYGON]: ZERO_BALANCE,
          },
        },
      },
    });

    expect(sortedIds(result)).toStrictEqual(
      [
        NATIVE_MAINNET,
        normalizeAssetId(CUSTOM_MAINNET),
        normalizeAssetId(METADATA_MAINNET),
        normalizeAssetId(TOKEN_MAINNET),
      ].sort(),
    );
  });

  it('deduplicates the same asset across state, response, custom, and metadata', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
        customAssets: { [ACCOUNT_A]: [TOKEN_MAINNET] },
        assetsInfo: { [TOKEN_MAINNET]: TOKEN_METADATA },
      }),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect([...result]).toStrictEqual([normalizeAssetId(TOKEN_MAINNET)]);
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
      response: {},
    });

    expect([...result]).toStrictEqual([NATIVE_MAINNET]);
  });

  it('returns an empty set when no candidates are in scope', () => {
    const result = getAssetIdsForPriceFetch({
      state: emptyState(),
      request: createRequest(),
      response: {},
    });

    expect([...result]).toStrictEqual([]);
  });
});
