import { ControllerMessenger } from '@metamask/base-controller';
import type {
  NetworkControllerEvents,
  NetworkControllerActions,
} from '@metamask/network-controller';

import { buildSelectedNetworkControllerMessenger } from './utils';
import { SelectedNetworkControllerActionTypes } from '../src/SelectedNetworkController';
import createSelectedNetworkMiddleware from '../src/SelectedNetworkMiddleware';

const buildMessenger = () => {
  return new ControllerMessenger<
    NetworkControllerActions,
    NetworkControllerEvents
  >();
};

const buildNetworkControllerMessenger = (messenger = buildMessenger()) => {
  return messenger.getRestricted({
    name: 'NetworkController',
    allowedActions: ['NetworkController:getState'],
    allowedEvents: ['NetworkController:stateChange'],
  });
};

const noop = jest.fn();

describe('createSelectedNetworkMiddleware', () => {
  it('puts networkClientId on request', async () => {
    const selectedNetworkControllerMessenger =
      buildSelectedNetworkControllerMessenger();
    const networkControllerMessenger = buildNetworkControllerMessenger();
    const middleware = createSelectedNetworkMiddleware(
      selectedNetworkControllerMessenger,
      networkControllerMessenger,
    );

    const req = {
      origin: 'example.com',
    } as any;

    const mockGetNetworkClientIdForDomain = jest
      .fn()
      .mockReturnValue('mockNetworkClientId');

    selectedNetworkControllerMessenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );

    await new Promise((resolve) => middleware(req, {} as any, resolve, noop));

    expect(req.networkClientId).toBe('mockNetworkClientId');
  });

  it('sets the networkClientId for the domain to the current network from networkController if one is not set', async () => {
    const selectedNetworkControllerMessenger =
      buildSelectedNetworkControllerMessenger();
    const networkControllerMessenger = buildNetworkControllerMessenger();
    const middleware = createSelectedNetworkMiddleware(
      selectedNetworkControllerMessenger,
      networkControllerMessenger,
    );

    const req = {
      origin: 'example.com',
    } as any;

    const mockGetNetworkClientIdForDomain = jest.fn();
    // 1st check its not set
    mockGetNetworkClientIdForDomain.mockReturnValueOnce(undefined);
    // 2nd check is after calling set
    mockGetNetworkClientIdForDomain.mockReturnValueOnce(
      'defaultNetworkClientId',
    );
    const mockSetNetworkClientIdForDomain = jest.fn();
    const mockNetworkControllerGetState = jest.fn().mockReturnValue({
      selectedNetworkClientId: 'defaultNetworkClientId',
    });
    selectedNetworkControllerMessenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );
    selectedNetworkControllerMessenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
      mockSetNetworkClientIdForDomain,
    );
    networkControllerMessenger.registerActionHandler(
      'NetworkController:getState',
      mockNetworkControllerGetState,
    );

    await new Promise((resolve) => middleware(req, {} as any, resolve, noop));

    expect(mockGetNetworkClientIdForDomain).toHaveBeenCalledWith('example.com');
    expect(mockNetworkControllerGetState).toHaveBeenCalled();
    expect(mockSetNetworkClientIdForDomain).toHaveBeenCalledWith(
      'example.com',
      'defaultNetworkClientId',
    );
    expect(req.networkClientId).toBe('defaultNetworkClientId');
  });
});
