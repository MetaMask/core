import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  hasTransactionType,
  TransactionType,
} from '@metamask/transaction-controller';

/**
 * Transaction types whose quote must be priced as an exact output.
 *
 * These transactions embed a call that transfers exactly the target amount, so
 * pricing the quote on the input amount underfunds that transfer and reverts.
 */
const EXACT_OUTPUT_TRANSACTION_TYPES: TransactionType[] = [
  TransactionType.perpsDepositAndOrder,
  TransactionType.predictDepositAndOrder,
];

/** Pricing basis requested for a quote. */
export enum TradeType {
  /** Spend exactly the requested amount of the source token. */
  ExactInput = 'EXACT_INPUT',

  /** Receive exactly the requested amount of the target token. */
  ExactOutput = 'EXACT_OUTPUT',

  /**
   * Receive approximately the requested amount of the target token, tolerating
   * slippage in either direction.
   */
  ExpectedOutput = 'EXPECTED_OUTPUT',
}

/**
 * Determine how a quote must be priced, and which amount expresses that price.
 *
 * A quote is priced as an exact output when the request carries calls that
 * consume a specific amount, since any slippage would underfund them, and when
 * the transaction is a deposit-and-order type that embeds such a call even
 * though the calls themselves are suppressed downstream. Everything else is
 * priced on the amount actually being spent.
 *
 * Shared by the relay and server strategies so both price identically.
 *
 * @param options - Options bag.
 * @param options.hasCalls - Whether the request bundles calls that consume a
 * specific amount of the target token.
 * @param options.sourceTokenAmount - Amount of the source token being spent.
 * @param options.targetAmountMinimum - Minimum amount of the target token the
 * transaction needs to receive.
 * @param options.transaction - Metadata of the original target transaction.
 * @returns The amount to quote and the pricing basis to quote it on.
 */
export function getQuotePricing({
  hasCalls,
  sourceTokenAmount,
  targetAmountMinimum,
  transaction,
}: {
  hasCalls: boolean;
  sourceTokenAmount: string;
  targetAmountMinimum: string;
  transaction?: TransactionMeta;
}): { amount: string; tradeType: TradeType } {
  const requiresExactOutput =
    hasCalls || hasTransactionType(transaction, EXACT_OUTPUT_TRANSACTION_TYPES);

  return requiresExactOutput
    ? { amount: targetAmountMinimum, tradeType: TradeType.ExactOutput }
    : { amount: sourceTokenAmount, tradeType: TradeType.ExactInput };
}
