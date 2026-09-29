import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from '../../types.js';
import { createMockInternalAccount } from '../MockAssetControllerMessenger.js';
import {
  BSC_ACCOUNT_ID,
  BSC_CHAIN_ID,
  HOODI_CHAIN_ID,
  MAINNET_ACCOUNT_ID,
  MAINNET_CHAIN_ID,
  SOLANA_ACCOUNT_ID,
  SOLANA_CHAIN_ID,
  SOLANA_SNAP_ID,
  SOLANA_USDC_ASSET_ID,
  SOLANA_WALLET_ADDRESS,
  STALE_WALLET_ADDRESS,
} from './wallet.js';

/**
 * Build the BNB Chain `InternalAccount`, scoped to BNB Chain only.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildBscAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  const { metadata, ...rest } = overrides ?? {};
  return createMockInternalAccount({
    id: BSC_ACCOUNT_ID,
    address: STALE_WALLET_ADDRESS,
    scopes: [BSC_CHAIN_ID],
    metadata: { name: 'Stale Balance Wallet', ...metadata },
    ...rest,
  });
}

/**
 * Build the mainnet `InternalAccount`, scoped to mainnet and Hoodi.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildMainnetAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  const { metadata, ...rest } = overrides ?? {};
  return createMockInternalAccount({
    id: MAINNET_ACCOUNT_ID,
    address: STALE_WALLET_ADDRESS,
    scopes: [MAINNET_CHAIN_ID, HOODI_CHAIN_ID],
    metadata: { name: 'Stale Balance Wallet', ...metadata },
    ...rest,
  });
}

/**
 * Build the Solana `InternalAccount` owned by the keyring snap;
 * `metadata.snap.id` routes it to `SnapDataSource`.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildSolanaSnapAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  const { metadata, ...rest } = overrides ?? {};
  return createMockInternalAccount({
    id: SOLANA_ACCOUNT_ID,
    address: SOLANA_WALLET_ADDRESS,
    type: 'solana:data-account',
    scopes: [SOLANA_CHAIN_ID],
    metadata: {
      name: 'Solana Snap Account',
      keyring: { type: 'Snap Keyring' },
      snap: { id: SOLANA_SNAP_ID },
      ...metadata,
    },
    ...rest,
  });
}

/**
 * All three accounts, as the selected account group reports them.
 *
 * @returns The accounts of the selected account group.
 */
export function buildStaleBalanceAccounts(): InternalAccount[] {
  return [buildBscAccount(), buildMainnetAccount(), buildSolanaSnapAccount()];
}

/**
 * A fresh wallet: no balances, metadata, prices or custom assets yet.
 *
 * @param overrides - State slices to override.
 * @returns The starting state.
 */
export function buildEmptyStaleBalanceState(
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

/**
 * A fresh Solana wallet with USDC imported as a custom asset (the user's
 * pin).
 *
 * @param overrides - State slices to override.
 * @returns The starting state for the Solana scenarios.
 */
export function buildEmptySolanaSnapState(
  overrides?: Partial<AssetsControllerState>,
): AssetsControllerState {
  return buildEmptyStaleBalanceState({
    customAssets: { [SOLANA_ACCOUNT_ID]: [SOLANA_USDC_ASSET_ID] },
    ...overrides,
  });
}
