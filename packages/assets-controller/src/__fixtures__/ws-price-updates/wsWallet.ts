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
 * Scoped to Ethereum Mainnet only, so `accountsWithSupportedChains` resolves
 * to the one chain the websocket events report balances for.
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
 * A fresh wallet: no balances, metadata, prices or custom assets yet, so the
 * first websocket event surfaces holdings that are all brand new to state.
 *
 * @param overrides - State slices to override (e.g. seed the ETH holding of a
 * prior pass).
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
