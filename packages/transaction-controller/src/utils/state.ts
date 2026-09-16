import { convertHexToDecimal } from '@metamask/controller-utils';
import type { WritableDraft } from 'immer/dist/internal.js';

import type {
  TransactionControllerMessenger,
  TransactionControllerState,
} from '../TransactionController.js';
import type { TransactionMeta } from '../types.js';
import { TransactionStatus } from '../types.js';
import { getTransactionHistoryLimit } from './feature-flags.js';
import { validateTxParams } from './validation.js';

/** Live access to controller state and its mutation boundary. */
export type TransactionStateAccess = {
  getState: () => TransactionControllerState;
  messenger: TransactionControllerMessenger;
  update: (
    callback: (
      state: WritableDraft<TransactionControllerState>,
    ) => void | TransactionControllerState,
  ) => void;
};

/**
 * Validate and persist a transaction, applying the current history limit.
 *
 * @param request - State mutation and feature-flag access.
 * @param transactionMeta - Transaction to persist.
 */
export function addTransactionToState(
  request: Pick<TransactionStateAccess, 'messenger' | 'update'>,
  transactionMeta: TransactionMeta,
): void {
  validateTxParams(transactionMeta.txParams);
  request.update((state) => {
    state.transactions = trimTransactionsForState(
      [...state.transactions, transactionMeta],
      request.messenger,
    );
  });
}

/**
 * Remove a transaction and apply the current history limit.
 *
 * @param request - State mutation and feature-flag access.
 * @param transactionId - Transaction to remove.
 */
export function deleteTransaction(
  request: Pick<TransactionStateAccess, 'messenger' | 'update'>,
  transactionId: string,
): void {
  request.update((state) => {
    state.transactions = trimTransactionsForState(
      state.transactions.filter(({ id }) => id !== transactionId),
      request.messenger,
    );
  });
}

/**
 * Look up a transaction in the supplied current state.
 *
 * @param state - Current controller state.
 * @param transactionId - Transaction to find.
 * @returns The transaction, if present.
 */
export function getTransaction(
  state: Pick<TransactionControllerState, 'transactions'>,
  transactionId: string,
): TransactionMeta | undefined {
  return state.transactions.find(({ id }) => id === transactionId);
}

/**
 * Look up a transaction, throwing the standard controller error if missing.
 *
 * @param state - Current controller state.
 * @param transactionId - Transaction to find.
 * @param errorMessagePrefix - Prefix for the missing-transaction error.
 * @returns The transaction.
 */
export function getTransactionOrThrow(
  state: Pick<TransactionControllerState, 'transactions'>,
  transactionId: string,
  errorMessagePrefix = 'TransactionController',
): TransactionMeta {
  const transactionMeta = getTransaction(state, transactionId);
  if (!transactionMeta) {
    throw new Error(
      `${errorMessagePrefix}: No transaction found with id ${transactionId}`,
    );
  }
  return transactionMeta;
}

/**
 * Determine whether a transaction is in a terminal state.
 *
 * @param status - Current transaction status.
 * @returns Whether the transaction is in a final state.
 */
export function isFinalState(status: TransactionStatus): boolean {
  return (
    status === TransactionStatus.rejected ||
    status === TransactionStatus.confirmed ||
    status === TransactionStatus.failed ||
    status === TransactionStatus.dropped
  );
}

/**
 * Read whether a transaction has completed local processing.
 *
 * @param state - Current controller state.
 * @param transactionId - Transaction to look up.
 * @returns Current metadata and whether it has reached a local final state.
 */
export function isTransactionCompleted(
  state: Pick<TransactionControllerState, 'transactions'>,
  transactionId: string,
): { isCompleted: boolean; meta?: TransactionMeta } {
  const meta = getTransaction(state, transactionId);
  const isCompleted = Boolean(
    meta &&
      [
        TransactionStatus.confirmed,
        TransactionStatus.failed,
        TransactionStatus.rejected,
        TransactionStatus.submitted,
      ].includes(meta.status),
  );
  return { isCompleted, meta };
}

/**
 * Trim finalized history, keeping transactions with the same nonce, day and
 * network together and always retaining transactions still being processed.
 *
 * @param transactions - Transactions to persist.
 * @param messenger - Access to the configured history limit.
 * @returns Transactions in ascending time order, within the history limit.
 */
export function trimTransactionsForState(
  transactions: TransactionMeta[],
  messenger: TransactionControllerMessenger,
): TransactionMeta[] {
  const transactionHistoryLimit = getTransactionHistoryLimit(messenger);
  if (transactionHistoryLimit === undefined) {
    return transactions;
  }

  const nonceNetworkSet = new Set();
  const transactionsToKeep = [...transactions]
    .sort((a, b) => (a.time > b.time ? -1 : 1))
    .filter((transactionMeta) => {
      const { chainId, status, txParams, time } = transactionMeta;
      if (txParams) {
        const key = `${String(txParams.nonce)}-${convertHexToDecimal(chainId)}-${new Date(time).toDateString()}`;
        if (nonceNetworkSet.has(key)) {
          return true;
        } else if (
          nonceNetworkSet.size < transactionHistoryLimit ||
          !isFinalState(status)
        ) {
          nonceNetworkSet.add(key);
          return true;
        }
      }
      return false;
    });

  transactionsToKeep.reverse();
  return transactionsToKeep;
}
