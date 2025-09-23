import type { TraceContext, TraceCallback } from '@metamask/controller-utils';
import { hexToNumber } from '@metamask/utils';

import { decodeTransactionData } from './transaction-type';
import { validateParamTo } from './validation';
import {
  getAccountAddressRelationship,
  type GetAccountAddressRelationshipRequest,
} from '../api/accounts-api';
import { projectLogger as log } from '../logger';
import type { TransactionMeta } from '../types';

type UpdateFirstTimeInteractionRequest = {
  existingTransactions: TransactionMeta[];
  getTransaction: (transactionId: string) => TransactionMeta | undefined;
  isFirstTimeInteractionEnabled: () => boolean;
  options?: {
    traceContext?: TraceContext;
  };
  trace: TraceCallback;
  transactionMeta: TransactionMeta;
  updateTransactionInternal: (
    updateParams: {
      transactionId: string;
      note: string;
    },
    updater: (txMeta: TransactionMeta) => void,
  ) => void;
};

/**
 * Updates the first-time interaction status for a transaction.
 *
 * @param params - The parameters for updating first time interaction.
 * @param params.existingTransactions - The existing transactions.
 * @param params.getTransaction - Function to get a transaction by ID.
 * @param params.isFirstTimeInteractionEnabled - The function to check if first time interaction is enabled.
 * @param params.options - The options for updating first time interaction.
 * @param params.trace - The trace callback.
 * @param params.transactionMeta - The transaction meta object.
 * @param params.updateTransactionInternal - Function to update transaction internal state.
 * @returns Promise that resolves when the update is complete.
 */
export async function updateFirstTimeInteraction({
  existingTransactions,
  getTransaction,
  isFirstTimeInteractionEnabled,
  options = {},
  trace,
  transactionMeta,
  updateTransactionInternal,
}: UpdateFirstTimeInteractionRequest): Promise<void> {
  const { traceContext } = options;

  if (!isFirstTimeInteractionEnabled()) {
    return;
  }

  const {
    chainId,
    id: transactionId,
    txParams: { data, from, to },
  } = transactionMeta;

  let recipient;
  if (data) {
    const parsedData = decodeTransactionData(data);
    if (
      parsedData?.name === 'transferFrom' ||
      parsedData?.name === 'safeTransferFrom'
    ) {
      // ERC721 and ERC1155
      recipient = parsedData?.args[1];
    } else if (parsedData?.name === 'transfer') {
      // ERC20
      recipient = parsedData?.args?._to;
    }
  }

  if (!recipient) {
    // Use as fallback if no recipient is found from decode or no data is present
    recipient = to;
  }

  const request: GetAccountAddressRelationshipRequest = {
    chainId: hexToNumber(chainId),
    to: recipient as string,
    from,
  };

  validateParamTo(recipient);

  const existingTransaction = existingTransactions.find(
    (tx) =>
      tx.chainId === chainId &&
      tx.txParams.from === from &&
      tx.txParams.to === to &&
      tx.id !== transactionId,
  );

  // Check if there is an existing transaction with the same from, to, and chainId
  // else we continue to check the account address relationship from API
  if (existingTransaction) {
    return;
  }

  try {
    const { count } = await trace(
      { name: 'Account Address Relationship', parentContext: traceContext },
      () => getAccountAddressRelationship(request),
    );

    const isFirstTimeInteraction =
      count === undefined ? undefined : count === 0;

    const finalTransactionMeta = getTransaction(transactionId);

    /* istanbul ignore if */
    if (!finalTransactionMeta) {
      log(
        'Cannot update first time interaction as transaction not found',
        transactionId,
      );
      return;
    }

    updateTransactionInternal(
      {
        transactionId,
        note: 'TransactionController#updateFirstInteraction - Update first time interaction',
      },
      (txMeta) => {
        txMeta.isFirstTimeInteraction = isFirstTimeInteraction;
      },
    );

    log('Updated first time interaction', transactionId, {
      isFirstTimeInteraction,
    });
  } catch (error) {
    log(
      'Error fetching account address relationship, skipping first time interaction update',
      error,
    );
  }
}
