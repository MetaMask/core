/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { LoggingController } from './LoggingController';

/**
 * Add log to the state.
 *
 * @param log - Log to add to the controller
 */
export type LoggingControllerAddAction = {
  type: `LoggingController:add`;
  handler: LoggingController['add'];
};

/**
 * Removes all log entries.
 */
export type LoggingControllerClearAction = {
  type: `LoggingController:clear`;
  handler: LoggingController['clear'];
};

/**
 * Union of all LoggingController action types.
 */
export type LoggingControllerMethodActions =
  | LoggingControllerAddAction
  | LoggingControllerClearAction;
