import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { TransactionPayStrategy } from '../constants.js';
import { getResumeEnabledTypes } from './feature-flags.js';
import { getPayTransactionType } from './pay-transaction-type.js';
import { getStrategyByName } from './strategy.js';

/**
 * Returns true if the given transaction is eligible for resume by the
 * transaction-pay-controller.
 *
 * All checks are synchronous and read only from the provided arguments —
 * this is intentional so the function can be called at TransactionController
 * boot time (before Pay is constructed).
 *
 * @param transaction - The transaction to check.
 * @param remoteFeatureFlags - The current remote feature flags.
 * @returns True if the transaction should be resumed.
 */
export function isPayTransactionResumable(
  transaction: TransactionMeta | undefined,
  remoteFeatureFlags: Record<string, unknown> | undefined,
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

    const strategy = metamaskPay?.strategy;

    if (!strategy || strategy === TransactionPayStrategy.None) {
      return false;
    }

    if (metamaskPay?.resumeAttemptedAt) {
      return false;
    }

    const payType = getPayTransactionType(transaction);

    if (!payType) {
      return false;
    }

    const enabledTypes = getResumeEnabledTypes(remoteFeatureFlags, strategy);

    if (!enabledTypes.includes(payType)) {
      return false;
    }

    const strategyImpl = getStrategyByName(strategy as TransactionPayStrategy);
    return strategyImpl.canResume?.(transaction) === true;
  } catch {
    return false;
  }
}
