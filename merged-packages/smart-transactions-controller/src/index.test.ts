import { Messenger } from '@metamask/base-controller';
import {
  type NetworkControllerGetNetworkClientByIdAction,
  type NetworkControllerGetStateAction,
  type NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';

import DefaultExport, {
  type SmartTransactionsControllerActions,
  type SmartTransactionsControllerEvents,
} from '.';
import SmartTransactionsController from './SmartTransactionsController';
import { ClientId } from './types';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    jest.useFakeTimers();
    const controllerMessenger = new Messenger<
      | SmartTransactionsControllerActions
      | NetworkControllerGetNetworkClientByIdAction
      | NetworkControllerGetStateAction,
      SmartTransactionsControllerEvents | NetworkControllerStateChangeEvent
    >();
    const messenger = controllerMessenger.getRestricted({
      name: 'SmartTransactionsController',
      allowedActions: ['NetworkController:getNetworkClientById'],
      allowedEvents: ['NetworkController:stateChange'],
    });
    const controller = new DefaultExport({
      messenger,
      trackMetaMetricsEvent: jest.fn(),
      getMetaMetricsProps: jest.fn(async () => {
        return Promise.resolve({});
      }),
      getFeatureFlags: jest.fn(),
      clientId: ClientId.Extension,
    });
    expect(controller).toBeInstanceOf(SmartTransactionsController);
    jest.clearAllTimers();
  });
});
