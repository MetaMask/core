import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { parseRequiredTokens } from './required-tokens';
import { projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  UpdateTransactionDataCallback,
} from '../types';

const log = createModuleLogger(projectLogger, 'transaction');

export const FINALIZED_STATUSES = [
  TransactionStatus.confirmed,
  TransactionStatus.dropped,
  TransactionStatus.failed,
];

/**
 * Retrieve transaction metadata by ID.
 *
 * @param transactionId - ID of the transaction to retrieve.
 * @param messenger - Controller messenger.
 * @returns The transaction metadata or undefined if not found.
 */
export function getTransaction(
  transactionId: string,
  messenger: TransactionPayControllerMessenger,
): TransactionMeta | undefined {
  const transactionControllerState = messenger.call(
    'TransactionController:getState',
  );

  return transactionControllerState.transactions.find(
    (tx) => tx.id === transactionId,
  );
}

/**
 * Poll for transaction changes and update the transaction data accordingly.
 *
 * @param messenger - Controller messenger.
 * @param updateTransactionData - Callback to update transaction data.
 * @param removeTransactionData - Callback to remove transaction data.
 */
export function pollTransactionChanges(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
  removeTransactionData: (transactionId: string) => void,
) {
  messenger.subscribe(
    'TransactionController:stateChange',
    (
      transactions: TransactionMeta[],
      previousTransactions: TransactionMeta[] | undefined,
    ) => {
      const newTransactions = transactions.filter(
        (tx) => !previousTransactions?.find((prevTx) => prevTx.id === tx.id),
      );

      const updatedTransactions = transactions.filter((tx) => {
        const previousTransaction = previousTransactions?.find(
          (prevTx) => prevTx.id === tx.id,
        );

        return (
          previousTransaction &&
          previousTransaction?.txParams.data !== tx.txParams.data
        );
      });

      const finalizedTransactions = transactions.filter((tx) => {
        const previousTransaction = previousTransactions?.find(
          (prevTx) => prevTx.id === tx.id,
        );

        return (
          previousTransaction &&
          !FINALIZED_STATUSES.includes(previousTransaction.status) &&
          FINALIZED_STATUSES.includes(tx.status)
        );
      });

      const deletedTransactions = (previousTransactions ?? []).filter(
        (prevTx) => !transactions.find((tx) => tx.id === prevTx.id),
      );

      [...finalizedTransactions, ...deletedTransactions].forEach((tx) =>
        onTransactionFinalized(tx, removeTransactionData),
      );

      [...newTransactions, ...updatedTransactions].forEach((tx) =>
        onTransactionChange(tx, messenger, updateTransactionData),
      );
    },
    (state) => state.transactions,
  );
}

/**
 * Wait for a transaction to be confirmed or fail.
 *
 * @param transactionId - ID of the transaction to wait for.
 * @param messenger - Controller messenger.
 * @returns A promise that resolves when the transaction is confirmed or rejects if it fails.
 */
export function waitForTransactionConfirmed(
  transactionId: string,
  messenger: TransactionPayControllerMessenger,
) {
  return new Promise<void>((resolve, reject) => {
    const isConfirmed = (tx?: TransactionMeta, fn?: () => void) => {
      log('Checking transaction status', tx?.status, tx?.type);

      if (tx?.status === TransactionStatus.confirmed) {
        fn?.();
        resolve();
        return true;
      }

      if (
        [TransactionStatus.dropped, TransactionStatus.failed].includes(
          tx?.status as TransactionStatus,
        )
      ) {
        fn?.();
        reject(
          new Error(`Transaction failed - ${tx?.type} - ${tx?.error?.message}`),
        );
        return true;
      }

      return false;
    };

    const initialState = messenger.call('TransactionController:getState');

    const initialTx = initialState.transactions.find(
      (t) => t.id === transactionId,
    );

    if (isConfirmed(initialTx)) {
      return;
    }

    const handler = (tx?: TransactionMeta) => {
      const unsubscribe = () =>
        messenger.unsubscribe('TransactionController:stateChange', handler);

      isConfirmed(tx, unsubscribe);
    };

    messenger.subscribe('TransactionController:stateChange', handler, (state) =>
      state.transactions.find((tx) => tx.id === transactionId),
    );
  });
}

/**
 * Update a transaction by applying a function to its draft.
 *
 * @param request - Request object.
 * @param request.transactionId - ID of the transaction to update.
 * @param request.messenger - Controller messenger.
 * @param request.note - Note describing the update.
 * @param fn - Function that applies updates to the transaction draft.
 */
export function updateTransaction(
  {
    transactionId,
    messenger,
  }: {
    transactionId: string;
    messenger: TransactionPayControllerMessenger;
  },
  fn: (draft: TransactionMeta) => void,
) {
  const transaction = getTransaction(transactionId, messenger as never);

  if (!transaction) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const newTransaction = cloneDeep(transaction);

  fn(newTransaction);

  messenger.call('TransactionController:updateTransaction', newTransaction);
}

/**
 * Collect all new transactions until `end` is called.
 *
 * @param chainId - The chain ID to filter transactions by.
 * @param from - The address to filter transactions by.
 * @param messenger - The controller messenger.
 * @param onTransaction - Callback called with each matching transaction ID.
 * @returns An object with an `end` method to stop collecting transactions.
 */
export function collectTransactionIds(
  chainId: Hex,
  from: Hex,
  messenger: TransactionPayControllerMessenger,
  onTransaction: (transactionId: string) => void,
): { end: () => void } {
  const listener = (tx: TransactionMeta) => {
    if (
      tx.chainId !== chainId ||
      tx.txParams.from.toLowerCase() !== from.toLowerCase()
    ) {
      return;
    }

    onTransaction(tx.id);
  };

  messenger.subscribe(
    'TransactionController:unapprovedTransactionAdded',
    listener,
  );

  const end = () => {
    messenger.unsubscribe(
      'TransactionController:unapprovedTransactionAdded',
      listener,
    );
  };

  return { end };
}

/**
 * Handle a transaction change by updating its associated data.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @param updateTransactionData - Callback to update transaction data.
 */
function onTransactionChange(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
) {
  const tokens = parseRequiredTokens(transaction, messenger);

  log('Transaction changed', { transaction, tokens });

  updateTransactionData(transaction.id, (data) => {
    data.tokens = tokens;
  });
}

/**
 * Handle a finalized transaction by removing its associated data.
 *
 * @param transaction - Transaction metadata.
 * @param removeTransactionData - Callback to remove transaction data.
 */
function onTransactionFinalized(
  transaction: TransactionMeta,
  removeTransactionData: (transactionId: string) => void,
) {
  log('Transaction finalized', { transaction });
  removeTransactionData(transaction.id);
}
