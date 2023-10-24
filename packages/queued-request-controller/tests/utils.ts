import { ControllerMessenger } from '@metamask/base-controller';

import type {
  QueuedRequestControllerActions,
  QueuedRequestControllerEvents,
} from '../src/QueuedRequestController';
import {
  QueuedRequestControllerActionTypes,
  QueuedRequestControllerEventTypes,
} from '../src/QueuedRequestController';

/**
 * Build a controller messenger that includes all events used by the selected network
 * controller.
 *
 * @returns The controller messenger.
 */
export function buildMessenger() {
  return new ControllerMessenger<
    QueuedRequestControllerActions,
    QueuedRequestControllerEvents
  >();
}
/**
 * Build a restricted controller messenger for the selected network controller.
 *
 * @param messenger - A controller messenger.
 * @returns The network controller restricted messenger.
 */
export function buildQueuedRequestControllerMessenger(
  messenger = buildMessenger(),
) {
  return messenger.getRestricted({
    name: 'QueuedRequestController',
    allowedActions: [...Object.values(QueuedRequestControllerActionTypes)],
    allowedEvents: [...Object.values(QueuedRequestControllerEventTypes)],
  });
}
