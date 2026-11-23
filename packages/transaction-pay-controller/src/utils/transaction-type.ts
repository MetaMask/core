import { TransactionType } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

/**
 * Generic nested-type names that are infrastructure rather than pay-specific.
 * Never use these as the "pay type" for resume gating.
 */
const GENERIC_NESTED_TYPES: TransactionType[] = [
  TransactionType.tokenMethodApprove,
  TransactionType.contractInteraction,
  TransactionType.simpleSend,
  TransactionType.batch,
];

/**
 * Returns the pay-specific transaction type for a transaction.
 *
 * For non-batch transactions, this is `transaction.type`.
 * For batch transactions, it is the first nested type that is not in
 * {@link GENERIC_NESTED_TYPES}, or `undefined` if all nested types are generic.
 *
 * @param transaction - The transaction to inspect.
 * @returns The pay transaction type, or `undefined` if none can be derived.
 */
export function getPayTransactionType(
  transaction: TransactionMeta | undefined,
): TransactionType | undefined {
  if (!transaction) {
    return undefined;
  }

  if (transaction.type !== TransactionType.batch) {
    return transaction.type;
  }

  return transaction.nestedTransactions?.find(
    (tx) => tx.type && !GENERIC_NESTED_TYPES.includes(tx.type),
  )?.type;
}
