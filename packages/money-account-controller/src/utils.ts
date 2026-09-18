import type { MoneyKeyring } from '@metamask/eth-money-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';

export const MPC_KEYRING_TYPE = 'MPC Keyring';

/**
 * Returns `true` if the given keyring is a {@link MoneyKeyring}.
 *
 * @param keyring - The keyring to check.
 * @returns Whether the keyring is a `MoneyKeyring`.
 */
export function isMoneyKeyring(keyring: EthKeyring): keyring is MoneyKeyring {
  return keyring.type === KeyringTypes.money;
}

/**
 * Returns `true` if the given keyring is an MPC keyring.
 *
 * @param keyring - The keyring to check.
 * @returns Whether the keyring is an MPC keyring.
 */
export function isMpcKeyring(keyring: EthKeyring): boolean {
  return keyring.type === MPC_KEYRING_TYPE;
}
