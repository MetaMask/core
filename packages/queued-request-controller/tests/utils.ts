import { ControllerMessenger } from '@metamask/base-controller';

import type {
  AllowedActions,
  QueuedRequestControllerActions,
  QueuedRequestControllerEvents,
} from '../src/QueuedRequestController';
import { controllerName } from '../src/QueuedRequestController';

/**
 * Build a controller messenger that includes all events used by the selected network
 * controller.
 *
 * @returns The controller messenger.
 */
export function buildMessenger() {
  return new ControllerMessenger<
    QueuedRequestControllerActions | AllowedActions,
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
    name: controllerName,
    allowedActions: [
      `NetworkController:getState`,
      `NetworkController:setActiveNetwork`,
      `NetworkController:setProviderType`,
      `NetworkController:getNetworkClientById`,
      `SelectedNetworkController:setNetworkClientIdForDomain`,
      `ApprovalController:addRequest`,
    ],
    allowedEvents: [],
  });
}
