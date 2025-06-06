import { Messenger } from '@metamask/base-controller';
import type { NetworkControllerStateChangeEvent } from '@metamask/network-controller';

import { NetworkVisibilityController } from './NetworkVisibilityController';
import type { NetworkVisibilityControllerMessengerActions } from './NetworkVisibilityController';

describe('NetworkVisibilityController', () => {
  let messenger: Messenger<
    NetworkVisibilityControllerMessengerActions,
    NetworkControllerStateChangeEvent
  >;
  let controller: NetworkVisibilityController;

  beforeEach(() => {
    messenger = new Messenger();
    controller = new NetworkVisibilityController({
      messenger: messenger.getRestricted({
        name: 'NetworkVisibilityController',
        allowedActions: [],
        allowedEvents: ['NetworkController:stateChange'],
      }),
    });
  });

  it('should instantiate with default state', () => {
    const { state } = controller;
    expect(state).toStrictEqual({
      orderedNetworkList: [],
      enabledNetworkMap: {},
    });
  });
});
