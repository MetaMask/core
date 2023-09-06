import { ControllerMessenger } from '@metamask/base-controller';
import type { NetworkControllerGetStateAction } from '@metamask/network-controller';

import type {
  SelectedNetworkControllerGetNetworkClientIdForDomainAction,
  SelectedNetworkControllerSetNetworkClientIdForDomainAction,
} from '../src/SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from '../src/SelectedNetworkController';
import { createSelectedNetworkMiddleware } from '../src/SelectedNetworkMiddleware';

const buildMessenger = () => {
  return new ControllerMessenger<
    | SelectedNetworkControllerGetNetworkClientIdForDomainAction
    | SelectedNetworkControllerSetNetworkClientIdForDomainAction
    | NetworkControllerGetStateAction,
    never
  >();
};

const noop = jest.fn();

describe('createSelectedNetworkMiddleware', () => {
  it('puts networkClientId on request', async () => {
    const messenger = buildMessenger();
    const middleware = createSelectedNetworkMiddleware(messenger);

    const req = {
      origin: 'example.com',
    } as any;

    const mockGetNetworkClientIdForDomain = jest
      .fn()
      .mockReturnValue('mockNetworkClientId');

    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );

    await new Promise((resolve) => middleware(req, {} as any, resolve, noop));

    expect(req.networkClientId).toBe('mockNetworkClientId');
  });

  it('sets the networkClientId for the domain to the current network from networkController if one is not set', async () => {
    const messenger = buildMessenger();
    const middleware = createSelectedNetworkMiddleware(messenger);

    const req = {
      origin: 'example.com',
    } as any;

    const mockGetNetworkClientIdForDomain = jest
      .fn()
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce('defaultNetworkClientId');
    const mockSetNetworkClientIdForDomain = jest.fn();
    const mockNetworkControllerGetState = jest.fn().mockReturnValue({
      selectedNetworkClientId: 'defaultNetworkClientId',
    });
    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );
    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
      mockSetNetworkClientIdForDomain,
    );
    messenger.registerActionHandler(
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
