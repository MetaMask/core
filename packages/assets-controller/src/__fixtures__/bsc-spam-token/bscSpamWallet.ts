import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerStateInternal } from '../../types.js';
import {
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  BSC_SPAM_WALLET_ADDRESS,
} from './wallet.js';

export {
  BNB_ASSET_ID,
  BSC_CHAIN_ID,
  BSC_SPAM_ACCOUNT_ID,
  CDOGE_ASSET_ID_CHECKSUM,
  CDOGE_ASSET_ID_LOWERCASE,
} from './wallet.js';

/**
 * Build the wallet's `InternalAccount`.
 *
 * Scoped to BNB Chain only, so `accountsWithSupportedChains` resolves to the
 * one chain under test.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildBscSpamAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: BSC_SPAM_ACCOUNT_ID,
    address: BSC_SPAM_WALLET_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [BSC_CHAIN_ID],
    metadata: {
      name: 'BSC Spam Wallet',
      keyring: { type: 'HD Key Tree' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
    },
    ...overrides,
  } as InternalAccount;
}

/**
 * A fresh wallet: no balances, metadata, prices or custom assets yet, so the
 * first pipeline pass sees every holding as newly detected.
 *
 * @param overrides - State slices to override.
 * @returns The starting state.
 */
export function buildEmptyAssetsState(
  overrides?: Partial<AssetsControllerStateInternal>,
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
