import type { InternalAccount } from '@metamask/keyring-internal-api';
import { describe, expect, it } from 'vitest';

import type {
  AssetBalance,
  AssetsControllerState,
  Caip19AssetId,
  ChainId,
  DataRequest,
  FungibleAssetMetadata,
} from '../types.js';
import { getAssetIdsForMetadataFetch } from './getAssetIdsForMetadataFetch.js';

const CHAIN_MAINNET = 'eip155:1' as ChainId;
const CHAIN_POLYGON = 'eip155:137' as ChainId;
const ACCOUNT_A = 'account-a';
const ACCOUNT_B = 'account-b';

const NATIVE_MAINNET = 'eip155:1/slip44:60' as Caip19AssetId;
const TOKEN_MAINNET =
  'eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48' as Caip19AssetId;
const TOKEN_POLYGON =
  'eip155:137/erc20:0x3c499c542cef5e3811e1192ce70d8cc03d5c3359' as Caip19AssetId;
const STAKING_MAINNET =
  'eip155:1/erc20:0x4fef9d741011476750a243ac70b9789a63dd47df' as Caip19AssetId;

const ZERO_BALANCE: AssetBalance = { amount: '0' };

const COMPLETE_METADATA: FungibleAssetMetadata = {
  type: 'erc20',
  symbol: 'TOK',
  name: 'Token',
  decimals: 18,
  image: 'https://example.com/token.png',
  aggregators: ['metamask'],
  occurrences: 5,
};

const METADATA_WITH_IMAGE: FungibleAssetMetadata = {
  type: 'erc20',
  symbol: 'TOK',
  name: 'Token',
  decimals: 18,
  image: 'https://example.com/token.png',
};

const METADATA_WITHOUT_IMAGE: FungibleAssetMetadata = {
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
      'assetsBalance' | 'assetsInfo' | 'assetPreferences'
    >
  > = {},
): Pick<
  AssetsControllerState,
  'assetsBalance' | 'assetsInfo' | 'assetPreferences'
> {
  return {
    assetsBalance: {},
    assetsInfo: {},
    assetPreferences: {},
    ...overrides,
  };
}

function sortedIds(ids: Set<string>): string[] {
  return [...ids].sort();
}

describe('getAssetIdsForMetadataFetch', () => {
  it('includes state balances without metadata as heals', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      }),
      request: createRequest(),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
  });

  it('includes new response balances without marking them as heals', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState(),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([]);
  });

  it('marks response balances already in state as heals', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      }),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
  });

  it('marks response balances with known state metadata as heals', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsInfo: { [TOKEN_MAINNET]: METADATA_WITHOUT_IMAGE },
      }),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
      TOKEN_MAINNET,
    ]);
  });

  it('excludes assets whose state metadata has every client-used field', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
        assetsInfo: { [TOKEN_MAINNET]: COMPLETE_METADATA },
      }),
      request: createRequest(),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([]);
  });

  it('excludes assets whose response metadata has every client-used field', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState(),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
        assetsInfo: { [TOKEN_MAINNET]: COMPLETE_METADATA },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([]);
  });

  it.each([
    ['image', METADATA_WITH_IMAGE],
    ['aggregators', { ...COMPLETE_METADATA, aggregators: undefined }],
    ['occurrences', { ...COMPLETE_METADATA, occurrences: undefined }],
    ['symbol', { ...COMPLETE_METADATA, symbol: '' }],
    ['name', { ...COMPLETE_METADATA, name: '' }],
    ['decimals', { ...COMPLETE_METADATA, decimals: Number.NaN }],
  ] as const)(
    'includes assets whose metadata is missing %s',
    (_missingField, metadata) => {
      const result = getAssetIdsForMetadataFetch({
        state: emptyState({
          assetsBalance: {
            [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
          },
          assetsInfo: {
            [TOKEN_MAINNET]: metadata as unknown as FungibleAssetMetadata,
          },
        }),
        request: createRequest(),
        response: {},
      });

      expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
        TOKEN_MAINNET,
      ]);
      expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
        TOKEN_MAINNET,
      ]);
    },
  );

  it('excludes hidden assets', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            [NATIVE_MAINNET]: ZERO_BALANCE,
            [TOKEN_MAINNET]: ZERO_BALANCE,
          },
        },
        assetPreferences: { [TOKEN_MAINNET]: { hidden: true } },
      }),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
  });

  it('excludes staking contract asset IDs', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [STAKING_MAINNET]: ZERO_BALANCE },
        },
      }),
      request: createRequest(),
      response: {
        assetsBalance: {
          [ACCOUNT_A]: { [STAKING_MAINNET]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([]);
  });

  it('filters state balances by account ID', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: { [NATIVE_MAINNET]: ZERO_BALANCE },
          [ACCOUNT_B]: { [TOKEN_MAINNET]: ZERO_BALANCE },
        },
      }),
      request: createRequest({ accountIds: [ACCOUNT_A] }),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
  });

  it('filters state balances by chain ID', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            [NATIVE_MAINNET]: ZERO_BALANCE,
            [TOKEN_POLYGON]: ZERO_BALANCE,
          },
        },
      }),
      request: createRequest({ chainIds: [CHAIN_MAINNET] }),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
  });

  it('does not filter response balances by account or chain ID', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState(),
      request: createRequest({
        accountIds: [ACCOUNT_A],
        chainIds: [CHAIN_MAINNET],
      }),
      response: {
        assetsBalance: {
          [ACCOUNT_B]: { [TOKEN_POLYGON]: ZERO_BALANCE },
        },
      },
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      TOKEN_POLYGON,
    ]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([]);
  });

  it('skips malformed state balance asset IDs when chain filtering', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            'not-a-valid-caip19': ZERO_BALANCE,
            [NATIVE_MAINNET]: ZERO_BALANCE,
          } as Record<Caip19AssetId, AssetBalance>,
        },
      }),
      request: createRequest({ chainIds: [CHAIN_MAINNET] }),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([
      NATIVE_MAINNET,
    ]);
  });

  it('returns empty sets when no candidates need metadata', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState(),
      request: createRequest(),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual([]);
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual([]);
  });

  it('includes chain filter when request has both mainnet and polygon', () => {
    const result = getAssetIdsForMetadataFetch({
      state: emptyState({
        assetsBalance: {
          [ACCOUNT_A]: {
            [NATIVE_MAINNET]: ZERO_BALANCE,
            [TOKEN_POLYGON]: ZERO_BALANCE,
          },
        },
      }),
      request: createRequest({
        chainIds: [CHAIN_MAINNET, CHAIN_POLYGON],
      }),
      response: {},
    });

    expect(sortedIds(result.assetIdsNeedingMetadata)).toStrictEqual(
      [NATIVE_MAINNET, TOKEN_POLYGON].sort(),
    );
    expect(sortedIds(result.balanceHealAssetIds)).toStrictEqual(
      [NATIVE_MAINNET, TOKEN_POLYGON].sort(),
    );
  });
});
