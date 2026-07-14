/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountUpgradeController } from './MoneyAccountUpgradeController';

/**
 * Runs each step in the upgrade sequence in order. A step that reports
 * `'already-done'` is skipped without performing any action; a step that
 * reports `'completed'` has performed its action. An error thrown by any
 * step halts the sequence and is re-thrown wrapped in a
 * {@link MoneyAccountUpgradeStepError} that records which step failed (the
 * original error is preserved as `cause`).
 *
 * A run that completes is recorded in state (keyed by lowercased address,
 * fingerprinted against the active config); subsequent calls for a
 * recorded account return immediately without running any steps. If the
 * active config no longer matches the recorded fingerprint, the sequence
 * re-runs.
 *
 * @param address - The Money Account address to upgrade.
 */
export type MoneyAccountUpgradeControllerUpgradeAccountAction = {
  type: `MoneyAccountUpgradeController:upgradeAccount`;
  handler: MoneyAccountUpgradeController['upgradeAccount'];
};

/**
 * Runs the upgrade sequence via
 * {@link MoneyAccountUpgradeController.upgradeAccount}, retrying failed
 * attempts with capped exponential backoff (10s, 20s, 40s, then 60s
 * between attempts). Rethrows the last error without further attempts when
 * the failure is terminal (see `isTerminalMoneyAccountUpgradeError`), when
 * it is not a step failure at all, or when `maxAttempts` is exhausted.
 *
 * @param address - The Money Account address to upgrade.
 * @param options - Retry options.
 * @param options.signal - Aborts waiting between attempts and prevents
 * further attempts. An aborted run rejects with an error stating the retry
 * was aborted.
 * @param options.maxAttempts - Maximum number of attempts, including the
 * first. Defaults to 5.
 */
export type MoneyAccountUpgradeControllerUpgradeAccountWithRetryAction = {
  type: `MoneyAccountUpgradeController:upgradeAccountWithRetry`;
  handler: MoneyAccountUpgradeController['upgradeAccountWithRetry'];
};

/**
 * Union of all MoneyAccountUpgradeController action types.
 */
export type MoneyAccountUpgradeControllerMethodActions =
  | MoneyAccountUpgradeControllerUpgradeAccountAction
  | MoneyAccountUpgradeControllerUpgradeAccountWithRetryAction;
