import type { TransactionMeta } from '@metamask/transaction-controller';
import {
  hasTransactionType,
  TransactionType,
} from '@metamask/transaction-controller';

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

/** Why the server strategy declined to handle a request. */
export enum ServerUnsupportedReason {
  /** The parent transaction type is not in the remote-flag allowlist. */
  DisabledTransactionType = 'disabledTransactionType',
}

/**
 * Determine whether the server strategy can handle a transaction.
 *
 * Flows are gated by a remote-flag allowlist of transaction types, so they can
 * be rolled out and rolled back one at a time. A transaction can carry several
 * types across its nested transactions, so the allowlist is matched against the
 * transaction and its nested transactions.
 *
 * @param options - Options bag.
 * @param options.enabledTransactionTypes - Transaction types opted in via
 * remote feature flag.
 * @param options.transaction - Metadata of the original target transaction.
 * @returns The reason the transaction is unsupported, or `undefined` if it is
 * supported.
 */
export function getServerUnsupportedReason({
  enabledTransactionTypes,
  transaction,
}: {
  enabledTransactionTypes: TransactionType[];
  transaction?: TransactionMeta;
}): ServerUnsupportedReason | undefined {
  if (!hasTransactionType(transaction, enabledTransactionTypes)) {
    return ServerUnsupportedReason.DisabledTransactionType;
  }

  return undefined;
}
