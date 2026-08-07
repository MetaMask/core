import type { AssetsControllerState } from '../AssetsController.js';
import type { AssetMetadata, AssetPrice } from '../types.js';
import { cleanupUnusedMetadata } from './cleanupUnusedMetadata.js';

const SELECTED_ACCOUNT = 'account-1';
const OTHER_ACCOUNT = 'account-2';

/** USDC on mainnet — held (non-zero balance) in most tests. */
const HELD_ASSET = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';

/** DAI on mainnet — never referenced by any state slice. */
const UNREFERENCED_ASSET =
  'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F';

/** USDT on mainnet — only referenced through a zero-amount balance entry. */
const ZERO_BALANCE_ASSET =
  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7';

/** cbETH on Base — only referenced through `customAssets`. */
const CUSTOM_ASSET =
  'eip155:8453/erc20:0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22';

/** ETH on mainnet — native via the `slip44` asset namespace. */
const NATIVE_SLIP44_ASSET = 'eip155:1/slip44:60';

/**
 * SOL on Solana — a `slip44` native on a chain that is not in the hardcoded
 * native asset registry (which only covers EVM chains).
 */
const NATIVE_SOLANA_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';

/**
 * Native asset on a made-up chain represented with the zero-address ERC-20
 * convention (like Gnosis xDAI); not present in any native asset registry.
 */
const NATIVE_ZERO_ADDRESS_ASSET =
  'eip155:424242/erc20:0x0000000000000000000000000000000000000000';

/**
 * METIS on Metis Andromeda — native represented as a non-zero "dead" ERC-20
 * address; only recognizable through the native asset registry constant.
 */
const NATIVE_REGISTRY_ASSET =
  'eip155:1088/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000';

/**
 * mUSD on Monad — a default tracked asset
 * (`DEFAULT_TRACKED_ASSETS_BY_CHAIN`). Its metadata is pre-seeded into
 * `assetsInfo` by `getDefaultAssetsControllerState`, but no balance entry
 * exists until the user enables the Monad network.
 */
const MUSD_ON_MONAD_ASSET =
  'eip155:143/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA';

/**
 * Build metadata for a fungible test asset.
 *
 * @param symbol - Token symbol.
 * @returns Minimal ERC-20 metadata.
 */
function buildMetadata(symbol: string): AssetMetadata {
  return { type: 'erc20', symbol, name: symbol, decimals: 18 };
}

/**
 * Build a price entry for a fungible test asset.
 *
 * @param value - Price in the selected currency and USD.
 * @returns Minimal fungible price data.
 */
function buildPrice(value: number): AssetPrice {
  return {
    assetPriceType: 'fungible',
    price: value,
    usdPrice: value,
    lastUpdated: 1700000000000,
  };
}

/**
 * Build a plain `AssetsControllerState` object for tests.
 *
 * @param overrides - State slices to override.
 * @returns A complete state object.
 */
function buildState(
  overrides: Partial<AssetsControllerState> = {},
): AssetsControllerState {
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

describe('cleanupUnusedMetadata', () => {
  it('removes assetsInfo and assetsPrice entries that nothing references', () => {
    const state = buildState({
      assetsInfo: {
        [HELD_ASSET]: buildMetadata('USDC'),
        [UNREFERENCED_ASSET]: buildMetadata('DAI'),
      },
      assetsPrice: {
        [HELD_ASSET]: buildPrice(1),
        [UNREFERENCED_ASSET]: buildPrice(1),
      },
      assetsBalance: {
        [SELECTED_ACCOUNT]: { [HELD_ASSET]: { amount: '5000000' } },
      },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({
      [HELD_ASSET]: buildMetadata('USDC'),
    });
    expect(state.assetsPrice).toStrictEqual({
      [HELD_ASSET]: buildPrice(1),
    });
  });

  it('removes an unreferenced price entry even when the asset has no assetsInfo entry', () => {
    const state = buildState({
      assetsPrice: { [UNREFERENCED_ASSET]: buildPrice(1) },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsPrice).toStrictEqual({});
  });

  it('keeps an asset whose only balance entry is a zero amount', () => {
    const state = buildState({
      assetsInfo: { [ZERO_BALANCE_ASSET]: buildMetadata('USDT') },
      assetsPrice: { [ZERO_BALANCE_ASSET]: buildPrice(1) },
      assetsBalance: {
        [SELECTED_ACCOUNT]: { [ZERO_BALANCE_ASSET]: { amount: '0' } },
      },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({
      [ZERO_BALANCE_ASSET]: buildMetadata('USDT'),
    });
    expect(state.assetsPrice).toStrictEqual({
      [ZERO_BALANCE_ASSET]: buildPrice(1),
    });
  });

  it('keeps an asset that is only referenced by customAssets', () => {
    const state = buildState({
      assetsInfo: { [CUSTOM_ASSET]: buildMetadata('cbETH') },
      assetsPrice: { [CUSTOM_ASSET]: buildPrice(2000) },
      customAssets: { [SELECTED_ACCOUNT]: [CUSTOM_ASSET] },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({
      [CUSTOM_ASSET]: buildMetadata('cbETH'),
    });
    expect(state.assetsPrice).toStrictEqual({
      [CUSTOM_ASSET]: buildPrice(2000),
    });
  });

  it('keeps native assets even when no account has a balance entry for them', () => {
    const state = buildState({
      assetsInfo: {
        [NATIVE_SLIP44_ASSET]: buildMetadata('ETH'),
        [NATIVE_SOLANA_ASSET]: buildMetadata('SOL'),
        [NATIVE_ZERO_ADDRESS_ASSET]: buildMetadata('XDAI'),
        [NATIVE_REGISTRY_ASSET]: buildMetadata('METIS'),
      },
      assetsPrice: {
        [NATIVE_SLIP44_ASSET]: buildPrice(3000),
        [NATIVE_SOLANA_ASSET]: buildPrice(150),
        [NATIVE_ZERO_ADDRESS_ASSET]: buildPrice(1),
        [NATIVE_REGISTRY_ASSET]: buildPrice(30),
      },
    });

    cleanupUnusedMetadata(state);

    expect(Object.keys(state.assetsInfo)).toStrictEqual([
      NATIVE_SLIP44_ASSET,
      NATIVE_SOLANA_ASSET,
      NATIVE_ZERO_ADDRESS_ASSET,
      NATIVE_REGISTRY_ASSET,
    ]);
    expect(Object.keys(state.assetsPrice)).toStrictEqual([
      NATIVE_SLIP44_ASSET,
      NATIVE_SOLANA_ASSET,
      NATIVE_ZERO_ADDRESS_ASSET,
      NATIVE_REGISTRY_ASSET,
    ]);
  });

  it('keeps default tracked assets with no balance entry (mUSD on a chain that is not enabled)', () => {
    // Mirrors real startup state: `getDefaultAssetsControllerState`
    // pre-seeds mUSD metadata for Monad, but no balance is seeded because
    // `#ensureDefaultTrackedAssetsSeeded` only covers enabled chains.
    const state = buildState({
      assetsInfo: { [MUSD_ON_MONAD_ASSET]: buildMetadata('mUSD') },
      assetsPrice: { [MUSD_ON_MONAD_ASSET]: buildPrice(1) },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({
      [MUSD_ON_MONAD_ASSET]: buildMetadata('mUSD'),
    });
    expect(state.assetsPrice).toStrictEqual({
      [MUSD_ON_MONAD_ASSET]: buildPrice(1),
    });
  });

  it('keeps an asset held only by a non-selected account', () => {
    const state = buildState({
      assetsInfo: { [HELD_ASSET]: buildMetadata('USDC') },
      assetsPrice: { [HELD_ASSET]: buildPrice(1) },
      assetsBalance: {
        [SELECTED_ACCOUNT]: {},
        [OTHER_ACCOUNT]: { [HELD_ASSET]: { amount: '42' } },
      },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({
      [HELD_ASSET]: buildMetadata('USDC'),
    });
    expect(state.assetsPrice).toStrictEqual({
      [HELD_ASSET]: buildPrice(1),
    });
  });

  it('compares asset IDs case-insensitively', () => {
    // Metadata/price keys are checksummed while the references are
    // lowercase — entries must still be recognized as referenced.
    const state = buildState({
      assetsInfo: {
        [HELD_ASSET]: buildMetadata('USDC'),
        [CUSTOM_ASSET]: buildMetadata('cbETH'),
      },
      assetsPrice: {
        [HELD_ASSET]: buildPrice(1),
        [CUSTOM_ASSET]: buildPrice(2000),
      },
      assetsBalance: {
        [SELECTED_ACCOUNT]: { [HELD_ASSET.toLowerCase()]: { amount: '1' } },
      },
      customAssets: {
        [SELECTED_ACCOUNT]: [
          CUSTOM_ASSET.toLowerCase() as `${string}:${string}/${string}:${string}`,
        ],
      },
    });

    cleanupUnusedMetadata(state);

    expect(Object.keys(state.assetsInfo)).toStrictEqual([
      HELD_ASSET,
      CUSTOM_ASSET,
    ]);
    expect(Object.keys(state.assetsPrice)).toStrictEqual([
      HELD_ASSET,
      CUSTOM_ASSET,
    ]);
  });

  it('leaves assetPreferences untouched, including entries for removed assets', () => {
    const state = buildState({
      assetsInfo: { [UNREFERENCED_ASSET]: buildMetadata('DAI') },
      assetsPrice: { [UNREFERENCED_ASSET]: buildPrice(1) },
      assetPreferences: {
        [UNREFERENCED_ASSET]: { hidden: true },
        [HELD_ASSET]: { hidden: false },
      },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({});
    expect(state.assetsPrice).toStrictEqual({});
    expect(state.assetPreferences).toStrictEqual({
      [UNREFERENCED_ASSET]: { hidden: true },
      [HELD_ASSET]: { hidden: false },
    });
  });

  it('removes malformed and NFT asset IDs without throwing when unreferenced', () => {
    const nftAssetId =
      'eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D/1234';
    const state = buildState({
      assetsInfo: {
        'not-a-caip-id': buildMetadata('JUNK'),
        [nftAssetId]: buildMetadata('BAYC'),
      },
      assetsPrice: { 'not-a-caip-id': buildPrice(0) },
    });

    expect(() => cleanupUnusedMetadata(state)).not.toThrow();

    expect(state.assetsInfo).toStrictEqual({});
    expect(state.assetsPrice).toStrictEqual({});
  });

  it('keeps a malformed asset ID that is still referenced by a balance entry', () => {
    const state = buildState({
      assetsInfo: { 'not-a-caip-id': buildMetadata('JUNK') },
      assetsBalance: {
        [SELECTED_ACCOUNT]: { 'not-a-caip-id': { amount: '1' } },
      },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsInfo).toStrictEqual({
      'not-a-caip-id': buildMetadata('JUNK'),
    });
  });

  it('does nothing on empty state', () => {
    const state = buildState();

    cleanupUnusedMetadata(state);

    expect(state).toStrictEqual(buildState());
  });
});
