import {
  KEYRING_TYPES_REQUIRING_MFA,
  KEYRING_TYPES_SUPPORTING_7702,
  PaymentOverride,
} from '../constants.js';
import type {
  PayStrategyGetQuotesRequest,
  TransactionPayControllerMessenger,
} from '../types.js';

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
 * Whether the quote payer is an MPC Money account.
 *
 * Perps and Predict deposits funded by a Money Account set `paymentOverride`
 * and put that account on `refundTo`. The account signs the delegation inside
 * the client payment-override callback. Quote simulation calls that callback,
 * so an MPC keyring would prompt for MFA on every quote and again on submit.
 *
 * @param messenger - Controller messenger used to resolve the payer keyring.
 * @param request - Quote request carrying the payment override and refund recipient.
 * @returns Whether the payer is an MPC Money account.
 */
export function isMpcMoneyAccountPayer(
  messenger: TransactionPayControllerMessenger,
  request: {
    paymentOverride?: PaymentOverride;
    refundTo?: string;
  },
): boolean {
  return (
    request.paymentOverride === PaymentOverride.MoneyAccount &&
    accountRequiresMfa(messenger, request.refundTo)
  );
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
