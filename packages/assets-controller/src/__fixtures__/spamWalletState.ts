import { KnownCaipNamespace, getChecksumAddress } from '@metamask/utils';

import { getDefaultTrackedAssetsForChain } from '../defaults.js';
import type {
  AssetMetadata,
  AssetsControllerStateInternal,
  Caip19AssetId,
  ChainId,
} from '../types.js';

/**
 * A wallet that came through the boundary faults the spam sweep cleans up
 * after — the Token API loosening its filters, the websocket pushing
 * unfiltered balances. Airdrop spam sits in `assetsInfo` and in two accounts'
 * balances, next to genuine holdings, a hand-imported token, and the
 * default-tracked mUSD entry every wallet ships with.
 *
 * The tokens are real, and their metadata is what
 * `tokens.api.cx.metamask.io/v3/assets` returns for them today. Every EVM
 * asset ID is EIP-55 checksummed, the way the data sources write them into
 * state.
 */

export const ACCOUNT_ONE_ID = '5c6ab8b4-4f2c-4f21-9d0e-4ef1c1e6f0a2';
export const ACCOUNT_ONE_ADDRESS = '0x2f318C334780961FB129D2a6c30D0763d9a5C970';
export const ACCOUNT_TWO_ID = 'b0f1b8ba-3f18-4a1e-8c31-2b3ad9f6e771';
export const ACCOUNT_TWO_ADDRESS = '0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984';

/** mUSD on mainnet, pre-seeded into every wallet's `assetsInfo`. */
export const [MAINNET_MUSD] = getDefaultTrackedAssetsForChain(
  'eip155:1' as ChainId,
);
export const MAINNET_NATIVE = 'eip155:1/slip44:60' as Caip19AssetId;
export const MAINNET_USDT =
  'eip155:1/erc20:0xdAC17F958D2ee523a2206206994597C13D831ec7' as Caip19AssetId;
export const OPTIMISM_USDC =
  'eip155:10/erc20:0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85' as Caip19AssetId;
export const OPTIMISM_VELO =
  'eip155:10/erc20:0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db' as Caip19AssetId;
export const BASE_USDC =
  'eip155:8453/erc20:0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Caip19AssetId;
/** Sits exactly on the floor Base falls back to. */
export const BASE_FARTCOIN =
  'eip155:8453/erc20:0x2f6c17fa9f9bC3600346ab4e48C0701e1d5962AE' as Caip19AssetId;
/** Thinly listed, and only survives because Sei's suggested floor is 1. */
export const SEI_USDCN =
  'eip155:1329/erc20:0x3894085Ef7Ff0f0aeDf52E2A2704928d1Ec074F1' as Caip19AssetId;
/** Imported by hand, so tracked in `customAssets`. */
export const ARBITRUM_GMX =
  'eip155:42161/erc20:0xfc5A1A6EB076a2C7aD06eD22C90d7E710E35ad0a' as Caip19AssetId;
export const SOLANA_USDC =
  'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp/token:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' as Caip19AssetId;
/** Flare is not covered by the Accounts API, so its tokens were never detected. */
export const FLARE_SFLR =
  'eip155:14/erc20:0x12e605bc104e93B45e1aD99F9e555f659051c2BB' as Caip19AssetId;
/**
 * A real token the API describes but reports no occurrence count for, which is
 * how it answers for every Monad token today.
 */
export const MONAD_WMON =
  'eip155:143/erc20:0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A' as Caip19AssetId;

/**
 * mUSD on BNB Smart Chain (56) — a chain covered by the Accounts API but
 * absent from `DEFAULT_TRACKED_ASSETS_BY_CHAIN`'s mUSD entries (which only
 * seed Ethereum, Linea, and Monad). Real deployment, low real occurrence
 * count (matching the live Token API) — exactly the shape that used to lose
 * its spam-filter exemption on any chain outside that seeding list.
 */
export const BNB_MUSD =
  'eip155:56/erc20:0xacA92E438df0B2401fF60dA7E4337B687a2435DA' as Caip19AssetId;

export const MAINNET_SPAM =
  'eip155:1/erc20:0xB5f0e1b64a4a1a2A6cbf0E8f9d0c4e7A1b2C3D4E' as Caip19AssetId;
export const OPTIMISM_SPAM =
  'eip155:10/erc20:0x6A1f0b9c3e5d7a2B4C8E0f1a3D5B7C9E2F4A6b8d' as Caip19AssetId;
export const BASE_SPAM =
  'eip155:8453/erc20:0xD4e2a7B1C3f5089E6a4b8d0c2F7E9A1b3C5d7e9f' as Caip19AssetId;

/** The airdrop spam the sweep is expected to drop. */
export const SPAM_ASSET_IDS = [MAINNET_SPAM, OPTIMISM_SPAM, BASE_SPAM];

/** Everything else the fixture wallet holds, all of which must survive. */
export const SURVIVING_ASSET_IDS = [
  MAINNET_MUSD,
  MAINNET_NATIVE,
  MAINNET_USDT,
  OPTIMISM_USDC,
  OPTIMISM_VELO,
  BASE_USDC,
  BASE_FARTCOIN,
  SEI_USDCN,
  ARBITRUM_GMX,
  SOLANA_USDC,
  FLARE_SFLR,
];

/**
 * The assets the sweep is allowed to ask the Token API about: ERC-20s on
 * Accounts-API chains that are neither default-tracked nor user-imported.
 */
export const SWEEPABLE_ASSET_IDS = [
  MAINNET_USDT,
  MAINNET_SPAM,
  OPTIMISM_USDC,
  OPTIMISM_VELO,
  OPTIMISM_SPAM,
  BASE_USDC,
  BASE_FARTCOIN,
  BASE_SPAM,
  SEI_USDCN,
];

/** Assets the sweep must never consider, whatever the Token API says. */
export const OUT_OF_SCOPE_ASSET_IDS = [
  MAINNET_MUSD,
  MAINNET_NATIVE,
  SOLANA_USDC,
  FLARE_SFLR,
  ARBITRUM_GMX,
];

/**
 * Metadata for every token the fixtures know about, as the API describes it.
 */
const TOKEN_METADATA: Record<Caip19AssetId, AssetMetadata> = {
  [MAINNET_MUSD]: {
    type: 'erc20',
    symbol: 'MUSD',
    name: 'MetaMask USD',
    decimals: 6,
  },
  [MAINNET_NATIVE]: {
    type: 'native',
    symbol: 'ETH',
    name: 'Ether',
    decimals: 18,
  },
  [MAINNET_USDT]: {
    type: 'erc20',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
  },
  [MAINNET_SPAM]: {
    type: 'erc20',
    symbol: '$ USDC-Voucher.com',
    name: 'Claim 5,000 USDC at USDC-Voucher.com',
    decimals: 18,
  },
  [OPTIMISM_USDC]: {
    type: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  [OPTIMISM_VELO]: {
    type: 'erc20',
    symbol: 'VELO',
    name: 'Velodrome Finance',
    decimals: 18,
  },
  [OPTIMISM_SPAM]: {
    type: 'erc20',
    symbol: '! OP-Rewards.xyz',
    name: 'Visit OP-Rewards.xyz to unlock',
    decimals: 18,
  },
  [BASE_USDC]: {
    type: 'erc20',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
  },
  [BASE_FARTCOIN]: {
    type: 'erc20',
    symbol: 'FARTCOIN',
    name: 'Based Fartcoin',
    decimals: 18,
  },
  [BASE_SPAM]: {
    type: 'erc20',
    symbol: 'BASE-DROP',
    name: 'base-drop.net reward',
    decimals: 18,
  },
  [SEI_USDCN]: {
    type: 'erc20',
    symbol: 'USDCN',
    name: 'Noble USDC',
    decimals: 6,
  },
  [MONAD_WMON]: {
    type: 'erc20',
    symbol: 'WMON',
    name: 'Wrapped MON',
    decimals: 18,
  },
  [BNB_MUSD]: {
    type: 'erc20',
    symbol: 'MUSD',
    name: 'MetaMask USD',
    decimals: 6,
  },
  [ARBITRUM_GMX]: {
    type: 'erc20',
    symbol: 'GMX',
    name: 'GMX',
    decimals: 18,
  },
  [SOLANA_USDC]: {
    type: 'spl',
    symbol: 'USDC',
    name: 'USDC',
    decimals: 6,
  },
  [FLARE_SFLR]: {
    type: 'erc20',
    symbol: 'sFLR',
    name: 'Staked FLR',
    decimals: 18,
  },
};

/**
 * Build an `assetsInfo` registry holding only the given assets.
 *
 * @param assetIds - The assets to keep.
 * @returns The registry.
 */
export function buildAssetsInfo(
  assetIds: Caip19AssetId[],
): Record<Caip19AssetId, AssetMetadata> {
  return Object.fromEntries(
    assetIds.map((assetId) => [assetId, TOKEN_METADATA[assetId]]),
  );
}

/**
 * Look up the metadata the API holds for an asset, if it knows it at all.
 *
 * @param assetId - The CAIP-19 asset ID, in any casing.
 * @returns The metadata, or undefined for a token no list carries.
 */
export function findTokenMetadata(assetId: string): AssetMetadata | undefined {
  const match = Object.keys(TOKEN_METADATA).find(
    (knownId) => knownId.toLowerCase() === assetId.toLowerCase(),
  );
  return match ? TOKEN_METADATA[match as Caip19AssetId] : undefined;
}

export const SPAM_WALLET_ASSETS_INFO = buildAssetsInfo([
  ...SURVIVING_ASSET_IDS,
  ...SPAM_ASSET_IDS,
]);

export const SPAM_WALLET_BALANCES = {
  [ACCOUNT_ONE_ID]: {
    [MAINNET_NATIVE]: { amount: '1204500000000000000' },
    [MAINNET_USDT]: { amount: '2500000000' },
    [MAINNET_SPAM]: { amount: '5000000000000000000000' },
    [OPTIMISM_USDC]: { amount: '148230000' },
    [OPTIMISM_SPAM]: { amount: '1000000000000000000000' },
    [BASE_SPAM]: { amount: '4200000000000000000000' },
    [SEI_USDCN]: { amount: '74500000' },
  },
  [ACCOUNT_TWO_ID]: {
    [MAINNET_SPAM]: { amount: '5000000000000000000000' },
    [BASE_FARTCOIN]: { amount: '1200000000000000000000' },
    [ARBITRUM_GMX]: { amount: '3400000000000000000' },
  },
};

/**
 * Build the spam wallet's controller state.
 *
 * @param overrides - State slices to replace wholesale.
 * @returns Full internal controller state.
 */
export function buildSpamWalletState(
  overrides: Partial<AssetsControllerStateInternal> = {},
): AssetsControllerStateInternal {
  return {
    assetsInfo: { ...SPAM_WALLET_ASSETS_INFO },
    assetsBalance: structuredClone(SPAM_WALLET_BALANCES),
    assetsPrice: {
      [MAINNET_USDT]: {
        assetPriceType: 'fungible',
        price: 1.0002,
        lastUpdated: 1_756_200_000_000,
        usdPrice: 1.0002,
      },
    },
    customAssets: { [ACCOUNT_TWO_ID]: [ARBITRUM_GMX] },
    assetPreferences: { [OPTIMISM_VELO]: { hidden: true } },
    selectedCurrency: 'usd',
    ...overrides,
  };
}

/**
 * Build the spam wallet as a client that never checksummed its EVM asset IDs
 * holds it: `assetsInfo` and every account's balances are keyed in lowercase,
 * while `customAssets` keeps the checksummed IDs the import path writes, so
 * the two slices disagree on casing. Solana IDs are left as they are, because
 * base58 is case-sensitive.
 *
 * @returns Full internal controller state.
 */
export function buildLowercasedSpamWalletState(): AssetsControllerStateInternal {
  const state = buildSpamWalletState();

  return {
    ...state,
    assetsInfo: lowercaseKeys(state.assetsInfo),
    assetsBalance: Object.fromEntries(
      Object.entries(state.assetsBalance).map(([accountId, balances]) => [
        accountId,
        lowercaseKeys(balances),
      ]),
    ),
  };
}

/**
 * Rekey a registry by lowercase EVM asset ID.
 *
 * @param registry - The registry to rekey.
 * @returns The rekeyed registry.
 */
function lowercaseKeys<Value>(
  registry: Record<string, Value>,
): Record<Caip19AssetId, Value> {
  return Object.fromEntries(
    Object.entries(registry).map(([assetId, value]) => [
      assetId.startsWith(`${KnownCaipNamespace.Eip155}:`)
        ? assetId.toLowerCase()
        : assetId,
      value,
    ]),
  );
}

/**
 * Build a wallet holding `count` distinct Optimism tokens and nothing else,
 * for exercising the batching a heavily airdropped wallet goes through.
 *
 * @param count - How many tokens the wallet holds.
 * @returns The asset IDs, in the order the sweep will batch them, alongside
 * the controller state holding them.
 */
export function buildManyTokensState(count: number): {
  assetIds: Caip19AssetId[];
  state: AssetsControllerStateInternal;
} {
  const assetIds = Array.from({ length: count }, (_, index) => {
    const address = getChecksumAddress(
      `0x${(index + 1).toString(16).padStart(40, '0')}`,
    );
    return `eip155:10/erc20:${address}` as Caip19AssetId;
  });

  return {
    assetIds,
    state: buildSpamWalletState({
      assetsInfo: Object.fromEntries(
        assetIds.map((assetId) => [assetId, TOKEN_METADATA[OPTIMISM_SPAM]]),
      ),
      assetsBalance: {},
      customAssets: {},
    }),
  };
}
