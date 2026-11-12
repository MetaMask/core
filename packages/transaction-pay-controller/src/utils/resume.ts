import { TransactionStatus } from '@metamask/transaction-controller';
import type { TransactionMeta } from '@metamask/transaction-controller';

import { TransactionPayStrategy } from '../constants.js';
import type { TransactionPayControllerMessenger } from '../types.js';
import { getResumeEnabledTypes } from './feature-flags.js';
import { getPayTransactionType } from './pay-transaction-type.js';
import { getStrategyByName } from './strategy.js';

/**
 * Returns true if the given transaction is eligible for resume by the
 * transaction-pay-controller.
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

    const enabledTypes = getResumeEnabledTypes(
      messenger,
      strategy as TransactionPayStrategy,
    );

    if (!enabledTypes.includes(payType)) {
      return false;
    }

    const strategyImpl = getStrategyByName(strategy as TransactionPayStrategy);
    return strategyImpl.canResume?.(transaction) === true;
  } catch {
    return false;
  }
}
