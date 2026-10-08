import type { MoneyKeyring } from '@metamask/eth-money-keyring';
import { KeyringTypes } from '@metamask/keyring-controller';
import { EthKeyring } from '@metamask/keyring-utils';

/**
 * The static entropy source ID for MPC-backed money accounts. The MPC
 * architecture currently yields a single keyring (and account) per wallet, so
 * a static identifier is sufficient.
 */
export const MPC_ENTROPY_SOURCE_ID = 'entropy:mpc:_' as const;

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
  return keyring.type === KeyringTypes.mpc;
}
