import type { AssetsControllerStateInternal, Caip19AssetId } from '../types.js';
import type { CurrentAssetsState } from './healAssetsInfoMetadata.js';
import {
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
