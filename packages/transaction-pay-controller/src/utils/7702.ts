import type { TransactionPayControllerMessenger } from '../types';
import { KEYRING_TYPES_SUPPORTING_7702 } from '../types';

/**
 * Check whether a given account supports EIP-7702 authorization signing.
 *
 * Looks up the account's keyring via `KeyringController:getState` and returns
 * `true` only when the keyring type is in the supported list (HD Key Tree,
 * Simple Key Pair). Hardware wallets, snap keyrings, and other types return
 * `false`. Falls back to `true` when the keyring cannot be resolved.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @returns Whether the account supports EIP-7702.
 */
export function accountSupports7702(
  messenger: TransactionPayControllerMessenger,
  account: string,
): boolean {
  const { keyrings } = messenger.call('KeyringController:getState');
  const keyring = keyrings.find((k) =>
    k.accounts.some((a) => a.toLowerCase() === account.toLowerCase()),
  );

  return keyring
    ? (KEYRING_TYPES_SUPPORTING_7702 as string[]).includes(keyring.type)
    : true;
}
