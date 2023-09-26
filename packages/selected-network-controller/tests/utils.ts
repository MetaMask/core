import { ControllerMessenger } from '@metamask/base-controller';
import type { NetworkControllerStateChangeEvent } from '@metamask/network-controller';

import type {
  SelectedNetworkControllerAction,
  SelectedNetworkControllerEvent,
} from '../src/SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from '../src/SelectedNetworkController';

/**
 * Build a controller messenger that includes all events used by the selected network
 * controller.
 *
 * @returns The controller messenger.
 */
export function buildMessenger() {
  return new ControllerMessenger<
    SelectedNetworkControllerAction,
    SelectedNetworkControllerEvent | NetworkControllerStateChangeEvent
  >();
}
/**
 * Build a restricted controller messenger for the selected network controller.
 *
 * @param messenger - A controller messenger.
 * @returns The network controller restricted messenger.
 */
export function buildSelectedNetworkControllerMessenger(
  messenger = buildMessenger(),
) {
  messenger.registerActionHandler(
    'NetworkController:getNetworkClientById',
    jest.fn().mockReturnValue({
      provider: jest.fn(),
      blockTracker: jest.fn(),
    }),
  );
  return messenger.getRestricted({
    name: 'SelectedNetworkController',
    allowedActions: [
      ...Object.values(SelectedNetworkControllerActionTypes),
      'NetworkController:getNetworkClientById',
    ],
    allowedEvents: ['NetworkController:stateChange'],
  });
}
