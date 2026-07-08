/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { SnapAccountService } from './SnapAccountService';

/**
 * Returns the IDs of all currently tracked account-management Snaps —
 * Snaps that are installed, enabled, not blocked, and have the
 * `endowment:keyring` permission.
 *
 * @returns The IDs of tracked account-management Snaps.
 */
export type SnapAccountServiceGetSnapsAction = {
  type: `SnapAccountService:getSnaps`;
  handler: SnapAccountService['getSnaps'];
};

/**
 * Ensures everything is ready to use Snap accounts for the given Snap.
 * 1. Validates that `snapId` is a tracked account-management Snap.
 * 2. Asserts that the legacy -> v2 migration has been triggered (expected to
 * happen at `KeyringController:unlock` time).
 * 3. Atomically creates the v2 keyring for this Snap if it doesn't exist
 * yet.
 * 4. Waits for the Snap platform to be fully started.
 *
 * Safe to call concurrently — each step is idempotent or mutex-protected.
 *
 * @param snapId - ID of the Snap to ensure readiness for.
 * @throws If `snapId` is not a tracked account-management Snap.
 * @throws If the migration has not been triggered yet (wallet not unlocked).
 */
export type SnapAccountServiceEnsureReadyAction = {
  type: `SnapAccountService:ensureReady`;
  handler: SnapAccountService['ensureReady'];
};

/**
 * Migrate the legacy Snap keyring to the new (per-snap) Snap keyring v2.
 * Expected to be triggered at `KeyringController:unlock` time.
 * Safe to call concurrently — the migration runs only once; all callers
 * await the same promise.
 *
 * @returns A promise that resolves when the migration is complete.
 */
export type SnapAccountServiceEnsureMigratedAction = {
  type: `SnapAccountService:ensureMigrated`;
  handler: SnapAccountService['ensureMigrated'];
};

/**
 * Returns the keyring capabilities declared by the given Snap. These are
 * populated by the bridge keyring from the Snap's manifest, and describe
 * which keyring features the Snap supports (scopes, BIP-44 options, etc.).
 *
 * Consumers use this to decide whether to drive the Snap through the v1 or
 * v2 keyring path. Reading capabilities does not mutate state, so the
 * lock-free keyring access is used.
 *
 * @param snapId - ID of the Snap.
 * @returns The Snap's keyring capabilities.
 */
export type SnapAccountServiceGetCapabilitiesAction = {
  type: `SnapAccountService:getCapabilities`;
  handler: SnapAccountService['getCapabilities'];
};

/**
 * Returns the CAIP-19 asset type/ID list supported by an account.
 *
 * @param snapId - ID of the Snap.
 * @param id - ID of the account.
 * @returns A promise resolving to the list of supported CAIP-19 asset type/IDs.
 */
export type SnapAccountServiceGetAccountAssetsAction = {
  type: `SnapAccountService:getAccountAssets`;
  handler: SnapAccountService['getAccountAssets'];
};

/**
 * Returns the balances for an account for the requested asset types.
 *
 * @param snapId - ID of the Snap.
 * @param id - ID of the account.
 * @param assets - List of CAIP-19 fungible asset types to fetch balances for.
 * @returns A promise resolving to a map of asset type to balance.
 */
export type SnapAccountServiceGetAccountBalancesAction = {
  type: `SnapAccountService:getAccountBalances`;
  handler: SnapAccountService['getAccountBalances'];
};

/**
 * Returns a page of transactions for an account.
 *
 * @param snapId - ID of the Snap.
 * @param id - ID of the account.
 * @param pagination - Pagination options.
 * @returns A promise resolving to a page of transactions.
 */
export type SnapAccountServiceGetAccountTransactionsAction = {
  type: `SnapAccountService:getAccountTransactions`;
  handler: SnapAccountService['getAccountTransactions'];
};

/**
 * Resolves the account address to use for routing a signing request.
 *
 * @param snapId - ID of the Snap.
 * @param scope - CAIP-2 chain ID of the signing request.
 * @param request - The signing JSON-RPC request.
 * @returns A promise resolving to the resolved address, or `null` if the
 * Snap cannot determine an address for this request.
 */
export type SnapAccountServiceResolveAccountAddressAction = {
  type: `SnapAccountService:resolveAccountAddress`;
  handler: SnapAccountService['resolveAccountAddress'];
};

/**
 * Notifies a Snap of the currently selected accounts.
 *
 * For v1 Snaps the call goes through the keyring (signing interface); for
 * v2 Snaps it is routed via the RPC client because the keyring only covers
 * keyring-only operations (signing, account lifecycle).
 *
 * @param snapId - ID of the Snap.
 * @param accounts - IDs of the accounts to mark as selected.
 */
export type SnapAccountServiceSetSelectedAccountsAction = {
  type: `SnapAccountService:setSelectedAccounts`;
  handler: SnapAccountService['setSelectedAccounts'];
};

/**
 * Handle a message from a Snap.
 *
 * @param snapId - ID of the Snap.
 * @param message - Message sent by the Snap.
 * @returns The execution result.
 */
export type SnapAccountServiceHandleKeyringSnapMessageAction = {
  type: `SnapAccountService:handleKeyringSnapMessage`;
  handler: SnapAccountService['handleKeyringSnapMessage'];
};

/**
 * Union of all SnapAccountService action types.
 */
export type SnapAccountServiceMethodActions =
  | SnapAccountServiceGetSnapsAction
  | SnapAccountServiceEnsureReadyAction
  | SnapAccountServiceEnsureMigratedAction
  | SnapAccountServiceGetCapabilitiesAction
  | SnapAccountServiceGetAccountAssetsAction
  | SnapAccountServiceGetAccountBalancesAction
  | SnapAccountServiceGetAccountTransactionsAction
  | SnapAccountServiceResolveAccountAddressAction
  | SnapAccountServiceSetSelectedAccountsAction
  | SnapAccountServiceHandleKeyringSnapMessageAction;
