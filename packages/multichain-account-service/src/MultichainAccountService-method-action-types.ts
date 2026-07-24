/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MultichainAccountService } from './MultichainAccountService.js';

/**
 * Initialize the service and constructs the internal reprensentation of
 * multichain accounts and wallets.
 */
export type MultichainAccountServiceInitAction = {
  type: `MultichainAccountService:init`;
  handler: MultichainAccountService['init'];
};

/**
 * Re-synchronize MetaMask accounts and the providers accounts if needed.
 *
 * NOTE: This is mostly required if one of the providers (keyrings or Snaps)
 * have different sets of accounts. This method would ensure that both are
 * in-sync and use the same accounts (and same IDs).
 *
 * READ THIS CAREFULLY (State inconsistency bugs/de-sync)
 * We've seen some problems were keyring accounts on some Snaps were not synchronized
 * with the accounts on MM side. This causes problems where we cannot interact with
 * those accounts because the Snap does know about them.
 * To "workaround" this de-sync problem for now, we make sure that both parties are
 * in-sync when the service boots up.
 * ----------------------------------------------------------------------------------
 */
export type MultichainAccountServiceResyncAccountsAction = {
  type: `MultichainAccountService:resyncAccounts`;
  handler: MultichainAccountService['resyncAccounts'];
};

/**
 * Gets a reference to the multichain account wallet matching this entropy source.
 *
 * @param options - Options.
 * @param options.entropySource - The entropy source of the multichain account.
 * @throws If none multichain account match this entropy.
 * @returns A reference to the multichain account wallet.
 */
export type MultichainAccountServiceGetMultichainAccountWalletAction = {
  type: `MultichainAccountService:getMultichainAccountWallet`;
  handler: MultichainAccountService['getMultichainAccountWallet'];
};

/**
 * Gets an array of all multichain account wallets.
 *
 * @returns An array of all multichain account wallets.
 */
export type MultichainAccountServiceGetMultichainAccountWalletsAction = {
  type: `MultichainAccountService:getMultichainAccountWallets`;
  handler: MultichainAccountService['getMultichainAccountWallets'];
};

/**
 * Creates a new multichain account wallet by either importing an existing mnemonic,
 * creating a new vault and keychain, or restoring a vault and keyring.
 *
 * NOTE: This method should only be called in client code where a mutex lock is acquired.
 * `discoverAccounts` should be called after this method to discover and create accounts.
 *
 * @param params - The parameters to use to create the new wallet.
 * @param params.mnemonic - The mnemonic to use to create the new wallet.
 * @param params.password - The password to encrypt the vault with.
 * @param params.type - The flow type to use to create the new wallet.
 * @throws If the mnemonic has already been imported.
 * @returns The new multichain account wallet.
 */
export type MultichainAccountServiceCreateMultichainAccountWalletAction = {
  type: `MultichainAccountService:createMultichainAccountWallet`;
  handler: MultichainAccountService['createMultichainAccountWallet'];
};

/**
 * Removes a multichain account wallet, deleting all of its accounts across
 * every registered provider (EVM and snap-based).
 *
 * The deletion iterates providers (the source of truth for their own
 * account lists) and filters each provider's accounts to those matching
 * the wallet's entropy source. Cleanup is best-effort end-to-end: neither
 * a single account deletion failure nor a failure to enumerate a given
 * provider's accounts aborts cleanup of the remaining providers. If one or
 * more operations fail, a single aggregated error is reported via
 * `reportError` with all per-failure details in its context. The wallet is
 * always removed from the service's internal map at the end.
 *
 * @param entropySource - The entropy source of the multichain account wallet.
 */
export type MultichainAccountServiceRemoveMultichainAccountWalletAction = {
  type: `MultichainAccountService:removeMultichainAccountWallet`;
  handler: MultichainAccountService['removeMultichainAccountWallet'];
};

/**
 * Gets a reference to the multichain account group matching this entropy source
 * and a group index.
 *
 * @param options - Options.
 * @param options.entropySource - The entropy source of the multichain account.
 * @param options.groupIndex - The group index of the multichain account.
 * @throws If none multichain account match this entropy source and group index.
 * @returns A reference to the multichain account.
 */
export type MultichainAccountServiceGetMultichainAccountGroupAction = {
  type: `MultichainAccountService:getMultichainAccountGroup`;
  handler: MultichainAccountService['getMultichainAccountGroup'];
};

/**
 * Gets all multichain account groups for a given entropy source.
 *
 * @param options - Options.
 * @param options.entropySource - The entropy source to query.
 * @throws If no multichain accounts match this entropy source.
 * @returns A list of all multichain accounts.
 */
export type MultichainAccountServiceGetMultichainAccountGroupsAction = {
  type: `MultichainAccountService:getMultichainAccountGroups`;
  handler: MultichainAccountService['getMultichainAccountGroups'];
};

/**
 * Creates the next multichain account group.
 *
 * @param options - Options.
 * @param options.entropySource - The wallet's entropy source.
 * @returns The next multichain account group.
 */
export type MultichainAccountServiceCreateNextMultichainAccountGroupAction = {
  type: `MultichainAccountService:createNextMultichainAccountGroup`;
  handler: MultichainAccountService['createNextMultichainAccountGroup'];
};

/**
 * Creates a multichain account group.
 *
 * @param options - Options.
 * @param options.groupIndex - The group index to use.
 * @param options.entropySource - The wallet's entropy source.
 * @returns The multichain account group for this group index.
 */
export type MultichainAccountServiceCreateMultichainAccountGroupAction = {
  type: `MultichainAccountService:createMultichainAccountGroup`;
  handler: MultichainAccountService['createMultichainAccountGroup'];
};

/**
 * Creates multiple multichain account groups up to maxGroupIndex.
 *
 * @param params - Parameters for creating account groups.
 * @param params.fromGroupIndex - Starting group index to create (inclusive) (defaults to 0).
 * @param params.toGroupIndex - Maximum group index to create (inclusive).
 * @param params.entropySource - The entropy source ID.
 * @returns Array of created multichain account groups.
 */
export type MultichainAccountServiceCreateMultichainAccountGroupsAction = {
  type: `MultichainAccountService:createMultichainAccountGroups`;
  handler: MultichainAccountService['createMultichainAccountGroups'];
};

/**
 * Set basic functionality state and trigger alignment if enabled.
 * When basic functionality is disabled, snap-based providers are disabled.
 * When enabled, all snap providers are enabled and wallet alignment is triggered.
 * EVM providers are never disabled as they're required for basic wallet functionality.
 *
 * @param enabled - Whether basic functionality is enabled.
 */
export type MultichainAccountServiceSetBasicFunctionalityAction = {
  type: `MultichainAccountService:setBasicFunctionality`;
  handler: MultichainAccountService['setBasicFunctionality'];
};

/**
 * Align all multichain account wallets.
 */
export type MultichainAccountServiceAlignWalletsAction = {
  type: `MultichainAccountService:alignWallets`;
  handler: MultichainAccountService['alignWallets'];
};

/**
 * Align a specific multichain account wallet.
 *
 * @param entropySource - The entropy source of the multichain account wallet.
 */
export type MultichainAccountServiceAlignWalletAction = {
  type: `MultichainAccountService:alignWallet`;
  handler: MultichainAccountService['alignWallet'];
};

/**
 * Union of all MultichainAccountService action types.
 */
export type MultichainAccountServiceMethodActions =
  | MultichainAccountServiceInitAction
  | MultichainAccountServiceResyncAccountsAction
  | MultichainAccountServiceGetMultichainAccountWalletAction
  | MultichainAccountServiceGetMultichainAccountWalletsAction
  | MultichainAccountServiceCreateMultichainAccountWalletAction
  | MultichainAccountServiceRemoveMultichainAccountWalletAction
  | MultichainAccountServiceGetMultichainAccountGroupAction
  | MultichainAccountServiceGetMultichainAccountGroupsAction
  | MultichainAccountServiceCreateNextMultichainAccountGroupAction
  | MultichainAccountServiceCreateMultichainAccountGroupAction
  | MultichainAccountServiceCreateMultichainAccountGroupsAction
  | MultichainAccountServiceSetBasicFunctionalityAction
  | MultichainAccountServiceAlignWalletsAction
  | MultichainAccountServiceAlignWalletAction;
