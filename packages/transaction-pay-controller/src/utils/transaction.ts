import type { TransactionMeta } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';

import { calculateFiat } from './required-fiat';
import { parseRequiredTokens } from './required-tokens';
import { projectLogger } from '../logger';
import type {
  TransactionData,
  TransactionPayControllerMessenger,
  TransactionToken,
  TransactionTokenFiat,
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
  updateTransactionData: (
    transactionId: string,
    fn: (transactionData: TransactionData) => void,
  ) => void,
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
 * Handle a transaction change by updating its associated data.
 *
 * @param transaction - Transaction metadata.
 * @param messenger - Controller messenger.
 * @param updateTransactionData - Callback to update transaction data.
 */
function onTransactionChange(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: (
    transactionId: string,
    fn: (transactionData: TransactionData) => void,
  ) => void,
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
