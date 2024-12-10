import type { InternalAccount } from '@metamask/keyring-api';
import { BtcAccountType, SolAccountType } from '@metamask/keyring-api';
import { validate, Network } from 'bitcoin-address-validation';

import { MultichainNetworks } from './constants';

/**
 * Gets the scope for a specific and supported Bitcoin account.
 * Note: This is a temporary method and will be replaced by a more robust solution
 * once the new `account.scopes` is available in the `@metamask/keyring-api` module.
 *
 * @param account - Bitcoin account
 * @returns The scope for the given account.
 */
export const getScopeForBtcAddress = (account: InternalAccount): string => {
  if (validate(account.address, Network.mainnet)) {
    return MultichainNetworks.Bitcoin;
  }

  if (validate(account.address, Network.testnet)) {
    return MultichainNetworks.BitcoinTestnet;
  }

  throw new Error(`Invalid Bitcoin address: ${account.address}`);
};

/**
 * Gets the scope for a specific and supported Solana account.
 * Note: This is a temporary method and will be replaced by a more robust solution
 * once the new `account.scopes` is available in the `keyring-api`.
 *
 * @param account - Solana account
 * @returns The scope for the given account.
 */
export const getScopeForSolAddress = (account: InternalAccount): string => {
  // For Solana accounts, we know we have a `scope` on the account's `options` bag.
  if (!account.options.scope) {
    throw new Error('Solana account scope is undefined');
  }
  return account.options.scope as string;
};

/**
 * Get the scope for a given address.
 * Note: This is a temporary method and will be replaced by a more robust solution
 * once the new `account.scopes` is available in the `keyring-api`.
 *
 * @param account - The account to get the scope for.
 * @returns The scope for the given account.
 */
export const getScopeForAccount = (account: InternalAccount): string => {
  switch (account.type) {
    case BtcAccountType.P2wpkh:
      return getScopeForBtcAddress(account);
    case SolAccountType.DataAccount:
      return getScopeForSolAddress(account);
    default:
      throw new Error(`Unsupported non-EVM account type: ${account.type}`);
  }
};