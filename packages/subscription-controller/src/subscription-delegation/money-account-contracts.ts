import type { Hex } from '@metamask/utils';

/**
 * Temporary local contract for Money Account delegation readiness.
 *
 * Mirrors `MoneyAccountUpgradeControllerForceUpgradeAccountAction`
 * from `@metamask/money-account-upgrade-controller`. Replace with that import
 * once the owning package publishes the action.
 *
 * Always runs the Money Account upgrade steps (ignoring any recorded
 * upgrade) so the base and, when configured, premium vault delegations and
 * CHOMP intents exist before an action that depends on them. Resolves once
 * the sequence has run; throws if the controller is not bootstrapped or a
 * step fails. The Subscription API validates the resulting delegations
 * server-side.
 */
export type MoneyAccountUpgradeControllerForceUpgradeAccountAction = {
  type: 'MoneyAccountUpgradeController:forceUpgradeAccount';
  handler: (address: Hex) => Promise<void>;
};
