import type { KeyringTypes } from '@metamask/keyring-controller';
import type { InternalAccount } from '@metamask/keyring-internal-api';

/**
 * Check if an account uses the same keyring type.
 *
 * @param account - The account.
 * @param type - The keyring type.
 * @returns True if the account uses the same keyring type, false otherwise.
 */
export function hasKeyringType(
  account: InternalAccount,
  type: KeyringTypes,
): boolean {
  return account.metadata.keyring.type === (type as string);
}
