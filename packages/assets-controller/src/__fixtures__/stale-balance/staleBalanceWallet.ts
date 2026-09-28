import type { InternalAccount } from '@metamask/keyring-internal-api';

import type { AssetsControllerState } from '../../types.js';
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
 * Build the BNB Chain `InternalAccount`.
 *
 * Scoped to BNB Chain only, so `accountsWithSupportedChains` resolves to the
 * one chain under test in the RPC fallback scenarios.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildBscAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: BSC_ACCOUNT_ID,
    address: STALE_WALLET_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [BSC_CHAIN_ID],
    metadata: {
      name: 'Stale Balance Wallet',
      keyring: { type: 'HD Key Tree' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
    },
    ...overrides,
  };
}

/**
 * Build the mainnet `InternalAccount`.
 *
 * The same EOA as the BNB Chain account, scoped to mainnet and Hoodi — the
 * two chains with known staking contracts — for the staked ETH scenarios.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildMainnetAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: MAINNET_ACCOUNT_ID,
    address: STALE_WALLET_ADDRESS,
    options: {},
    methods: [],
    type: 'eip155:eoa',
    scopes: [MAINNET_CHAIN_ID, HOODI_CHAIN_ID],
    metadata: {
      name: 'Stale Balance Wallet',
      keyring: { type: 'HD Key Tree' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
    },
    ...overrides,
  };
}

/**
 * Build the Solana `InternalAccount` owned by the keyring snap.
 *
 * The `metadata.snap.id` link is what routes the account to
 * `SnapDataSource`; the `snap` chain caveat (registered in the messenger
 * mocks) is what makes the snap claim the chain.
 *
 * @param overrides - Fields to override on the account.
 * @returns The internal account.
 */
export function buildSolanaSnapAccount(
  overrides?: Partial<InternalAccount>,
): InternalAccount {
  return {
    id: SOLANA_ACCOUNT_ID,
    address: SOLANA_WALLET_ADDRESS,
    options: {},
    methods: [],
    type: 'solana:data-account',
    scopes: [SOLANA_CHAIN_ID],
    metadata: {
      name: 'Solana Snap Account',
      keyring: { type: 'Snap Keyring' },
      importTime: 1_756_100_000_000,
      lastSelected: 1_756_200_000_000,
      snap: { id: SOLANA_SNAP_ID },
    },
    ...overrides,
  };
}

/**
 * All three accounts, as `AccountTreeController:getAccountsFromSelectedAccountGroup`
 * reports them. Scenarios pass the specific account they care about to
 * `getAssets`, but the subscription paths see all of them.
 *
 * @returns The accounts of the selected account group.
 */
export function buildStaleBalanceAccounts(): InternalAccount[] {
  return [buildBscAccount(), buildMainnetAccount(), buildSolanaSnapAccount()];
}

/**
 * A fresh wallet: no balances, metadata, prices or custom assets yet, so
 * the first pipeline pass sees every holding as newly detected.
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
 * "pin"): the snap never lists it, but the pin makes it visible so it is
 * always fetched and kept.
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

/**
 * Look up a record entry ignoring CAIP-19 address casing.
 *
 * @param record - The record to search.
 * @param assetId - The asset ID to look up, any casing.
 * @returns The matching entry, or `undefined` when absent.
 */
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
