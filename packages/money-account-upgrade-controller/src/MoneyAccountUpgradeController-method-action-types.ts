/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountUpgradeController } from './MoneyAccountUpgradeController.js';

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
 * A call that arrives while the bootstrap chain is still in flight —
 * including runs scheduled while waiting — waits for it to settle rather
 * than failing, so the upgrade always runs against the latest armed
 * config. Scheduling a bootstrap for a changed vault config disarms the
 * previous one, so it throws when no bootstrap has armed a config (feature
 * disabled or the last bootstrap failed) or when the wallet is locked.
 *
 * The armed config is re-checked before every step: if a sync disarms or
 * supersedes it while the sequence is running, the sequence aborts before
 * the next step signs anything, and nothing is recorded.
 *
 * @param address - The Money Account address to upgrade.
 */
export type MoneyAccountUpgradeControllerUpgradeAccountAction = {
  type: `MoneyAccountUpgradeController:upgradeAccount`;
  handler: MoneyAccountUpgradeController['upgradeAccount'];
};

/**
 * Like {@link upgradeAccount}, but always runs the upgrade steps, ignoring
 * the recorded upgrade. Use this immediately before an action that depends
 * on the base and (when configured) premium vault delegations and CHOMP
 * intents actually existing right now, rather than trusting a fingerprint
 * recorded on a previous run.
 *
 * @param address - The Money Account address.
 * @throws If the controller is not bootstrapped, if the armed config is
 * disarmed or superseded while the sequence is running, or if a step fails
 * (wrapped in a {@link MoneyAccountUpgradeStepError}).
 */
export type MoneyAccountUpgradeControllerEnsureDelegationsReadinessAction = {
  type: `MoneyAccountUpgradeController:ensureDelegationsReadiness`;
  handler: MoneyAccountUpgradeController['ensureDelegationsReadiness'];
};

/**
 * Union of all MoneyAccountUpgradeController action types.
 */
export type MoneyAccountUpgradeControllerMethodActions =
  | MoneyAccountUpgradeControllerUpgradeAccountAction
  | MoneyAccountUpgradeControllerEnsureDelegationsReadinessAction;
