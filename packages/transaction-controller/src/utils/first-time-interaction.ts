import type { TraceContext, TraceCallback } from '@metamask/controller-utils';
import { hexToNumber } from '@metamask/utils';

import { getAccountAddressRelationship } from '../api/accounts-api.js';
import type { GetAccountAddressRelationshipRequest } from '../api/accounts-api.js';
import { projectLogger as log } from '../logger.js';
import type { TransactionMeta } from '../types.js';
import { getEffectiveRecipient } from './recipient.js';
import { validateParamTo } from './validation.js';

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
    txParams: { from },
  } = transactionMeta;

  const recipient = getEffectiveRecipient(transactionMeta);

  const request: GetAccountAddressRelationshipRequest = {
    chainId: hexToNumber(chainId),
    to: recipient as string,
    from,
  };

  validateParamTo(recipient);

  const recipientLower = recipient?.toLowerCase();
  const existingTransaction = existingTransactions.find(
    (tx) =>
      tx.id !== transactionId &&
      tx.chainId === chainId &&
      tx.txParams?.from?.toLowerCase() === from?.toLowerCase() &&
      getEffectiveRecipient(tx)?.toLowerCase() === recipientLower,
  );

  // Skip API call only if we already have a tx with same from and same effective recipient (e.g. duplicate or pending).
  // For token transfers (ERC20/ERC721/ERC1155), effective recipient is decoded from data; using txParams.to
  // would wrongly match any send of the same token contract.
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
