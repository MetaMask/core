/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { AccountTrackerController } from './AccountTrackerController';

/**
 * Refreshes the balances of the accounts depending on the multi-account setting.
 * If multi-account is disabled, only updates the selected account balance.
 * If multi-account is enabled, updates balances for all accounts.
 *
 * @param networkClientIds - Optional network client IDs to fetch a network client with
 * @param queryAllAccounts - Whether to query all accounts or just the selected account
 */
export type AccountTrackerControllerRefreshAction = {
  type: `AccountTrackerController:refresh`;
  handler: AccountTrackerController['refresh'];
};

/**
 * Sync accounts balances with some additional addresses.
 *
 * @param addresses - the additional addresses, may be hardware wallet addresses.
 * @param networkClientId - Optional networkClientId to fetch a network client with.
 * @returns accounts - addresses with synced balance
 */
export type AccountTrackerControllerSyncBalanceWithAddressesAction = {
  type: `AccountTrackerController:syncBalanceWithAddresses`;
  handler: AccountTrackerController['syncBalanceWithAddresses'];
};

/**
 * Updates the balances of multiple native tokens in a single batch operation.
 * This is more efficient than calling updateNativeToken multiple times as it
 * triggers only one state update.
 *
 * @param balances - Array of balance updates, each containing address, chainId, and balance.
 */
export type AccountTrackerControllerUpdateNativeBalancesAction = {
  type: `AccountTrackerController:updateNativeBalances`;
  handler: AccountTrackerController['updateNativeBalances'];
};

/**
 * Updates the staked balances of multiple accounts in a single batch operation.
 * This is more efficient than updating staked balances individually as it
 * triggers only one state update.
 *
 * @param stakedBalances - Array of staked balance updates, each containing address, chainId, and stakedBalance.
 */
export type AccountTrackerControllerUpdateStakedBalancesAction = {
  type: `AccountTrackerController:updateStakedBalances`;
  handler: AccountTrackerController['updateStakedBalances'];
};

/**
 * Union of all AccountTrackerController action types.
 */
export type AccountTrackerControllerMethodActions =
  | AccountTrackerControllerRefreshAction
  | AccountTrackerControllerSyncBalanceWithAddressesAction
  | AccountTrackerControllerUpdateNativeBalancesAction
  | AccountTrackerControllerUpdateStakedBalancesAction;
