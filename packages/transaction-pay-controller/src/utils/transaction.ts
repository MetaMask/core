import {
  TransactionStatus,
  type TransactionMeta,
} from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';
import { cloneDeep } from 'lodash';

import { calculateFiat } from './required-fiat';
import { parseRequiredTokens } from './required-tokens';
import { projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayPublishHookMessenger,
  TransactionToken,
  TransactionTokenFiat,
  UpdateTransactionDataCallback,
} from '../types';

const log = createModuleLogger(projectLogger, 'transaction');

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
 */
export function pollTransactionChanges(
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
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
  messenger: TransactionPayPublishHookMessenger,
) {
  return new Promise<void>((resolve, reject) => {
    const handler = (transactionMeta: TransactionMeta | undefined) => {
      const unsubscribe = () =>
        messenger.unsubscribe('TransactionController:stateChange', handler);

      if (transactionMeta?.status === TransactionStatus.confirmed) {
        unsubscribe();
        resolve();
      }

      if (
        [TransactionStatus.failed, TransactionStatus.dropped].includes(
          transactionMeta?.status as TransactionStatus,
        )
      ) {
        unsubscribe();
        reject(new Error(`Transaction status is ${transactionMeta?.status}`));
      }
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
    note,
  }: {
    transactionId: string;
    messenger: TransactionPayPublishHookMessenger;
    note: string;
  },
  fn: (draft: TransactionMeta) => void,
) {
  const transaction = getTransaction(transactionId, messenger as never);

  if (!transaction) {
    throw new Error(`Transaction not found: ${transactionId}`);
  }

  const newTransaction = cloneDeep(transaction);

  fn(newTransaction);

  messenger.call(
    'TransactionController:updateTransaction',
    newTransaction,
    note,
  );
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
  const tokens = getTokens(transaction, messenger);

  log('Transaction changed', { transaction, tokens });

  updateTransactionData(transaction.id, (data) => {
    data.tokens = tokens;
  });
}

/**
 * Generate the token data for a transaction.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @returns An array of transaction tokens.
 */
function getTokens(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionToken[] {
  const requiredTokens = parseRequiredTokens(transaction, messenger);

  const fiat = requiredTokens
    .map((t) => calculateFiat(t, messenger))
    .filter(Boolean);

  if (requiredTokens.length !== fiat.length) {
    return [];
  }

  return requiredTokens.map((t, i) => ({
    ...t,
    ...(fiat[i] as TransactionTokenFiat),
  }));
}
