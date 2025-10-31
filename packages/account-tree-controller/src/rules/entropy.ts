import type {
  AccountGroupType,
  AccountWalletType,
} from '@metamask/account-api';
import { isEvmAccountType } from '@metamask/keyring-api';
import { KeyringTypes } from '@metamask/keyring-controller';

import type { AccountGroupObjectOf } from '../group';
import type { AccountTreeControllerMessenger } from '../types';
import type { AccountWalletObjectOf } from '../wallet';

/**
 * Get the entropy index for a given entropy source.
 *
 * @param messenger - Controller's messenger.
 * @param entropySource - The entropy source to get the index for.
 * @returns The index for this entropy source.
 */
function getEntropySourceIndex(
  messenger: AccountTreeControllerMessenger,
  entropySource: string,
) {
  const { keyrings } = messenger.call('KeyringController:getState');

  return keyrings
    .filter((keyring) => keyring.type === (KeyringTypes.hd as string))
    .findIndex((keyring) => keyring.metadata.id === entropySource);
}

/**
 * Get default wallet name for entropy-based wallets.
 *
 * @param messenger - Controller's messenger.
 * @param wallet - The wallet to get the name for.
 * @returns The default name for this wallet.
 */
export function getEntropyDefaultAccountWalletName(
  messenger: AccountTreeControllerMessenger,
  wallet: AccountWalletObjectOf<AccountWalletType.Entropy>,
): string {
  // NOTE: We have checked during the rule matching, so we can safely assume it will
  // well-defined here.
  const entropySourceIndex = getEntropySourceIndex(
    messenger,
    wallet.metadata.entropy.id,
  );

  return `Wallet ${entropySourceIndex + 1}`; // Use human indexing (starts at 1).
}

/**
 * Get computed group name for entropy-based wallet groups.
 *
 * @param messenger - Controller's messenger.
 * @param group - The group to get the name for.
 * @returns The computed name for this group.
 */
export function getEntropyComputedAccountGroupName(
  messenger: AccountTreeControllerMessenger,
  group: AccountGroupObjectOf<AccountGroupType.MultichainAccount>,
): string {
  // Only use EVM account names for multichain groups to avoid chain-specific names becoming group names.
  // Non-EVM account names should not be used as group names since groups represent multichain collections.
  for (const id of group.accounts) {
    const account = messenger.call('AccountsController:getAccount', id);

    if (account && isEvmAccountType(account.type)) {
      return account.metadata.name;
    }
  }

  return '';
}

/**
 * Get the group name prefix for entropy-based wallet groups.
 *
 * @returns The prefix for entropy-based wallet groups.
 */
export function getEntropyDefaultAccountGroupPrefix(): string {
  return 'Account';
}
