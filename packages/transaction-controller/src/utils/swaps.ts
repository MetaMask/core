import { merge, pickBy } from 'lodash';

import type { TransactionMeta } from '../types';
import { validateIfTransactionUnapproved } from './utils';

/**
 * Updates the transaction meta object with the swap information
 *
 * @param transactionMeta - Transaction meta object to update
 * @param propsToUpdate - Properties to update
 * @param propsToUpdate.sourceTokenSymbol - Symbol of the token to be swapped
 * @param propsToUpdate.destinationTokenSymbol - Symbol of the token to be received
 * @param propsToUpdate.type - Type of the transaction
 * @param propsToUpdate.destinationTokenDecimals - Decimals of the token to be received
 * @param propsToUpdate.destinationTokenAddress - Address of the token to be received
 * @param propsToUpdate.swapMetaData - Metadata of the swap
 * @param propsToUpdate.swapTokenValue - Value of the token to be swapped
 * @param propsToUpdate.estimatedBaseFee - Estimated base fee of the transaction
 * @param propsToUpdate.approvalTxId - Transaction id of the approval transaction
 */
export function updateSwapTransaction(
  transactionMeta: TransactionMeta,
  {
    sourceTokenSymbol,
    destinationTokenSymbol,
    type,
    destinationTokenDecimals,
    destinationTokenAddress,
    swapMetaData,
    swapTokenValue,
    estimatedBaseFee,
    approvalTxId,
  }: Partial<TransactionMeta>,
) {
  validateIfTransactionUnapproved(transactionMeta, 'updateSwapTransaction');

  let swapTransaction = {
    sourceTokenSymbol,
    destinationTokenSymbol,
    type,
    destinationTokenDecimals,
    destinationTokenAddress,
    swapMetaData,
    swapTokenValue,
    estimatedBaseFee,
    approvalTxId,
  };
  swapTransaction = pickBy(swapTransaction) as any;
  merge(transactionMeta, swapTransaction);
}

/**
 * Updates the transaction meta object with the swap approval information
 *
 * @param transactionMeta - Transaction meta object to update
 * @param propsToUpdate - Properties to update
 * @param propsToUpdate.type - Type of the transaction
 * @param propsToUpdate.sourceTokenSymbol - Symbol of the token to be swapped
 */
export function updateSwapApprovalTransaction(
  transactionMeta: TransactionMeta,
  { type, sourceTokenSymbol }: Partial<TransactionMeta>,
) {
  validateIfTransactionUnapproved(
    transactionMeta,
    'updateSwapApprovalTransaction',
  );

  let swapApprovalTransaction = { type, sourceTokenSymbol } as any;
  swapApprovalTransaction = pickBy({
    type,
    sourceTokenSymbol,
  }) as Partial<TransactionMeta>;
  merge(transactionMeta, swapApprovalTransaction);
}
