import type { TransactionDescription } from '@ethersproject/abi';
import type { TraceContext, TraceCallback } from '@metamask/controller-utils';
import { hexToNumber } from '@metamask/utils';

import { decodeTransactionData } from './transaction-type';
import { validateParamTo } from './validation';
import { getAccountAddressRelationship } from '../api/accounts-api';
import type { GetAccountAddressRelationshipRequest } from '../api/accounts-api';
import { projectLogger as log } from '../logger';
import { TransactionType } from '../types';
import type { TransactionMeta } from '../types';

type UpdateFirstTimeInteractionRequest = {
  existingTransactions: TransactionMeta[];
  getTransaction: (transactionId: string) => TransactionMeta | undefined;
  isFirstTimeInteractionEnabled: () => boolean;
  trace: TraceCallback;
  traceContext?: TraceContext;
  transactionMeta: TransactionMeta;
  updateTransaction: (
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
 * @param params.trace - The trace callback.
 * @param params.traceContext - The trace context.
 * @param params.transactionMeta - The transaction meta object.
 * @param params.updateTransaction - Function to update transaction internal state.
 * @returns Promise that resolves when the update is complete.
 */
export async function updateFirstTimeInteraction({
  existingTransactions,
  getTransaction,
  isFirstTimeInteractionEnabled,
  trace,
  traceContext,
  transactionMeta,
  updateTransaction,
}: UpdateFirstTimeInteractionRequest): Promise<void> {
  if (!isFirstTimeInteractionEnabled()) {
    return;
  }

  const {
    chainId,
    id: transactionId,
    txParams: { data, from, to },
    type,
  } = transactionMeta;

  let recipient;
  if (
    data &&
    [
      TransactionType.tokenMethodTransfer,
      TransactionType.tokenMethodTransferFrom,
    ].includes(type as TransactionType)
  ) {
    const parsedData = decodeTransactionData(data) as TransactionDescription;
    // _to is for ERC20, ERC721 and USDC
    // to is for ERC1155
    recipient = parsedData?.args?._to || parsedData?.args?.to;
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
      tx.txParams.from.toLowerCase() === from.toLowerCase() &&
      tx.txParams.to?.toLowerCase() === to?.toLowerCase() &&
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

    updateTransaction(
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
