import type { AccountsControllerState } from '@metamask/accounts-controller';
import {
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import type { CaipAssetType, Hex } from '@metamask/utils';

import type { TransactionPayControllerMessenger } from '../types.js';

/** `InternalAccount` that holds an asset. */
export type AssetAccount =
  AccountsControllerState['internalAccounts']['accounts'][string];

/**
 * Get the EVM account address used by a transaction.
 *
 * The account override is an `InternalAccount` ID. It is only used as the
 * EVM account when it is an EVM account, since a non-EVM override selects the
 * account holding a non-EVM payment token.
 *
 * @param messenger - Controller messenger.
 * @param accountOverride - ID of the account override of the transaction, if any.
 * @param from - Address of the transaction sender.
 * @returns The EVM account address.
 */
export function getEvmAccountAddress(
  messenger: TransactionPayControllerMessenger,
  accountOverride: string | undefined,
  from: Hex,
): Hex {
  const account = accountOverride
    ? getAccount(messenger, accountOverride)
    : undefined;

  return account && isEvmAccount(account) ? (account.address as Hex) : from;
}

/**
 * Get the EVM account override of a transaction, for flows that only support
 * EVM accounts.
 *
 * @param messenger - Controller messenger.
 * @param accountOverride - ID of the account override of the transaction, if any.
 * @returns The address of the EVM account override, or undefined if there is
 * no account override.
 */
export function getEvmAccountOverride(
  messenger: TransactionPayControllerMessenger,
  accountOverride: string | undefined,
): Hex | undefined {
  if (!accountOverride) {
    return undefined;
  }

  const account = getAccount(messenger, accountOverride);

  if (!isEvmAccount(account)) {
    throw new Error('Account override is not an EVM account');
  }

  return account.address as Hex;
}

/**
 * Get the `InternalAccount` that holds an asset.
 *
 * The account override is used when it supports the asset chain. Otherwise
 * the account is the one in the same account group as the account override,
 * or as the transaction sender, that supports the asset chain.
 *
 * @param messenger - Controller messenger.
 * @param request - Request parameters.
 * @param request.accountOverride - ID of the account override of the transaction, if any.
 * @param request.assetId - CAIP-19 asset type of the asset.
 * @param request.from - Address of the transaction sender.
 * @returns The `InternalAccount` holding the asset.
 */
export function getAssetAccount(
  messenger: TransactionPayControllerMessenger,
  {
    accountOverride,
    assetId,
    from,
  }: {
    accountOverride: string | undefined;
    assetId: CaipAssetType;
    from: Hex;
  },
): AssetAccount {
  const { chainId } = parseCaipAssetType(assetId);

  const accounts: AssetAccount[] = Object.values(
    messenger.call('AccountsController:getState').internalAccounts.accounts,
  );

  const isOnChain = (account: AssetAccount): boolean =>
    account.scopes.includes(chainId);

  const overrideAccount = accountOverride
    ? getAccount(messenger, accountOverride)
    : undefined;

  const groupAccount =
    overrideAccount ??
    accounts.find(
      (account) => account.address.toLowerCase() === from.toLowerCase(),
    );

  const account =
    overrideAccount && isOnChain(overrideAccount)
      ? overrideAccount
      : getAccountGroupAccounts(messenger, accounts, groupAccount).find(
          isOnChain,
        );

  if (!account) {
    throw new Error('Asset account not found');
  }

  return account;
}

/**
 * Get an `InternalAccount` by ID.
 *
 * @param messenger - Controller messenger.
 * @param accountId - ID of the `InternalAccount`.
 * @returns The `InternalAccount`.
 */
function getAccount(
  messenger: TransactionPayControllerMessenger,
  accountId: string,
): AssetAccount {
  const account = messenger.call('AccountsController:getState').internalAccounts
    .accounts[accountId];

  if (!account) {
    throw new Error('Account override not found');
  }

  return account;
}

/**
 * Check if an `InternalAccount` is an EVM account.
 *
 * @param account - The `InternalAccount`.
 * @returns True if the account has an `eip155` scope.
 */
function isEvmAccount(account: AssetAccount): boolean {
  return account.scopes.some(
    (scope) => parseCaipChainId(scope).namespace === KnownCaipNamespace.Eip155,
  );
}

/**
 * Get the accounts in the same account group as an account.
 *
 * @param messenger - Controller messenger.
 * @param accounts - All internal accounts.
 * @param account - Account whose group to return, if any.
 * @returns The accounts in the group, or an empty array if the group is not
 * found.
 */
function getAccountGroupAccounts(
  messenger: TransactionPayControllerMessenger,
  accounts: AssetAccount[],
  account: AssetAccount | undefined,
): AssetAccount[] {
  const groupId =
    account &&
    messenger.call('AccountTreeController:getAccountContext', account.id)
      ?.groupId;

  const group =
    groupId &&
    messenger.call('AccountTreeController:getAccountGroupObject', groupId);

  if (!group) {
    return [];
  }

  return accounts.filter((candidate) => group.accounts.includes(candidate.id));
}
