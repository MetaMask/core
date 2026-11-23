import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_MONAD } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type { PayStrategyResumeRequest } from '../../types.js';
import { waitForTransactionConfirmed } from '../../utils/transaction.js';
import { submitDirectMusdAfterFiatCompletion } from './fiat-direct-musd.js';
import { waitForOrderCompletion } from './fiat-submit.js';

const log = createModuleLogger(projectLogger, 'fiat-resume');

/**
 * Resumes a fiat → direct mUSD transaction after an app restart.
 *
 * @param request - Resume request containing messenger and transaction.
 * @returns Object containing the transaction hash on success.
 */
export async function resumeFiatDirectMusd(
  request: PayStrategyResumeRequest,
): Promise<{ transactionHash?: Hex }> {
  const { messenger, transaction } = request;
  const { id, metamaskPay, submittedTime, txParams } = transaction;
  const { fiat } = metamaskPay ?? {};

  if (!fiat?.orderId || !fiat.provider) {
    throw new Error('Missing fiat order metadata');
  }

  const walletAddress = txParams.from;

  log('Attempting fiat resume', { id, orderId: fiat.orderId });

  const monadChildId = findMonadSecondLegChild(transaction, messenger);

  if (monadChildId) {
    log('Found existing second-leg child tx', { id, monadChildId });

    const { transactions: allTxs } = messenger.call(
      'TransactionController:getState',
    );

    const childTx = allTxs.find((tx) => tx.id === monadChildId);

    if (childTx?.status === TransactionStatus.confirmed) {
      return { transactionHash: childTx.hash as Hex };
    }

    await waitForTransactionConfirmed(monadChildId, messenger);

    const { transactions: updatedTxs } = messenger.call(
      'TransactionController:getState',
    );
    const updated = updatedTxs.find((tx) => tx.id === monadChildId);

    return { transactionHash: updated?.hash as Hex | undefined };
  }

  const order = await waitForOrderCompletion({
    messenger,
    orderCode: fiat.orderId,
    providerCode: fiat.provider,
    startTime: submittedTime,
    transactionId: id,
    walletAddress,
  });

  log('Order completed', { id, orderId: fiat.orderId });

  return await submitDirectMusdAfterFiatCompletion({
    order,
    messenger,
    transaction,
  });
}

/**
 * Finds the ID of an existing second-leg child tx on Monad in `requiredTransactionIds`.
 * Returns undefined if none found.
 *
 * @param transaction - Parent transaction being resumed.
 * @param messenger - Controller messenger.
 * @returns Existing Monad child transaction ID, if present.
 */
function findMonadSecondLegChild(
  transaction: TransactionMeta,
  messenger: PayStrategyResumeRequest['messenger'],
): string | undefined {
  const { requiredTransactionIds } = transaction;

  if (!requiredTransactionIds?.length) {
    return undefined;
  }

  const { transactions } = messenger.call('TransactionController:getState');
  const from = transaction.txParams.from?.toLowerCase();

  return requiredTransactionIds.find((childId) => {
    const child = transactions.find((tx) => tx.id === childId);
    return (
      child?.chainId === CHAIN_ID_MONAD &&
      child.txParams.from?.toLowerCase() === from
    );
  });
}
