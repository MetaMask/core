import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  hasTransactionType,
  TransactionType,
} from '@metamask/transaction-controller';

import type { QuoteRequest } from '../../types.js';

/**
 * Parent transaction types enabled for the server strategy by default.
 *
 * Intentionally empty so that turning on `payStrategies.server.enabled` alone
 * never diverts live traffic away from the relay strategy. Flows are opted in
 * one at a time via the `payStrategies.server.enabledTransactionTypes` remote
 * feature flag, which lets a single flow be validated in isolation before the
 * next one is added.
 */
export const DEFAULT_SERVER_ENABLED_TRANSACTION_TYPES: TransactionType[] = [];

/**
 * Transaction types whose quote must be priced as an exact output.
 *
 * The transaction embeds a call that transfers exactly `targetAmountMinimum`,
 * so a quote priced on expected output underfunds the transfer and reverts.
 * The server strategy cannot express this yet because {@link ServerTradeType}
 * has no exact-output member, and these flows route to HyperCore, which
 * suppresses the embedded calls that would otherwise let the backend infer it.
 *
 * Enforced independently of the remote flag so the flag cannot enable a flow
 * that is known to misprice.
 */
const EXACT_OUTPUT_TRANSACTION_TYPES: TransactionType[] = [
  TransactionType.perpsDepositAndOrder,
  TransactionType.predictDepositAndOrder,
];

/** Why the server strategy declined to handle a request. */
export enum ServerUnsupportedReason {
  /** The direct mUSD Money Account fiat flow is not implemented. */
  DirectMusdMoneyAccount = 'directMusdMoneyAccount',

  /** The parent transaction type is not in the remote-flag allowlist. */
  DisabledTransactionType = 'disabledTransactionType',

  /** The flow requires exact-output pricing, which is not implemented. */
  ExactOutput = 'exactOutput',

  /** Reserving the HyperLiquid activation fee is not implemented. */
  HyperliquidActivationFee = 'hyperliquidActivationFee',

  /** Two-phase max-amount gas station probing is not implemented. */
  MaxAmount = 'maxAmount',

  /** Non-atomic multi-leg submission is not implemented. */
  NonAtomic = 'nonAtomic',

  /** Polymarket deposit-wallet routing is not implemented. */
  PolymarketDepositWallet = 'polymarketDepositWallet',
}

/**
 * Determine whether the server strategy can handle a set of quote requests.
 *
 * Gating has two independent layers:
 *
 * 1. A remote-flag allowlist of transaction types, so flows can be rolled out
 *    and rolled back one at a time.
 * 2. Code-level capability guards for request shapes the server strategy does
 *    not implement yet. These cannot be overridden by the flag; each one is
 *    deleted as the corresponding capability lands.
 *
 * A transaction can carry several types across its nested transactions, so
 * both layers match against the transaction and its nested transactions.
 *
 * @param options - Options bag.
 * @param options.enabledTransactionTypes - Transaction types opted in via
 * remote feature flag.
 * @param options.requests - Quote requests for required tokens.
 * @param options.transaction - Metadata of the original target transaction.
 * @returns The first reason the requests are unsupported, or `undefined` if
 * every request is supported.
 */
export function getServerUnsupportedReason({
  enabledTransactionTypes,
  requests,
  transaction,
}: {
  enabledTransactionTypes: TransactionType[];
  requests: QuoteRequest[];
  transaction?: TransactionMeta;
}): ServerUnsupportedReason | undefined {
  if (!hasTransactionType(transaction, enabledTransactionTypes)) {
    return ServerUnsupportedReason.DisabledTransactionType;
  }

  // Checked after the allowlist so that a transaction combining an allowlisted
  // type with an exact-output type is still declined.
  if (hasTransactionType(transaction, EXACT_OUTPUT_TRANSACTION_TYPES)) {
    return ServerUnsupportedReason.ExactOutput;
  }

  for (const request of requests) {
    const reason = getRequestUnsupportedReason(request);

    if (reason) {
      return reason;
    }
  }

  return undefined;
}

/**
 * Determine whether a single quote request uses a capability the server
 * strategy has not implemented yet.
 *
 * @param request - Quote request for a required token.
 * @returns The reason the request is unsupported, or `undefined`.
 */
function getRequestUnsupportedReason(
  request: QuoteRequest,
): ServerUnsupportedReason | undefined {
  if (request.atomic === false) {
    return ServerUnsupportedReason.NonAtomic;
  }

  if (request.hyperliquidActivationFeeUsd !== undefined) {
    return ServerUnsupportedReason.HyperliquidActivationFee;
  }

  if (request.isDirectMusdMoneyAccount === true) {
    return ServerUnsupportedReason.DirectMusdMoneyAccount;
  }

  if (request.isMaxAmount === true) {
    return ServerUnsupportedReason.MaxAmount;
  }

  if (request.isPolymarketDepositWallet === true) {
    return ServerUnsupportedReason.PolymarketDepositWallet;
  }

  return undefined;
}
