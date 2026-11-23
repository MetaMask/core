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
 * 1. A confirmed or submitted second-leg child on Monad → return its hash,
 * waiting for confirmation if needed.
 * 2. A second-leg child that was never published (`approved` / `signed`) is
 * failed, and a `failed` / `dropped` one is ignored, so the flow falls through
 * to step 3 instead of waiting on a child that can never confirm.
 * 3. Poll the fiat order, wait for the wallet to be unlocked, then submit the
 * vault deposit. CHOMP recovery prevents a second deposit if the funds were
 * already vaulted.
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

  const child = getSecondLegChild(transaction, messenger);

  if (child?.status === TransactionStatus.confirmed) {
    log('Found confirmed second-leg child', { id, childId: child.id });
    return { transactionHash: child.hash as Hex };
  }

  if (child?.status === TransactionStatus.submitted) {
    log('Waiting for submitted second-leg child', { id, childId: child.id });

    await waitForTransactionConfirmed(child.id, messenger);

    return {
      transactionHash: getTransaction(child.id, messenger)?.hash as
        | Hex
        | undefined,
    };
  }

  if (
    child?.status === TransactionStatus.approved ||
    child?.status === TransactionStatus.signed
  ) {
    log('Failing unpublished second-leg child', {
      id,
      childId: child.id,
      status: child.status,
    });

    messenger.call(
      'TransactionController:failTransaction',
      child.id,
      new Error('Second leg not published before restart'),
    );
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
 * Returns the most recent second-leg child tx on Monad from the parent's
 * `requiredTransactionIds`, or undefined if none exists.
 *
 * The most recent child is used because an earlier attempt may have left a
 * failed child before a later one was submitted.
 *
 * @param transaction - Parent transaction being resumed.
 * @param messenger - Controller messenger.
 * @returns The most recent second-leg child transaction, if present.
 */
function getSecondLegChild(
  transaction: TransactionMeta,
  messenger: TransactionPayControllerMessenger,
): TransactionMeta | undefined {
  const { requiredTransactionIds = [] } = transaction;
  const from = transaction.txParams.from?.toLowerCase();

  return [...requiredTransactionIds]
    .reverse()
    .map((childId) => getTransaction(childId, messenger))
    .find(
      (child) =>
        child?.chainId === CHAIN_ID_MONAD &&
        child.txParams.from?.toLowerCase() === from,
    );
}
