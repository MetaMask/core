import type { AccountsControllerState } from '@metamask/accounts-controller';
import {
  KnownCaipNamespace,
  parseCaipAssetType,
  parseCaipChainId,
} from '@metamask/utils';
import type { CaipAssetType, Hex } from '@metamask/utils';

import {
  KEYRING_TYPES_REQUIRING_MFA,
  KEYRING_TYPES_SUPPORTING_7702,
  PaymentOverride,
} from '../constants.js';
import type {
  PayStrategyGetQuotesRequest,
  TransactionPayControllerMessenger,
} from '../types.js';

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
 * Check whether a given account supports EIP-7702 authorization signing.
 *
 * Looks up the account's keyring via `KeyringController:getState` and returns
 * `true` only when the keyring type is in the supported list (HD Key Tree,
 * Simple Key Pair). Hardware wallets, snap keyrings, and other types return
 * `false`. Returns `false` when the keyring cannot be resolved.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @returns Whether the account supports EIP-7702.
 */
export function accountSupports7702(
  messenger: TransactionPayControllerMessenger,
  account: string,
): boolean {
  return hasKeyringOfType(messenger, account, KEYRING_TYPES_SUPPORTING_7702);
}

/**
 * Check whether a given account's keyring requires multi-factor
 * authentication to sign.
 *
 * Looks up the account's keyring via `KeyringController:getState` and returns
 * `true` only when the keyring type is in {@link KEYRING_TYPES_REQUIRING_MFA}.
 * Returns `false` when the keyring cannot be resolved, so an unknown account
 * keeps the default behaviour rather than silently losing an optimisation.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @returns Whether signing with the account requires MFA.
 */
export function accountRequiresMfa(
  messenger: TransactionPayControllerMessenger,
  account: string | undefined,
): boolean {
  if (!account) {
    return false;
  }
  return hasKeyringOfType(messenger, account, KEYRING_TYPES_REQUIRING_MFA);
}

/**
 * Keep a quote request non-atomic when the signing account requires MFA.
 *
 * An atomic quote embeds the target calls and signs a delegation on every
 * refresh. That signature is an MFA confirmation, so every request for these
 * accounts stays non-atomic: partial amounts, max amounts, and requests a
 * client or a later promotion marked atomic.
 *
 * @param messenger - Controller messenger used to resolve the keyring.
 * @param signingAccount - Account that would sign the embedded calls.
 * @param request - Quote request to adjust.
 * @returns The same request, or a copy with `atomic` set to `false`.
 */
function forceNonAtomicRequest<Request extends { atomic?: boolean }>(
  messenger: TransactionPayControllerMessenger,
  signingAccount: string | undefined,
  request: Request,
): Request {
  if (
    request.atomic === false ||
    !accountRequiresMfa(messenger, signingAccount)
  ) {
    return request;
  }

  return { ...request, atomic: false };
}

/**
 * Apply {@link forceNonAtomicRequest} to every quote request in a strategy call.
 *
 * This is the single place strategies receive their requests, so Relay, Server,
 * Across, and Fiat all stay non-atomic for an MFA signing account. Relay calls
 * it again for requests built after that dispatch, such as fiat estimation.
 * Max promotion still has to skip its atomic paths, because it builds a new
 * request and would otherwise set `atomic` back to `true`.
 *
 * @param request - Quote request passed to a strategy.
 * @returns The same request, or a copy whose quote requests are non-atomic.
 */
export function withNonAtomicRequests<
  Request extends PayStrategyGetQuotesRequest,
>(request: Request): Request {
  const signingAccount = request.transaction.txParams.from;
  let changed = false;

  const requests = request.requests.map((quoteRequest) => {
    const next = forceNonAtomicRequest(
      request.messenger,
      signingAccount,
      quoteRequest,
    );

    if (next !== quoteRequest) {
      changed = true;
    }

    return next;
  });

  if (!changed) {
    return request;
  }

  return { ...request, requests };
}

/**
 * Whether a Money Account payment is signed by an MPC keyring.
 *
 * Perps and Predict deposits funded by a Money Account set `paymentOverride`
 * and put that account on `refundTo`. The account that signs the delegation
 * inside the client payment-override callback is the Money Account (from
 * `refundTo`), not `transaction.txParams.from`. Quote simulation calls that
 * callback, so an MPC keyring would prompt for MFA on every quote and again
 * on submit.
 *
 * @param messenger - Controller messenger used to resolve the signing keyring.
 * @param request - Quote request carrying the payment override and refund recipient.
 * @param signingAccount - Account from `transaction.txParams.from`.
 * @returns Whether this Money Account payment is signed by an MPC keyring.
 */
export function isMpcMoneyAccountPayer(
  messenger: TransactionPayControllerMessenger,
  request: {
    paymentOverride?: PaymentOverride;
    refundTo?: string;
  },
  signingAccount: string | undefined,
): boolean {
  return (
    request.paymentOverride === PaymentOverride.MoneyAccount &&
    (accountRequiresMfa(messenger, request.refundTo) ||
      accountRequiresMfa(messenger, signingAccount))
  );
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

/**
 * Check whether an account belongs to a keyring of one of the given types.
 *
 * @param messenger - Controller messenger used to call KeyringController.
 * @param account - The account address to check.
 * @param types - Keyring types to match against.
 * @returns Whether a keyring of one of the given types holds the account.
 */
function hasKeyringOfType(
  messenger: TransactionPayControllerMessenger,
  account: string,
  types: string[],
): boolean {
  const { keyrings } = messenger.call('KeyringController:getState');

  return keyrings.some(
    (keyring) =>
      types.includes(keyring.type) &&
      keyring.accounts.some(
        (keyringAccount) =>
          keyringAccount.toLowerCase() === account.toLowerCase(),
      ),
  );
}
