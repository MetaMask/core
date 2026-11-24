/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { WatchOnlyAccountService } from './WatchOnlyAccountService.js';

/**
 * Returns whether the watch-only support is enabled.
 *
 * @returns `true` if the watch-only support is enabled.
 */
export type WatchOnlyAccountServiceIsEnabledAction = {
  type: `WatchOnlyAccountService:isEnabled`;
  handler: WatchOnlyAccountService['isEnabled'];
};

/**
 * Creates (or retrieves, if it already exists) a watch-only account for the
 * given address.
 *
 * The watch-only keyring is created atomically if it does not exist yet.
 * The account itself is imported by address: no secret material is ever
 * involved, and the resulting account cannot sign.
 *
 * @param address - The EVM address to import.
 * @returns The keyring account for the imported address.
 * @throws {WatchOnlyAccountDisabledError} If the watch-only support is
 * disabled.
 * @throws If the address is not a valid EVM address.
 */
export type WatchOnlyAccountServiceCreateAccountAction = {
  type: `WatchOnlyAccountService:createAccount`;
  handler: WatchOnlyAccountService['createAccount'];
};

/**
 * Union of all WatchOnlyAccountService action types.
 */
export type WatchOnlyAccountServiceMethodActions =
  | WatchOnlyAccountServiceIsEnabledAction
  | WatchOnlyAccountServiceCreateAccountAction;
