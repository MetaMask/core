import {
  TransactionStatus,
  TransactionType,
} from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';
import type { Patch } from 'immer';
import { cloneDeep } from 'lodash';

import { projectLogger } from '../logger';
import type {
  TransactionPayControllerMessenger,
  TransactionPayControllerState,
  UpdateTransactionDataCallback,
} from '../types';
import { getAssetsUnifyStateFeature } from './feature-flags';
import { parseRequiredTokens } from './required-tokens';

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
): void {
  messenger.subscribe(
    'TransactionController:stateChange',
    (
      transactions: TransactionMeta[],
      previousTransactions: TransactionMeta[] | undefined,
    ) => {
      const newTransactions = transactions.filter(
        (tx) => !previousTransactions?.find((prevTx) => prevTx.id === tx.id),
      );

      const updatedTransactions = transactions
        .map((tx) => {
          const previousTransaction = previousTransactions?.find(
            (prevTx) => prevTx.id === tx.id,
          );

          if (
            !previousTransaction ||
            previousTransaction.txParams.data === tx.txParams.data
          ) {
            return undefined;
          }

          return { tx, previousTransaction };
        })
        .filter(
          (
            entry,
          ): entry is {
            tx: TransactionMeta;
            previousTransaction: TransactionMeta;
          } => entry !== undefined,
        );

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

      newTransactions.forEach((tx) =>
        onTransactionChange(tx, undefined, messenger, updateTransactionData),
      );

      updatedTransactions.forEach(({ tx, previousTransaction }) =>
        onTransactionChange(
          tx,
          previousTransaction,
          messenger,
          updateTransactionData,
        ),
      );
    },
    (state) => state.transactions,
  );
}

/**
 * Subscribe to token-data and rate-source state changes and re-run
 * {@link parseRequiredTokens} for in-flight transactions whose required
 * tokens have not yet been resolved.
 *
 * `parseRequiredTokens` returns an empty array when any of token info,
 * token fiat rates, or native currency rates are unavailable. Without this
 * subscription, those transactions stay deadlocked: the existing
 * `TransactionController:stateChange` subscription only re-parses when
 * `txParams.data` changes, but the client typically gates `data` edits on
 * having a resolved required token. This handler closes the loop by re-parsing
 * when any of the underlying state sources land, mirroring the same source
 * selection `getTokenInfo` and `getTokenFiatRate` use.
 *
 * @param messenger - Controller messenger.
 * @param getControllerState - Callback returning the current pay-controller
 * state, used to find transactions with empty `tokens` to retry.
 * @param updateTransactionData - Callback to update transaction data.
 */
export function subscribeTokenChanges(
  messenger: TransactionPayControllerMessenger,
  getControllerState: () => TransactionPayControllerState,
  updateTransactionData: UpdateTransactionDataCallback,
): void {
  const buildHandler =
    (source: string) =>
    (_state: unknown, patches: Patch[] | undefined): void => {
      const { transactionData } = getControllerState();

      for (const [transactionId, data] of Object.entries(transactionData)) {
        if (data.tokens.length > 0) {
          continue;
        }

        const transaction = getTransaction(transactionId, messenger);

        if (!transaction || FINALIZED_STATUSES.includes(transaction.status)) {
          continue;
        }

        log('Token or rate state changed, re-parsing required tokens', {
          transactionId,
          source,
          patches,
        });

        onTransactionChange(
          transaction,
          undefined,
          messenger,
          updateTransactionData,
        );
      }
    };

  if (getAssetsUnifyStateFeature(messenger)) {
    messenger.subscribe(
      'AssetsController:stateChange',
      buildHandler('AssetsController'),
    );
    return;
  }

  messenger.subscribe(
    'TokensController:stateChange',
    buildHandler('TokensController'),
  );
  messenger.subscribe(
    'TokenRatesController:stateChange',
    buildHandler('TokenRatesController'),
  );
  messenger.subscribe(
    'CurrencyRateController:stateChange',
    buildHandler('CurrencyRateController'),
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
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const isConfirmed = (tx?: TransactionMeta, fn?: () => void): boolean => {
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
      (singleTransaction) => singleTransaction.id === transactionId,
    );

    if (isConfirmed(initialTx)) {
      return;
    }

    const handler = (tx?: TransactionMeta): void => {
      const unsubscribe = (): void =>
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
    note,
  }: {
    transactionId: string;
    messenger: TransactionPayControllerMessenger;
    note: string;
  },
  fn: (draft: TransactionMeta) => void,
): void {
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
  const listener = (tx: TransactionMeta): void => {
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

  const end = (): void => {
    messenger.unsubscribe(
      'TransactionController:unapprovedTransactionAdded',
      listener,
    );
  };

  return { end };
}

/**
 * Check whether a transaction is a Predict withdrawal.
 *
 * Returns `true` when the transaction's own type is `predictWithdraw`, or
 * when any of its nested transactions has that type.
 *
 * @param transaction - Transaction metadata.
 * @returns `true` when the transaction is a Predict withdrawal.
 */
export function isPredictWithdrawTransaction(
  transaction: TransactionMeta,
): boolean {
  return (
    transaction.type === TransactionType.predictWithdraw ||
    (transaction.nestedTransactions?.some(
      (nt) => nt.type === TransactionType.predictWithdraw,
    ) ??
      false)
  );
}

/**
 * Handle a transaction change by updating its associated data.
 *
 * @param transaction - Transaction metadata.
 * @param previousTransaction - Previous transaction metadata, when this is an
 * update rather than a new transaction or a rate-driven recompute. Used to
 * surface the calldata diff in logs.
 * @param messenger - Controller messenger.
 * @param updateTransactionData - Callback to update transaction data.
 */
function onTransactionChange(
  transaction: TransactionMeta,
  previousTransaction: TransactionMeta | undefined,
  messenger: TransactionPayControllerMessenger,
  updateTransactionData: UpdateTransactionDataCallback,
): void {
  const tokens = parseRequiredTokens(transaction, messenger);

  log('Transaction changed', {
    transactionId: transaction.id,
    chainId: transaction.chainId,
    tokens,
    ...(previousTransaction
      ? {
          dataChanged: {
            from: previousTransaction.txParams.data,
            to: transaction.txParams.data,
          },
        }
      : {}),
  });

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
): void {
  log('Transaction finalized', { transaction });
  removeTransactionData(transaction.id);
}
