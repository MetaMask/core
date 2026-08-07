import type { AssetsControllerState } from '../AssetsController.js';
import type { AssetMetadata, AssetPrice, Caip19AssetId } from '../types.js';
import { cleanupUnusedMetadata } from './cleanupUnusedMetadata.js';

const SELECTED_ACCOUNT = 'account-1';
const OTHER_ACCOUNT = 'account-2';

/** USDC on mainnet (checksummed). */
const HELD_ASSET = 'eip155:1/erc20:0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
/** DAI on mainnet. */
const UNREFERENCED_ASSET =
  'eip155:1/erc20:0x6B175474E89094C44Da98b954EedeAC495271d0F';
/** USDT on mainnet. */
const ZERO_BALANCE_ASSET =
  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7';
/** cbETH on Base. */
const CUSTOM_ASSET =
  'eip155:8453/erc20:0x2Ae3F1Ec7F1F5012CFEab0185bfc7aa3cf0DEc22';
/** ETH on mainnet. */
const NATIVE_SLIP44_ASSET = 'eip155:1/slip44:60';
/** SOL — slip44 native on a chain outside the hardcoded (EVM-only) registry. */
const NATIVE_SOLANA_ASSET =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/slip44:501';
/** Zero-address ERC-20 native convention on a chain with no registry entry. */
const NATIVE_ZERO_ADDRESS_ASSET =
  'eip155:424242/erc20:0x0000000000000000000000000000000000000000';
/** METIS — native only recognizable through the hardcoded registry. */
const NATIVE_REGISTRY_ASSET =
  'eip155:1088/erc20:0xdeaddeaddeaddeaddeaddeaddeaddeaddead0000';
/** mUSD on Monad — default tracked, has metadata but no balance until the chain is enabled. */
const MUSD_ON_MONAD_ASSET =
  'eip155:143/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA';
/** BAYC #1234 — NFT asset IDs carry a tokenId suffix. */
const NFT_ASSET =
  'eip155:1/erc721:0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D/1234';

function buildMetadata(symbol: string): AssetMetadata {
  return { type: 'erc20', symbol, name: symbol, decimals: 18 };
}

function buildPrice(value: number): AssetPrice {
  return {
    assetPriceType: 'fungible',
    price: value,
    usdPrice: value,
    lastUpdated: 1700000000000,
  };
}

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

type CleanupCase = {
  description: string;
  assetId: string;
  /** State slices referencing the asset (none means unreferenced). */
  references?: Partial<AssetsControllerState>;
  expectKept: boolean;
};

const cleanupCases: CleanupCase[] = [
  {
    description: 'removes an asset that nothing references',
    assetId: UNREFERENCED_ASSET,
    expectKept: false,
  },
  {
    description: 'removes a malformed asset ID that nothing references',
    assetId: 'not-a-caip-id',
    expectKept: false,
  },
  {
    description: 'removes an unreferenced NFT asset ID',
    assetId: NFT_ASSET,
    expectKept: false,
  },
  {
    description: 'keeps an asset with a non-zero balance',
    assetId: HELD_ASSET,
    references: {
      assetsBalance: { [SELECTED_ACCOUNT]: { [HELD_ASSET]: { amount: '5' } } },
    },
    expectKept: true,
  },
  {
    description: 'keeps an asset whose only balance entry is a zero amount',
    assetId: ZERO_BALANCE_ASSET,
    references: {
      assetsBalance: {
        [SELECTED_ACCOUNT]: { [ZERO_BALANCE_ASSET]: { amount: '0' } },
      },
    },
    expectKept: true,
  },
  {
    description: 'keeps an asset held only by a non-selected account',
    assetId: HELD_ASSET,
    references: {
      assetsBalance: {
        [SELECTED_ACCOUNT]: {},
        [OTHER_ACCOUNT]: { [HELD_ASSET]: { amount: '42' } },
      },
    },
    expectKept: true,
  },
  {
    description: 'keeps an asset that is only referenced by customAssets',
    assetId: CUSTOM_ASSET,
    references: { customAssets: { [SELECTED_ACCOUNT]: [CUSTOM_ASSET] } },
    expectKept: true,
  },
  {
    description: 'keeps an asset whose balance key differs in casing',
    assetId: HELD_ASSET,
    references: {
      assetsBalance: {
        [SELECTED_ACCOUNT]: { [HELD_ASSET.toLowerCase()]: { amount: '1' } },
      },
    },
    expectKept: true,
  },
  {
    description: 'keeps an asset whose customAssets entry differs in casing',
    assetId: CUSTOM_ASSET,
    references: {
      customAssets: {
        [SELECTED_ACCOUNT]: [CUSTOM_ASSET.toLowerCase() as Caip19AssetId],
      },
    },
    expectKept: true,
  },
  {
    description: 'keeps a malformed asset ID that a balance entry references',
    assetId: 'not-a-caip-id',
    references: {
      assetsBalance: {
        [SELECTED_ACCOUNT]: { 'not-a-caip-id': { amount: '1' } },
      },
    },
    expectKept: true,
  },
  {
    description: 'keeps a slip44 native asset',
    assetId: NATIVE_SLIP44_ASSET,
    expectKept: true,
  },
  {
    description: 'keeps a slip44 native on a chain outside the native registry',
    assetId: NATIVE_SOLANA_ASSET,
    expectKept: true,
  },
  {
    description: 'keeps a zero-address ERC-20 native',
    assetId: NATIVE_ZERO_ADDRESS_ASSET,
    expectKept: true,
  },
  {
    description: 'keeps a registry-only native (METIS dead address)',
    assetId: NATIVE_REGISTRY_ASSET,
    expectKept: true,
  },
  {
    description:
      'keeps a default tracked asset with no balance (mUSD on a disabled chain)',
    assetId: MUSD_ON_MONAD_ASSET,
    expectKept: true,
  },
];

describe('cleanupUnusedMetadata', () => {
  it.each(cleanupCases)(
    '$description',
    ({ assetId, references = {}, expectKept }) => {
      const state = buildState({
        assetsInfo: { [assetId]: buildMetadata('TEST') },
        assetsPrice: { [assetId]: buildPrice(1) },
        ...references,
      });

      cleanupUnusedMetadata(state);

      expect(state.assetsInfo).toStrictEqual(
        expectKept ? { [assetId]: buildMetadata('TEST') } : {},
      );
      expect(state.assetsPrice).toStrictEqual(
        expectKept ? { [assetId]: buildPrice(1) } : {},
      );
    },
  );

  it('removes only unreferenced entries, leaving referenced ones in place', () => {
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
    expect(state.assetsPrice).toStrictEqual({ [HELD_ASSET]: buildPrice(1) });
  });

  it('removes an unreferenced price entry even when the asset has no assetsInfo entry', () => {
    const state = buildState({
      assetsPrice: { [UNREFERENCED_ASSET]: buildPrice(1) },
    });

    cleanupUnusedMetadata(state);

    expect(state.assetsPrice).toStrictEqual({});
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

  it('does nothing on empty state', () => {
    const state = buildState();

    cleanupUnusedMetadata(state);

    expect(state).toStrictEqual(buildState());
  });
});
