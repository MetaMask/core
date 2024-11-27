import { ControllerMessenger } from '@metamask/base-controller';

import DefaultExport, {
  type SmartTransactionsControllerActions,
  type SmartTransactionsControllerEvents,
} from '.';
import SmartTransactionsController, {
  type AllowedActions,
  type AllowedEvents,
} from './SmartTransactionsController';
import { ClientId } from './types';

describe('default export', () => {
  it('exports SmartTransactionsController', () => {
    jest.useFakeTimers();
    const controllerMessenger = new ControllerMessenger<
      SmartTransactionsControllerActions | AllowedActions,
      SmartTransactionsControllerEvents | AllowedEvents
    >();
    const messenger = controllerMessenger.getRestricted({
      name: 'SmartTransactionsController',
      allowedActions: ['NetworkController:getNetworkClientById'],
      allowedEvents: ['NetworkController:stateChange'],
    });
    const controller = new DefaultExport({
      messenger,
      getNonceLock: jest.fn(),
      confirmExternalTransaction: jest.fn(),
      getTransactions: jest.fn(),
      trackMetaMetricsEvent: jest.fn(),
      getMetaMetricsProps: jest.fn(async () => {
        return Promise.resolve({});
      }),
      getFeatureFlags: jest.fn(),
      updateTransaction: jest.fn(),
      clientId: ClientId.Extension,
    });
    expect(controller).toBeInstanceOf(SmartTransactionsController);
    jest.clearAllTimers();
  });
});
