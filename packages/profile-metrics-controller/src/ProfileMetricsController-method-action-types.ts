/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ProfileMetricsController } from './ProfileMetricsController.js';

/**
 * Skip the initial delay period by setting the end timestamp to the current time.
 * Metrics will be sent on the next poll.
 */
export type ProfileMetricsControllerSkipInitialDelayAction = {
  type: `ProfileMetricsController:skipInitialDelay`;
  handler: ProfileMetricsController['skipInitialDelay'];
};

/**
 * Reset the controller to its default state. Clients call this on wallet
 * reset so the next wallet does not inherit the previous wallet's sync queue
 * and reported accounts.
 *
 * Waits for an in-flight poll to finish first, so that it cannot write back
 * to the cleared state.
 */
export type ProfileMetricsControllerClearStateAction = {
  type: `ProfileMetricsController:clearState`;
  handler: ProfileMetricsController['clearState'];
};

/**
 * Union of all ProfileMetricsController action types.
 */
export type ProfileMetricsControllerMethodActions =
  | ProfileMetricsControllerSkipInitialDelayAction
  | ProfileMetricsControllerClearStateAction;
