import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import type { Hex } from '@metamask/utils';
import { createModuleLogger } from '@metamask/utils';

import { CHAIN_ID_MONAD } from '../../constants.js';
import { projectLogger } from '../../logger.js';
import type {
  PayStrategyResumeRequest,
  TransactionPayControllerMessenger,
} from '../../types.js';
import { waitForKeyringUnlock } from '../../utils/keyring.js';
import {
  getTransaction,
  waitForTransactionConfirmed,
} from '../../utils/transaction.js';
import { submitDirectMusdAfterFiatCompletion } from './fiat-direct-musd.js';
import { waitForOrderCompletion } from './fiat-submit.js';

const log = createModuleLogger(projectLogger, 'fiat-resume');

/**
 * Resumes a fiat → direct mUSD transaction after an app restart.
 *
 * Works out where the flow stopped from existing state:
 * 1. Any second-leg child on Monad that was never published (`approved` /
 * `signed`) is failed, since nothing publishes it after a restart.
 * 2. If the most recent remaining child is confirmed, return its hash. If it
 * is submitted, wait for it and return its hash.
 * 3. Otherwise, or if the submitted child fails, poll the fiat order, wait for
 * the wallet to be unlocked, then submit the vault deposit. CHOMP recovery
 * returns the existing vault deposit instead of depositing twice.
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

  const children = getSecondLegChildren(transaction, messenger);

  failUnpublishedChildren(id, children, messenger);

  const child = children.find((tx) =>
    [TransactionStatus.confirmed, TransactionStatus.submitted].includes(
      tx.status,
    ),
  );

  if (child?.status === TransactionStatus.confirmed) {
    log('Found confirmed second-leg child', { id, childId: child.id });
    return { transactionHash: child.hash as Hex };
  }

  if (child?.status === TransactionStatus.submitted) {
    log('Waiting for submitted second-leg child', { id, childId: child.id });

    try {
      await waitForTransactionConfirmed(child.id, messenger);

      return {
        transactionHash: getTransaction(child.id, messenger)?.hash as
          | Hex
          | undefined,
      };
    } catch (error) {
      // The deposit can fail on-chain because CHOMP already vaulted the
      // funds, so fall through to the submit path, which checks for that.
      log('Submitted second-leg child failed, resubmitting', {
        id,
        childId: child.id,
        error,
      });
    }
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

  // Polling can take minutes, during which the wallet may have been locked.
  await waitForKeyringUnlock(messenger);

  return await submitDirectMusdAfterFiatCompletion({
    order,
    messenger,
    transaction,
  });
}

/**
 * Returns the second-leg child txs on Monad from the parent's
 * `requiredTransactionIds`, most recent first.
 *
 * @param transaction - Parent transaction being resumed.
 * @param messenger - Controller messenger.
 * @returns Second-leg child transactions, most recent first.
 */
function getSecondLegChildren(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionMeta[] {
  const { requiredTransactionIds = [] } = transaction;
  const from = transaction.txParams.from?.toLowerCase();

  return [...requiredTransactionIds]
    .reverse()
    .map((childId) => getTransaction(childId, messenger))
    .filter(
      (child): child is TransactionMeta =>
        child?.chainId === CHAIN_ID_MONAD &&
        child.txParams.from?.toLowerCase() === from,
    );
}

/**
 * Fails every second-leg child that was never published, so it cannot be
 * published later alongside the resubmitted deposit.
 *
 * @param parentId - Parent transaction ID, for logging.
 * @param children - Second-leg child transactions.
 * @param messenger - Controller messenger.
 */
function failUnpublishedChildren(
  parentId: string,
  children: TransactionMeta[],
  messenger: TransactionPayControllerMessenger,
): void {
  for (const child of children) {
    if (
      child.status !== TransactionStatus.approved &&
      child.status !== TransactionStatus.signed
    ) {
      continue;
    }

    log('Failing unpublished second-leg child', {
      childId: child.id,
      parentId,
      status: child.status,
    });

    messenger.call(
      'TransactionController:failTransaction',
      child.id,
      new Error('Second leg not published before restart'),
    );
  }
}
