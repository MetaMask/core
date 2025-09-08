import type { KeyringTypes } from '@metamask/keyring-controller';
import { JsonRpcError } from '@metamask/rpc-errors';
import type { Hex } from '@metamask/utils';

import { EIP5792ErrorCode } from './constants';
import type { EIP5792Messenger } from './types';

/**
 * Retrieves the keyring type for a given account address.
 *
 * @param accountAddress - The account address to look up.
 * @param messenger - Messenger instance for controller communication.
 * @returns The keyring type associated with the account.
 * @throws JsonRpcError if the account type is unknown or not found.
 */
export function getAccountKeyringType(
  accountAddress: Hex,
  messenger: EIP5792Messenger,
): KeyringTypes {
  const { accounts } = messenger.call(
    'AccountsController:getState',
  ).internalAccounts;

  const account = Object.values(accounts).find(
    (acc) => acc.address.toLowerCase() === accountAddress.toLowerCase(),
  );

  const keyringType = account?.metadata?.keyring?.type;

  if (!keyringType) {
    throw new JsonRpcError(
      EIP5792ErrorCode.RejectedUpgrade,
      'EIP-7702 upgrade not supported as account type is unknown',
    );
  }

  return keyringType as KeyringTypes;
}
