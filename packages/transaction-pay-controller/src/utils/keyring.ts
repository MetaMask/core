import type { TransactionPayControllerMessenger } from '../types.js';
import { KEYRING_TYPES_REQUIRING_MFA } from '../types.js';

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
  account: string | undefined,
): boolean {
  if (!account) {
    return false;
  }

  const { keyrings } = messenger.call('KeyringController:getState');

  return keyrings.some(
    (keyring) =>
      (KEYRING_TYPES_REQUIRING_MFA as string[]).includes(keyring.type) &&
      keyring.accounts.some(
        (keyringAccount) =>
          keyringAccount.toLowerCase() === account.toLowerCase(),
      ),
  );
}
