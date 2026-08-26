import { cloneDeep } from 'lodash';

import {
  createTestApiClient,
  mockSuggestedOccurrenceFloors,
  mockV3Assets,
} from '../__fixtures__/mockTokenApi.js';
import {
  ACCOUNT_ONE_ID,
  ACCOUNT_TWO_ID,
  ARBITRUM_GMX,
  BASE_FARTCOIN,
  BASE_SPAM,
  BASE_USDC,
  MAINNET_NATIVE,
  MAINNET_USDT,
  MONAD_WMON,
  OPTIMISM_SPAM,
  OPTIMISM_USDC,
  OUT_OF_SCOPE_ASSET_IDS,
  SEI_USDCN,
  SPAM_ASSET_IDS,
  SPAM_WALLET_ASSETS_INFO,
  SURVIVING_ASSET_IDS,
  SWEEPABLE_ASSET_IDS,
  buildAssetsInfo,
  buildLowercasedSpamWalletState,
  buildManyTokensState,
  buildSpamWalletState,
} from '../__fixtures__/spamWalletState.js';
import type { AssetsControllerStateInternal, Caip19AssetId } from '../types.js';
import type {
  CleanSpamAssetsState,
  CurrentAssetsState,
} from './healAssetsInfoMetadata.js';
import {
  cleanSpamAssets,
  healAssetsInfoMetadata,
  tempHealAssetsInfoMetadata,
} from './healAssetsInfoMetadata.js';

const ACCOUNT_ID = 'account-uuid-1';
const ACCOUNT_ADDRESS = '0x1111111111111111111111111111111111111111';

// Flare (chainId 14 / 0xe) — a niche chain not covered by the Accounts API.
const FLARE_HEX_CHAIN_ID = '0xe';
const TOKEN_ADDRESS_LOWER = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
const TOKEN_ADDRESS_CHECKSUMMED = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const FLARE_ASSET_ID =
  `eip155:14/erc20:${TOKEN_ADDRESS_CHECKSUMMED}` as Caip19AssetId;

/**
 * Build an empty current AssetsController state, with optional overrides.
 *
 * @param overrides - Partial state slices to merge over the empty defaults.
 * @returns The current state input for healAssetsInfoMetadata.
 */
function buildCurrentState(
  overrides: Partial<CurrentAssetsState> = {},
): CurrentAssetsState {
  return {
    assetsInfo: {},
    assetsBalance: {},
    customAssets: {},
    assetPreferences: {},
    ...overrides,
  };
}

/**
 * Build a legacy state root containing a single token on the Flare chain
 * owned by ACCOUNT_ADDRESS, with the AccountsController address-to-ID
 * mapping in place.
 *
 * @param token - The raw token entry to place in allTokens.
 * @returns The legacy state root.
 */
function buildLegacyState(token: Record<string, unknown>): unknown {
  return {
    TokensController: {
      allTokens: {
        [FLARE_HEX_CHAIN_ID]: {
          [ACCOUNT_ADDRESS]: [token],
        },
      },
    },
    AccountsController: {
      internalAccounts: {
        accounts: {
          [ACCOUNT_ID]: { address: ACCOUNT_ADDRESS },
        },
      },
    },
  };
}

const VALID_TOKEN = {
  address: TOKEN_ADDRESS_LOWER,
  symbol: 'TST',
  name: 'Test Token',
  decimals: 18,
};

describe('healAssetsInfoMetadata', () => {
  describe('guarding against invalid legacy state', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a string', 'not-an-object'],
      ['a number', 42],
      ['an array', []],
      ['an empty object', {}],
      ['a non-object TokensController', { TokensController: 'nope' }],
      ['a missing allTokens', { TokensController: {} }],
      ['a non-object allTokens', { TokensController: { allTokens: [] } }],
    ])('returns null when legacy state is %s', (_description, legacyState) => {
      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it('skips chain entries that are not objects', () => {
      const legacyState = {
        TokensController: {
          allTokens: { [FLARE_HEX_CHAIN_ID]: ['not-an-object'] },
        },
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it('skips account entries that are not arrays', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            [FLARE_HEX_CHAIN_ID]: { [ACCOUNT_ADDRESS]: 'not-an-array' },
          },
        },
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it.each([
      ['not an object', 'not-a-token'],
      ['missing an address', { symbol: 'TST', decimals: 18 }],
      ['a non-string address', { ...VALID_TOKEN, address: 123 }],
      ['an invalid address', { ...VALID_TOKEN, address: '0x123' }],
      ['a non-hex address', { ...VALID_TOKEN, address: `0x${'g'.repeat(40)}` }],
      ['missing a symbol', { address: TOKEN_ADDRESS_LOWER, decimals: 18 }],
      ['an empty-string symbol', { ...VALID_TOKEN, symbol: '' }],
      ['a non-string symbol', { ...VALID_TOKEN, symbol: 7 }],
    ])('skips tokens that are %s', (_description, token) => {
      expect(
        healAssetsInfoMetadata(
          buildLegacyState(token as Record<string, unknown>),
          buildCurrentState(),
        ),
      ).toBeNull();
    });

    it('skips chain keys that are not hex chain IDs', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            'not-a-chain': { [ACCOUNT_ADDRESS]: [VALID_TOKEN] },
          },
        },
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it('skips hex chain keys too large to represent as a number', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            [`0x${'f'.repeat(1000)}`]: { [ACCOUNT_ADDRESS]: [VALID_TOKEN] },
          },
        },
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it('tolerates a malformed AccountsController and still heals assetsInfo', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            [FLARE_HEX_CHAIN_ID]: { [ACCOUNT_ADDRESS]: [VALID_TOKEN] },
          },
        },
        AccountsController: 'garbage',
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toStrictEqual({
        assetsInfo: {
          [FLARE_ASSET_ID]: {
            type: 'erc20',
            symbol: 'TST',
            name: 'Test Token',
            decimals: 18,
          },
        },
        customAssets: {},
      });
    });
  });

  describe('healing eligible tokens', () => {
    it('restores metadata and custom-asset tracking for a niche-chain token', () => {
      const patch = healAssetsInfoMetadata(
        buildLegacyState({
          ...VALID_TOKEN,
          image: 'https://example.com/tst.png',
          aggregators: ['CoinGecko'],
        }),
        buildCurrentState(),
      );

      expect(patch).toStrictEqual({
        assetsInfo: {
          [FLARE_ASSET_ID]: {
            type: 'erc20',
            symbol: 'TST',
            name: 'Test Token',
            decimals: 18,
            image: 'https://example.com/tst.png',
            aggregators: ['CoinGecko'],
          },
        },
        customAssets: {
          [ACCOUNT_ID]: [FLARE_ASSET_ID],
        },
      });
    });

    it('checksums lowercase token addresses in the healed asset ID', () => {
      const patch = healAssetsInfoMetadata(
        buildLegacyState(VALID_TOKEN),
        buildCurrentState(),
      );

      expect(Object.keys(patch?.assetsInfo ?? {})).toStrictEqual([
        FLARE_ASSET_ID,
      ]);
    });

    it('falls back to the symbol when the name is missing, and 0 when decimals are invalid', () => {
      const patch = healAssetsInfoMetadata(
        buildLegacyState({
          address: TOKEN_ADDRESS_LOWER,
          symbol: 'TST',
          decimals: 'eighteen',
        }),
        buildCurrentState(),
      );

      expect(patch?.assetsInfo[FLARE_ASSET_ID]).toStrictEqual({
        type: 'erc20',
        symbol: 'TST',
        name: 'TST',
        decimals: 0,
      });
    });

    it('omits empty images and filters non-string aggregators', () => {
      const patch = healAssetsInfoMetadata(
        buildLegacyState({
          ...VALID_TOKEN,
          image: '',
          aggregators: ['CoinGecko', 42, null],
        }),
        buildCurrentState(),
      );

      expect(patch?.assetsInfo[FLARE_ASSET_ID]).toStrictEqual({
        type: 'erc20',
        symbol: 'TST',
        name: 'Test Token',
        decimals: 18,
        aggregators: ['CoinGecko'],
      });
    });

    it('matches the legacy account address case-insensitively', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            [FLARE_HEX_CHAIN_ID]: {
              [ACCOUNT_ADDRESS.toUpperCase().replace('0X', '0x')]: [
                VALID_TOKEN,
              ],
            },
          },
        },
        AccountsController: {
          internalAccounts: {
            accounts: { [ACCOUNT_ID]: { address: ACCOUNT_ADDRESS } },
          },
        },
      };

      const patch = healAssetsInfoMetadata(legacyState, buildCurrentState());

      expect(patch?.customAssets).toStrictEqual({
        [ACCOUNT_ID]: [FLARE_ASSET_ID],
      });
    });

    it('heals assetsInfo without custom assets when no account mapping exists', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            [FLARE_HEX_CHAIN_ID]: { [ACCOUNT_ADDRESS]: [VALID_TOKEN] },
          },
        },
      };

      const patch = healAssetsInfoMetadata(legacyState, buildCurrentState());

      expect(patch?.assetsInfo[FLARE_ASSET_ID]).toBeDefined();
      expect(patch?.customAssets).toStrictEqual({});
    });

    it('dedupes duplicate token entries within the same account list', () => {
      const patch = healAssetsInfoMetadata(
        buildLegacyState(VALID_TOKEN),
        buildCurrentState(),
      );
      const patchWithDuplicates = healAssetsInfoMetadata(
        {
          ...(buildLegacyState(VALID_TOKEN) as Record<string, unknown>),
          TokensController: {
            allTokens: {
              [FLARE_HEX_CHAIN_ID]: {
                [ACCOUNT_ADDRESS]: [VALID_TOKEN, { ...VALID_TOKEN }],
              },
            },
          },
        },
        buildCurrentState(),
      );

      expect(patchWithDuplicates).toStrictEqual(patch);
    });

    it('dedupes the same token across accounts (metadata once, tracking per account)', () => {
      const otherAccountAddress = '0x2222222222222222222222222222222222222222';
      const otherAccountId = 'account-uuid-2';
      const legacyState = {
        TokensController: {
          allTokens: {
            [FLARE_HEX_CHAIN_ID]: {
              [ACCOUNT_ADDRESS]: [VALID_TOKEN],
              [otherAccountAddress]: [VALID_TOKEN],
            },
          },
        },
        AccountsController: {
          internalAccounts: {
            accounts: {
              [ACCOUNT_ID]: { address: ACCOUNT_ADDRESS },
              [otherAccountId]: { address: otherAccountAddress },
            },
          },
        },
      };

      const patch = healAssetsInfoMetadata(legacyState, buildCurrentState());

      expect(Object.keys(patch?.assetsInfo ?? {})).toStrictEqual([
        FLARE_ASSET_ID,
      ]);
      expect(patch?.customAssets).toStrictEqual({
        [ACCOUNT_ID]: [FLARE_ASSET_ID],
        [otherAccountId]: [FLARE_ASSET_ID],
      });
    });
  });

  describe('skipping tokens that must not be healed', () => {
    it('skips chains supported by the Accounts API', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            '0x1': { [ACCOUNT_ADDRESS]: [VALID_TOKEN] },
          },
        },
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it('skips ERC-721 tokens', () => {
      expect(
        healAssetsInfoMetadata(
          buildLegacyState({ ...VALID_TOKEN, isERC721: true }),
          buildCurrentState(),
        ),
      ).toBeNull();
    });

    it('skips tokens ignored in the legacy allIgnoredTokens (case-insensitive)', () => {
      const legacyState = {
        TokensController: {
          allTokens: {
            [FLARE_HEX_CHAIN_ID]: { [ACCOUNT_ADDRESS]: [VALID_TOKEN] },
          },
          allIgnoredTokens: {
            [FLARE_HEX_CHAIN_ID]: {
              [ACCOUNT_ADDRESS.toUpperCase().replace('0X', '0x')]: [
                TOKEN_ADDRESS_CHECKSUMMED,
              ],
            },
          },
        },
      };

      expect(
        healAssetsInfoMetadata(legacyState, buildCurrentState()),
      ).toBeNull();
    });

    it('skips tokens hidden via current assetPreferences (case-insensitive)', () => {
      const currentState = buildCurrentState({
        assetPreferences: {
          [FLARE_ASSET_ID.toLowerCase() as Caip19AssetId]: { hidden: true },
        },
      });

      expect(
        healAssetsInfoMetadata(buildLegacyState(VALID_TOKEN), currentState),
      ).toBeNull();
    });

    it('does not skip tokens whose preference exists but is not hidden', () => {
      const currentState = buildCurrentState({
        assetPreferences: { [FLARE_ASSET_ID]: { hidden: false } },
      });

      const patch = healAssetsInfoMetadata(
        buildLegacyState(VALID_TOKEN),
        currentState,
      );

      expect(patch?.assetsInfo[FLARE_ASSET_ID]).toBeDefined();
    });
  });

  describe('idempotency against current state', () => {
    it('never overwrites existing assetsInfo entries but still tracks the custom asset', () => {
      const currentState = buildCurrentState({
        assetsInfo: {
          [FLARE_ASSET_ID]: {
            type: 'erc20',
            symbol: 'EXISTING',
            name: 'Existing Token',
            decimals: 6,
          },
        },
      });

      const patch = healAssetsInfoMetadata(
        buildLegacyState(VALID_TOKEN),
        currentState,
      );

      expect(patch).toStrictEqual({
        assetsInfo: {},
        customAssets: { [ACCOUNT_ID]: [FLARE_ASSET_ID] },
      });
    });

    it('does not track the custom asset when a balance entry already exists', () => {
      const currentState = buildCurrentState({
        assetsBalance: {
          [ACCOUNT_ID]: { [FLARE_ASSET_ID]: { amount: '1' } },
        },
      });

      const patch = healAssetsInfoMetadata(
        buildLegacyState(VALID_TOKEN),
        currentState,
      );

      expect(patch?.customAssets).toStrictEqual({});
    });

    it('does not track the custom asset when it is already in customAssets', () => {
      const currentState = buildCurrentState({
        customAssets: { [ACCOUNT_ID]: [FLARE_ASSET_ID] },
      });

      const patch = healAssetsInfoMetadata(
        buildLegacyState(VALID_TOKEN),
        currentState,
      );

      expect(patch?.customAssets).toStrictEqual({});
    });

    it('returns null when everything is already healed', () => {
      const currentState = buildCurrentState({
        assetsInfo: {
          [FLARE_ASSET_ID]: {
            type: 'erc20',
            symbol: 'TST',
            name: 'Test Token',
            decimals: 18,
          },
        },
        customAssets: { [ACCOUNT_ID]: [FLARE_ASSET_ID] },
      });

      expect(
        healAssetsInfoMetadata(buildLegacyState(VALID_TOKEN), currentState),
      ).toBeNull();
    });
  });
});

describe('tempHealAssetsInfoMetadata', () => {
  /**
   * Build a full controller state for tempHealAssetsInfoMetadata tests.
   *
   * @param overrides - Partial state slices to merge over the defaults.
   * @returns Full controller state.
   */
  function buildFullState(
    overrides: Partial<CurrentAssetsState> = {},
  ): AssetsControllerStateInternal {
    return {
      assetsInfo: {},
      assetsBalance: {},
      assetsPrice: {},
      customAssets: {},
      assetPreferences: {},
      selectedCurrency: 'usd',
      ...overrides,
    };
  }

  it('returns healed state with the healing patch applied', () => {
    const state = buildFullState();

    const healedState = tempHealAssetsInfoMetadata({
      state,
      getMigrationState: () => buildLegacyState(VALID_TOKEN),
    });

    expect(healedState.assetsInfo[FLARE_ASSET_ID]).toStrictEqual({
      type: 'erc20',
      symbol: 'TST',
      name: 'Test Token',
      decimals: 18,
    });
    expect(healedState.customAssets[ACCOUNT_ID]).toStrictEqual([
      FLARE_ASSET_ID,
    ]);
    expect(state).toStrictEqual(buildFullState());
  });

  it('returns the original state when there is nothing to heal', () => {
    const state = buildFullState();

    const healedState = tempHealAssetsInfoMetadata({
      state,
      getMigrationState: () => ({ unrelated: true }),
    });

    expect(healedState).toBe(state);
  });

  it('does not mutate existing customAssets arrays on the input state', () => {
    const otherAssetId =
      'eip155:14/erc20:0x0000000000000000000000000000000000000001' as Caip19AssetId;
    const existingCustomAssets = [otherAssetId];
    const state = buildFullState({
      customAssets: { [ACCOUNT_ID]: existingCustomAssets },
    });

    tempHealAssetsInfoMetadata({
      state,
      getMigrationState: () => buildLegacyState(VALID_TOKEN),
    });

    expect(existingCustomAssets).toStrictEqual([otherAssetId]);
    expect(state.customAssets[ACCOUNT_ID]).toBe(existingCustomAssets);
  });

  it('is idempotent: re-running never duplicates or overwrites entries', () => {
    const otherAssetId =
      'eip155:14/erc20:0x0000000000000000000000000000000000000001' as Caip19AssetId;
    const state = buildFullState({
      customAssets: { [ACCOUNT_ID]: [otherAssetId] },
    });
    const getMigrationState = (): unknown => buildLegacyState(VALID_TOKEN);

    const afterFirstRun = tempHealAssetsInfoMetadata({
      state,
      getMigrationState,
    });
    const afterSecondRun = tempHealAssetsInfoMetadata({
      state: afterFirstRun,
      getMigrationState,
    });

    expect(afterSecondRun).toStrictEqual(afterFirstRun);
    expect(afterSecondRun.customAssets[ACCOUNT_ID]).toStrictEqual([
      otherAssetId,
      FLARE_ASSET_ID,
    ]);
  });

  it('reports errors thrown by getMigrationState via captureException without throwing', () => {
    const state = buildFullState();
    const captureException = jest.fn();

    let healedState: AssetsControllerStateInternal | undefined;
    expect(() => {
      healedState = tempHealAssetsInfoMetadata({
        state,
        getMigrationState: () => {
          throw new Error('legacy state unavailable');
        },
        captureException,
      });
    }).not.toThrow();

    expect(healedState).toBe(state);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('legacy state unavailable'),
      }),
    );
  });

  it('swallows errors even when captureException is not provided', () => {
    const state = buildFullState();

    expect(() => {
      tempHealAssetsInfoMetadata({
        state,
        getMigrationState: () => {
          throw new Error('legacy state unavailable');
        },
      });
    }).not.toThrow();
  });
});

describe('cleanSpamAssets', () => {
  /**
   * Run the sweep and apply the resulting patch to a copy of the state, the
   * way the controller applies it inside `update`.
   *
   * @param state - Current controller state (never mutated).
   * @param captureException - Optional reporter for failures.
   * @returns The cleaned state copy, or the original state when the sweep has
   * nothing to remove or fails.
   */
  async function runCleanup(
    state: CleanSpamAssetsState,
    captureException?: (error: Error) => void,
  ): Promise<CleanSpamAssetsState> {
    const result = await cleanSpamAssets({
      state,
      apiClient: createTestApiClient(),
      captureException,
    });
    if (!result) {
      return state;
    }
    const nextState = cloneDeep(state);
    result.applyPatch(nextState, { spamAssetIds: result.spamAssetIds });
    return nextState;
  }

  function removedAssetIds(
    before: CleanSpamAssetsState,
    after: CleanSpamAssetsState,
  ): string[] {
    const remaining = new Set(Object.keys(after.assetsInfo));
    return Object.keys(before.assetsInfo)
      .filter((assetId) => !remaining.has(assetId))
      .sort();
  }

  const classificationCases: {
    description: string;
    held: Caip19AssetId[];
    omittedFromResponse?: Caip19AssetId[];
    removed: Caip19AssetId[];
    casing?: 'lowercase' | 'checksum';
  }[] = [
    {
      description: 'drops every spam token and keeps every genuine one',
      held: [...SURVIVING_ASSET_IDS, ...SPAM_ASSET_IDS],
      removed: SPAM_ASSET_IDS,
    },
    {
      // Both tokens appear in two lists. Sei's suggested floor is one, and
      // Optimism, which the endpoint does not cover, falls back to three.
      description:
        'spares a thinly listed token on a chain the API sets a lower floor for',
      held: [SEI_USDCN, OPTIMISM_SPAM],
      removed: [OPTIMISM_SPAM],
    },
    {
      // Fartcoin sits exactly on the fallback floor, the airdrop one below it.
      description:
        'falls back to a floor of three on chains the API does not cover',
      held: [BASE_FARTCOIN, OPTIMISM_SPAM],
      removed: [OPTIMISM_SPAM],
    },
    {
      // The API answers for these with an empty stub rather than a real entry.
      description: 'drops a token the API has never indexed',
      held: [BASE_SPAM],
      removed: [BASE_SPAM],
    },
    {
      // Which is how it answers for every Monad token today, so a real Wrapped
      // MON holding is swept along with the spam.
      description:
        'drops a token the API describes but reports no occurrence count for',
      held: [MONAD_WMON],
      removed: [MONAD_WMON],
    },
    {
      description: 'drops a token the API leaves out of its response',
      held: [MAINNET_USDT, OPTIMISM_USDC],
      omittedFromResponse: [MAINNET_USDT],
      removed: [MAINNET_USDT],
    },
    {
      // State keys are EIP-55 checksummed; the API answers in lowercase.
      description: 'matches the API response to state keys case-insensitively',
      held: [OPTIMISM_USDC],
      removed: [],
    },
    {
      // State keys are lowercase; the API answers in EIP-55 checksummed.
      description:
        'matches the API response to state keys case-insensitively when API answers in checksummed IDs',
      held: [OPTIMISM_USDC.toLowerCase() as Caip19AssetId],
      removed: [],
      casing: 'checksum',
    },
  ];

  it.each(classificationCases)(
    '$description',
    async ({ held, omittedFromResponse, removed, casing }) => {
      mockSuggestedOccurrenceFloors();
      mockV3Assets({ omit: omittedFromResponse, casing });
      const state = buildSpamWalletState({ assetsInfo: buildAssetsInfo(held) });

      const nextState = await runCleanup(state);

      expect(removedAssetIds(state, nextState)).toStrictEqual(
        [...removed].sort(),
      );
    },
  );

  it('sweeps a wallet whose EVM asset IDs were never checksummed', async () => {
    // The wallet is keyed in lowercase but still imported GMX under its
    // checksummed ID, so the sweep has to hold that one back on a casing its
    // `assetsInfo` does not share.
    mockSuggestedOccurrenceFloors();
    const { requestedBatches } = mockV3Assets();
    const state = buildLowercasedSpamWalletState();
    const lowercasedSpamAssetIds = SPAM_ASSET_IDS.map((assetId) =>
      assetId.toLowerCase(),
    );

    const nextState = await runCleanup(state);

    expect([...requestedBatches[0]].sort()).toStrictEqual(
      SWEEPABLE_ASSET_IDS.map((assetId) => assetId.toLowerCase()).sort(),
    );
    expect(removedAssetIds(state, nextState)).toStrictEqual(
      [...lowercasedSpamAssetIds].sort(),
    );
    expect(
      Object.values(nextState.assetsBalance).flatMap((balances) =>
        Object.keys(balances),
      ),
    ).toStrictEqual(expect.not.arrayContaining(lowercasedSpamAssetIds));
  });

  it('sweeps a wallet whose EVM asset IDs were never checksummed when the API answers in checksummed IDs', async () => {
    mockSuggestedOccurrenceFloors();
    const { requestedBatches } = mockV3Assets({ casing: 'checksum' });
    const state = buildLowercasedSpamWalletState();
    const lowercasedSpamAssetIds = SPAM_ASSET_IDS.map((assetId) =>
      assetId.toLowerCase(),
    );

    const nextState = await runCleanup(state);

    expect([...requestedBatches[0]].sort()).toStrictEqual(
      SWEEPABLE_ASSET_IDS.map((assetId) => assetId.toLowerCase()).sort(),
    );
    expect(removedAssetIds(state, nextState)).toStrictEqual(
      [...lowercasedSpamAssetIds].sort(),
    );
    expect(
      Object.values(nextState.assetsBalance).flatMap((balances) =>
        Object.keys(balances),
      ),
    ).toStrictEqual(expect.not.arrayContaining(lowercasedSpamAssetIds));
  });

  it('leaves native, non-EVM, niche-chain, default-tracked, and imported assets out of the sweep', async () => {
    mockSuggestedOccurrenceFloors();
    const { requestedBatches } = mockV3Assets();
    const state = buildSpamWalletState();

    const nextState = await runCleanup(state);

    expect([...requestedBatches[0]].sort()).toStrictEqual(
      [...SWEEPABLE_ASSET_IDS].sort(),
    );
    for (const assetId of OUT_OF_SCOPE_ASSET_IDS) {
      expect(nextState.assetsInfo[assetId]).toStrictEqual(
        SPAM_WALLET_ASSETS_INFO[assetId],
      );
    }
  });

  it('makes no network calls when nothing is in scope', async () => {
    const floorsScope = mockSuggestedOccurrenceFloors();
    const { scope: assetsScope } = mockV3Assets();
    const state = buildSpamWalletState({
      assetsInfo: buildAssetsInfo(OUT_OF_SCOPE_ASSET_IDS),
    });

    const nextState = await runCleanup(state);

    expect(nextState).toBe(state);
    expect(floorsScope.isDone()).toBe(false);
    expect(assetsScope.isDone()).toBe(false);
  });

  it('returns the state it was given when every token clears its floor', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();
    const state = buildSpamWalletState({
      assetsInfo: buildAssetsInfo([MAINNET_USDT, OPTIMISM_USDC, BASE_USDC]),
    });

    const nextState = await runCleanup(state);

    expect(nextState).toBe(state);
  });

  it('stops tracking a spam token for every account holding it', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();
    const state = buildSpamWalletState();

    const nextState = await runCleanup(state);

    expect(nextState.assetsBalance).toStrictEqual({
      [ACCOUNT_ONE_ID]: {
        [MAINNET_NATIVE]: { amount: '1204500000000000000' },
        [MAINNET_USDT]: { amount: '2500000000' },
        [OPTIMISM_USDC]: { amount: '148230000' },
        [SEI_USDCN]: { amount: '74500000' },
      },
      [ACCOUNT_TWO_ID]: {
        [BASE_FARTCOIN]: { amount: '1200000000000000000000' },
        [ARBITRUM_GMX]: { amount: '3400000000000000000' },
      },
    });
    expect(nextState.customAssets).toStrictEqual(state.customAssets);
  });

  it('does not mutate the state it was given', async () => {
    mockSuggestedOccurrenceFloors();
    mockV3Assets();
    const state = buildSpamWalletState();
    const snapshot = structuredClone(state);

    await cleanSpamAssets({ state, apiClient: createTestApiClient() });

    expect(state).toStrictEqual(snapshot);
  });

  it('refetches occurrence data on every sweep rather than reusing the cache', async () => {
    // Cached counts would classify the wallet against a stale token list.
    mockSuggestedOccurrenceFloors({ times: 2 });
    const { requestedBatches } = mockV3Assets({ times: 2 });
    const state = buildSpamWalletState({
      assetsInfo: buildAssetsInfo([MAINNET_USDT]),
    });
    const apiClient = createTestApiClient();

    await cleanSpamAssets({ state, apiClient });
    await cleanSpamAssets({ state, apiClient });

    expect(requestedBatches).toStrictEqual([[MAINNET_USDT], [MAINNET_USDT]]);
  });

  it('sweeps large wallets in batches of 50', async () => {
    const { state } = buildManyTokensState(51);
    mockSuggestedOccurrenceFloors();
    const { requestedBatches } = mockV3Assets({
      occurrences: {},
      times: 2,
    });

    const nextState = await runCleanup(state);

    expect(requestedBatches.map((batch) => batch.length)).toStrictEqual([
      50, 1,
    ]);
    expect(nextState.assetsInfo).toStrictEqual({});
  });

  it('finishes the sweep when a single batch fails', async () => {
    const { assetIds, state } = buildManyTokensState(101);
    mockSuggestedOccurrenceFloors();
    mockV3Assets({ occurrences: {} });
    mockV3Assets({ status: 502 });
    mockV3Assets({ occurrences: {} });
    const captureException = jest.fn();

    const nextState = await runCleanup(state);

    // The 50 assets in the failed batch stay put; the other 51 are dropped.
    expect(Object.keys(nextState.assetsInfo)).toStrictEqual(
      assetIds.slice(50, 100),
    );
    expect(captureException).not.toHaveBeenCalled();
  });

  it('leaves every asset in place and reports when the floors endpoint fails', async () => {
    mockSuggestedOccurrenceFloors({ status: 503 });
    const { scope: assetsScope } = mockV3Assets();
    const state = buildSpamWalletState();
    const captureException = jest.fn();

    const nextState = await runCleanup(state, captureException);

    expect(nextState).toBe(state);
    expect(assetsScope.isDone()).toBe(false);
    expect(captureException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('503'),
      }),
    );
  });

  it('swallows failures when no captureException is provided', async () => {
    mockSuggestedOccurrenceFloors({ status: 503 });
    const state = buildSpamWalletState();

    expect(await runCleanup(state)).toBe(state);
  });
});
