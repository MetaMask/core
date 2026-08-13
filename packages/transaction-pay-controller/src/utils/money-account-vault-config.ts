import type { Hex, Json } from '@metamask/utils';
import { isValidHexAddress } from '@metamask/utils';

import { CHAIN_ID_MONAD } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';

const VAULT_CONFIG_FLAG = 'moneyAccountVaultConfig';
const REQUIRED_ADDRESS_KEYS = [
  'boringVault',
  'tellerAddress',
  'accountantAddress',
  'lensAddress',
] as const;

type MoneyAccountVaultAction = 'deposit' | 'withdraw';

export type MoneyAccountVaultConfig = {
  accountantAddress: Hex;
  boringVault: Hex;
  chainId: Hex;
  lensAddress: Hex;
  tellerAddress: Hex;
};

/**
 * Reads and validates the Money Account vault configuration.
 *
 * @param messenger - Transaction Pay controller messenger.
 * @returns Validated Monad vault configuration.
 */
export function getMoneyAccountVaultConfig(
  messenger: TransactionPayControllerMessenger,
): MoneyAccountVaultConfig {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const value = state.remoteFeatureFlags?.[VAULT_CONFIG_FLAG];

  if (value === undefined) {
    throw new Error('Money Account vault config is unavailable');
  }

  if (!isVaultConfig(value)) {
    throw new Error('Money Account vault config is invalid');
  }

  return value;
}

/**
 * Returns whether the requested Money Account vault action is enabled.
 *
 * @param messenger - Transaction Pay controller messenger.
 * @param action - Vault action to inspect.
 * @returns Whether the remote feature flag explicitly enables the action.
 */
export function isMoneyAccountVaultActionEnabled(
  messenger: TransactionPayControllerMessenger,
  action: MoneyAccountVaultAction,
): boolean {
  const state = messenger.call('RemoteFeatureFlagController:getState');
  const value = state.remoteFeatureFlags?.moneyAccount;
  if (!value || Array.isArray(value) || typeof value !== 'object') {
    return false;
  }

  const key =
    action === 'deposit'
      ? 'moneyAccountDepositEnabled'
      : 'moneyAccountWithdrawEnabled';
  return value[key] === true;
}

function isVaultConfig(value: Json): value is Json & MoneyAccountVaultConfig {
  if (
    !value ||
    Array.isArray(value) ||
    typeof value !== 'object' ||
    value.chainId !== CHAIN_ID_MONAD
  ) {
    return false;
  }

  return REQUIRED_ADDRESS_KEYS.every((key) => {
    const address = value[key];
    return typeof address === 'string' && isValidHexAddress(address as Hex);
  });
}
