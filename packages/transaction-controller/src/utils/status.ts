import { messengerSubscribeOnceIf } from './messenger';
import type { TransactionControllerMessenger } from '../TransactionController';
import type { TransactionMeta } from '../types';
import { TransactionStatus } from '../types';

/**
 *
 * @param status -
 * @returns -
 */
export function isFinalStatus(status: TransactionStatus): boolean {
  return [
    TransactionStatus.confirmed,
    TransactionStatus.failed,
    TransactionStatus.rejected,
  ].includes(status);
}

/**
 * Whether the transaction has at least completed all local processing.
 *
 * @param status - The transaction status.
 * @returns Whether the transaction is in a final state.
 */
export function isLocalFinalStatus(status: TransactionStatus): boolean {
  return isFinalStatus(status) || status === TransactionStatus.submitted;
}

/**
 *
 * @param transactionId -
 * @param messenger -
 * @returns -
 */
export async function waitForTransactionFinishedRemote(
  transactionId: string,
  messenger: TransactionControllerMessenger,
): Promise<TransactionMeta> {
  const existigTransactionMeta = getTransactonMetadata(
    transactionId,
    messenger,
  );

  if (!existigTransactionMeta) {
    throw new Error(`Transaction with id ${transactionId} not found`);
  }

  if (isFinalStatus(existigTransactionMeta.status)) {
    return existigTransactionMeta;
  }

  return new Promise((resolve) => {
    messengerSubscribeOnceIf(
      messenger,
      'TransactionController:transactionStatusUpdated',
      ({ transactionMeta }) => {
        resolve(transactionMeta);
      },
      ({ transactionMeta }) =>
        transactionMeta.id === transactionId &&
        isFinalStatus(transactionMeta.status),
    );
  });
}

/**
 *
 * @param transactionId -
 * @param messenger -
 * @returns -
 */
function getTransactonMetadata(
  transactionId: string,
  messenger: TransactionControllerMessenger,
): TransactionMeta | undefined {
  const state = messenger.call('TransactionController:getState');
  return state.transactions.find((tx) => tx.id === transactionId);
}
