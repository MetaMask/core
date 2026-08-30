import type { MoneyKeyring } from '@metamask/eth-money-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';

/**
 * Returns `true` if the given keyring is a {@link MoneyKeyring}.
 *
 * @param keyring - The keyring to check.
 * @returns Whether the keyring is a `MoneyKeyring`.
 */
export function isMoneyKeyring(keyring: EthKeyring): keyring is MoneyKeyring {
  return keyring.type === KeyringTypes.money;
}
