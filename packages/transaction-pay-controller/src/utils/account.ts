import {
  KEYRING_TYPES_REQUIRING_MFA,
  KEYRING_TYPES_SUPPORTING_7702,
} from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';

/**
 * Check whether a given account supports EIP-7702 authorization signing.
 *
 * Looks up the account's keyring via `KeyringController:getState` and returns
 * `true` only when the keyring type is in the supported list (HD Key Tree,
 * Simple Key Pair). Hardware wallets, snap keyrings, and other types return
 * `false`. Returns `false` when the keyring cannot be resolved.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @returns Whether the account supports EIP-7702.
 */
export function accountSupports7702(
  messenger: TransactionPayControllerMessenger,
  account: string,
): boolean {
  return hasKeyringOfType(messenger, account, KEYRING_TYPES_SUPPORTING_7702);
}

/**
 * Check whether a given account's keyring requires multi-factor
 * authentication to sign.
 *
 * Looks up the account's keyring via `KeyringController:getState` and returns
 * `true` only when the keyring type is in {@link KEYRING_TYPES_REQUIRING_MFA}.
 * Returns `false` when the keyring cannot be resolved, so an unknown account
 * keeps the default behaviour rather than silently losing an optimisation.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @returns Whether signing with the account requires MFA.
 */
export function accountRequiresMfa(
  messenger: TransactionPayControllerMessenger,
  account: string,
): boolean {
  return hasKeyringOfType(messenger, account, KEYRING_TYPES_REQUIRING_MFA);
}

/**
 * Check whether an account belongs to a keyring of one of the given types.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @param types - Keyring types to match against.
 * @returns Whether a keyring of one of the given types holds the account.
 */
function hasKeyringOfType(
  messenger: TransactionPayControllerMessenger,
  account: string,
  types: string[],
): boolean {
  const { keyrings } = messenger.call('KeyringController:getState');

  return keyrings.some(
    (keyring) =>
      types.includes(keyring.type) &&
      keyring.accounts.some(
        (keyringAccount) =>
          keyringAccount.toLowerCase() === account.toLowerCase(),
      ),
  );
}
