/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { MoneyAccountLifecycleController } from './money-account-lifecycle-controller.js';

/**
 * Fetches derived identities from CHOMP whenever the feature is enabled and
 * the wallet is unlocked with an HD keyring. Identities are cleared on lock
 * and refetched on unlock, when the remote feature flag values change, or on
 * the next trigger after a failed fetch.
 *
 * After each fetch, and whenever the primary Money Account changes, records
 * whether that account is unregistered, a valid SFA, or a valid MFA.
 * Publishes `MoneyAccountLifecycleController:mfaDetected` when it becomes a
 * valid MFA.
 */
export type MoneyAccountLifecycleControllerInitAction = {
  type: `MoneyAccountLifecycleController:init`;
  handler: MoneyAccountLifecycleController['init'];
};

/**
 * Union of all MoneyAccountLifecycleController action types.
 */
export type MoneyAccountLifecycleControllerMethodActions =
  MoneyAccountLifecycleControllerInitAction;
