import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from '../../types.js';
import {
  MAINNET_CHAIN_ID,
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
