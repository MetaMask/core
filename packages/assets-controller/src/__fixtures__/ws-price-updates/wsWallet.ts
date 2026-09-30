import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from '../../types.js';
import {
  ETH_ASSET_ID,
  MAINNET_CHAIN_ID,
  USDC_ASSET_ID_CHECKSUM,
  WS_ACCOUNT_ID,
  WS_WALLET_ADDRESS,
} from './wallet.js';

/**
 * Build the wallet's `InternalAccount`.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildWsAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: WS_ACCOUNT_ID,
    address: WS_WALLET_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [MAINNET_CHAIN_ID],
    metadata: {
      name: 'WS Price Wallet',
      keyring: { type: 'HD Key Tree' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
    },
    ...overrides,
  };
}

/**
 * A fresh wallet's state, empty of balances, metadata, prices and custom
 * assets.
 *
 * @param overrides - State slices to override.
 * @returns The starting state.
 */
export function buildEmptyAssetsState(
  overrides?: Partial<AssetsControllerState>,
): AssetsControllerState {
  return {
    assetsInfo: {},
    assetsLoadingStatus: {},
    assetsBalance: {},
    assetsPrice: {},
    customAssets: {},
    assetPreferences: {},
    selectedCurrency: 'usd',
    ...overrides,
  };
}

export function getIgnoringCase(
  record: Record<string, unknown>,
  assetId: string,
): unknown {
  const lowerId = assetId.toLowerCase();
  const match = Object.keys(record).find(
    (key) => key.toLowerCase() === lowerId,
  );
  return match === undefined ? undefined : record[match];
}

/** A seeded USDC spot price, as a wallet that has already priced USDC holds it. */
export const SEEDED_USDC_PRICE = {
  assetPriceType: 'fungible' as const,
  price: 1,
  usdPrice: 1,
  pricePercentChange1d: 0.01,
  lastUpdated: 1_756_100_000_000,
};

/**
 * State holding ETH with metadata but no price yet.
 *
 * @returns The held-but-unpriced state.
 */
export function buildEthHeldUnpricedState(): AssetsControllerState {
  return buildEmptyAssetsState({
    assetsBalance: {
      [WS_ACCOUNT_ID]: { [ETH_ASSET_ID]: { amount: '1' } },
    },
    assetsInfo: {
      [ETH_ASSET_ID]: {
        type: 'native',
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        image:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/slip44:60.png',
      },
    },
  });
}

/**
 * State holding USDC with balance, metadata and an already-seeded price.
 *
 * @returns The already-priced state.
 */
export function buildUsdcHeldAndPricedState(): AssetsControllerState {
  return buildEmptyAssetsState({
    assetsBalance: {
      [WS_ACCOUNT_ID]: { [USDC_ASSET_ID_CHECKSUM]: { amount: '5' } },
    },
    assetsInfo: {
      [USDC_ASSET_ID_CHECKSUM]: {
        type: 'erc20',
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
        image:
          'https://static.cx.metamask.io/api/v2/tokenIcons/assets/eip155/1/erc20/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48.png',
      },
    },
    assetsPrice: {
      [USDC_ASSET_ID_CHECKSUM]: SEEDED_USDC_PRICE,
    },
  });
}
