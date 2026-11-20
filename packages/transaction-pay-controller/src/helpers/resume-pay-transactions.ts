import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';

import { TransactionPayStrategy } from '../constants.js';
import { projectLogger } from '../logger.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { waitForDependencies } from '../utils/dependencies.js';
import { getResumeTimeoutMs, isResumeEnabled } from '../utils/feature-flags.js';
import { waitForKeyringUnlock } from '../utils/keyring.js';
import { getStrategyByName } from '../utils/strategy.js';
import { getPayTransactionType } from '../utils/transaction-type.js';
import { updateTransaction } from '../utils/transaction.js';

const log = createModuleLogger(projectLogger, 'resume-pay-transactions');

/**
 * Resumes any incomplete pay transactions found in TC state.
 *
 * Steps:
 * 0. Sync pre-check: if no resumable tx exists, return immediately.
 * 1. Await wallet unlock.
 * 2. Wait for every controller this controller depends on to be
 *    constructed, see {@link waitForDependencies}.
 * 3. For each candidate captured at Step 0, sequentially:
 *    a. Re-read the current tx from TC state by id and skip it if it is
 *       missing or no longer resumable (e.g. it moved to a final state
 *       while gates were pending).
 *    b. If dependencies never became available → failTransaction.
 *    c. Set metamaskPay.resumeAttemptedAt before calling resume, unless an
 *       earlier restart already set it.
 *    d. Call strategy.resume(). On success → finalizeResumedTransaction.
 *       On failure → failTransaction.
 *
 * @param messenger - The Pay controller messenger.
 */
export async function resumePayTransactions(
  messenger: TransactionPayControllerMessenger,
): Promise<void> {
  const { transactions } = messenger.call('TransactionController:getState');
  const candidates = transactions.filter((tx) =>
    isPayTransactionResumable(messenger, tx),
  );

  if (candidates.length === 0) {
    log('No resumable transactions found — skipping');
    return;
  }

  log('Resumable transactions found', { count: candidates.length });

  await waitForKeyringUnlock(messenger);

  const dependenciesReady = await waitForDependencies(messenger);

  for (const transaction of candidates) {
    const { id } = transaction;

    try {
      const { transactions: currentTransactions } = messenger.call(
        'TransactionController:getState',
      );
      const currentTransaction = currentTransactions.find((tx) => tx.id === id);

      if (!isPayTransactionResumable(messenger, currentTransaction)) {
        log('Skipping transaction no longer eligible for resume', {
          id,
          status: currentTransaction?.status,
        });
        continue;
      }

      if (!dependenciesReady) {
        throw new Error('Dependencies not registered');
      }

      // Guaranteed by `isPayTransactionResumable` when building candidates.
      const strategyName = transaction.metamaskPay
        ?.strategy as TransactionPayStrategy;

      if (!currentTransaction?.metamaskPay?.resumeAttemptedAt) {
        updateTransaction(
          { transactionId: id, messenger, note: 'Set resumeAttemptedAt' },
          (tx) => {
            tx.metamaskPay ??= {};
            tx.metamaskPay.resumeAttemptedAt = Date.now();
          },
        );
      }

      const strategy = getStrategyByName(strategyName);

      if (!strategy.resume) {
        throw new Error(`Strategy ${strategyName} does not support resume`);
      }

      log('Resuming transaction', { id, strategy: strategyName });

      const { transactionHash } = await strategy.resume({
        messenger,
        transaction,
      });

      if (!transactionHash) {
        throw new Error('Resume did not return a transaction hash');
      }

      messenger.call(
        'TransactionController:finalizeResumedTransaction',
        id,
        transactionHash,
      );

      log('Transaction resumed successfully', { id, transactionHash });
    } catch (error) {
      log('Failed to resume transaction', { id, error });

      try {
        messenger.call(
          'TransactionController:failTransaction',
          id,
          error instanceof Error ? error : new Error(String(error)),
        );
      } catch (failError) {
        log('Failed to fail transaction after resume error', { id, failError });
      }
    }
  }
}

/**
 * Returns true if the given transaction is eligible for resume by the
 * transaction-pay-controller.
 *
 * A transaction can be resumed on every restart until the resume timeout
 * (`confirmations_pay_extended.resume.timeouts`, 10 minutes by default) has
 * passed since its first resume attempt.
 *
 * All checks are synchronous and only read `RemoteFeatureFlagController:getState`
 * from the messenger — this is intentional so the function can be called at
 * TransactionController boot time (before Pay is constructed) with a minimal
 * init messenger that only exposes that action.
 *
 * @param messenger - Controller messenger. Only
 * `RemoteFeatureFlagController:getState` is called.
 * @param transaction - The transaction to check.
 * @returns True if the transaction should be resumed.
 */
export function isPayTransactionResumable(
  messenger: TransactionPayControllerMessenger,
  transaction: TransactionMeta | undefined,
): boolean {
  try {
    if (!transaction) {
      return false;
    }

    const { status, metamaskPay } = transaction;

    if (
      status !== TransactionStatus.approved &&
      status !== TransactionStatus.signed
    ) {
      return false;
    }

    const strategy = metamaskPay?.strategy as
      | TransactionPayStrategy
      | undefined;

    if (!strategy || strategy === TransactionPayStrategy.None) {
      return false;
    }

    const { resumeAttemptedAt } = metamaskPay ?? {};

    if (
      resumeAttemptedAt &&
      Date.now() - resumeAttemptedAt >= getResumeTimeoutMs(messenger, strategy)
    ) {
      return false;
    }

    const payType = getPayTransactionType(transaction);

    if (!payType || !isResumeEnabled(messenger, strategy, payType)) {
      return false;
    }

    return getStrategyByName(strategy).canResume?.(transaction) === true;
  } catch {
    return false;
  }
}
