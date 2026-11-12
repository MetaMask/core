import { TransactionStatus } from '@metamask/transaction-controller';
import { createModuleLogger } from '@metamask/utils';

import type { TransactionPayStrategy } from '../constants.js';
import { projectLogger } from '../logger.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { waitForKeyringUnlock } from '../utils/keyring.js';
import { isPayTransactionResumable } from '../utils/resume.js';
import { getStrategyByName } from '../utils/strategy.js';
import { updateTransaction } from '../utils/transaction.js';

const log = createModuleLogger(projectLogger, 'resume-pay-transactions');

/**
 * Resumes any incomplete pay transactions found in TC state.
 *
 * Steps:
 * 0. Sync pre-check: if no resumable tx exists, return immediately.
 * 1. Await wallet unlock AND waitForClientReady (if provided).
 * 2. For each candidate captured at Step 0, sequentially:
 *    a. Re-read the current tx from TC state by id and skip it if it is
 *       missing or no longer in `approved`/`signed` (i.e. it moved to a
 *       final state while gates were pending).
 *    b. Set metamaskPay.resumeAttemptedAt before calling resume.
 *    c. Call strategy.resume(). On success → finalizeResumedTransaction.
 *       On failure → failTransaction.
 *
 * @param messenger - The Pay controller messenger.
 * @param waitForClientReady - Optional promise resolved when all client
 *   dependencies (Ramps, etc.) are registered. Defaults to resolved.
 */
export async function resumePayTransactions(
  messenger: TransactionPayControllerMessenger,
  waitForClientReady?: () => Promise<void>,
): Promise<void> {
  const remoteFeatureFlags = getRemoteFeatureFlags(messenger);

  const { transactions } = messenger.call('TransactionController:getState');
  const candidates = transactions.filter((tx) =>
    isPayTransactionResumable(tx, remoteFeatureFlags),
  );

  if (candidates.length === 0) {
    log('No resumable transactions found — skipping');
    return;
  }

  log('Resumable transactions found', { count: candidates.length });

  await Promise.all([
    waitForKeyringUnlock(messenger),
    waitForClientReady?.() ?? Promise.resolve(),
  ]);

  for (const transaction of candidates) {
    const { id } = transaction;

    try {
      const { transactions: currentTransactions } = messenger.call(
        'TransactionController:getState',
      );
      const currentTransaction = currentTransactions.find((tx) => tx.id === id);

      if (
        !currentTransaction ||
        (currentTransaction.status !== TransactionStatus.approved &&
          currentTransaction.status !== TransactionStatus.signed)
      ) {
        log('Skipping transaction no longer eligible for resume', {
          id,
          status: currentTransaction?.status,
        });
        continue;
      }

      const strategyName = transaction.metamaskPay?.strategy;

      if (!strategyName) {
        throw new Error('Missing Pay strategy');
      }

      updateTransaction(
        { transactionId: id, messenger, note: 'Set resumeAttemptedAt' },
        (tx) => {
          tx.metamaskPay ??= {};
          tx.metamaskPay.resumeAttemptedAt = Date.now();
        },
      );

      const strategy = getStrategyByName(
        strategyName as TransactionPayStrategy,
      );

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

function getRemoteFeatureFlags(
  messenger: TransactionPayControllerMessenger,
): Record<string, unknown> | undefined {
  try {
    return messenger.call('RemoteFeatureFlagController:getState')
      .remoteFeatureFlags;
  } catch {
    return undefined;
  }
}
