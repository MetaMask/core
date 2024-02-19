import { ControllerMessenger } from '@metamask/base-controller';
import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import type { JsonRpcResponse } from '@metamask/utils';

import { SelectedNetworkControllerActionTypes } from '../src/SelectedNetworkController';
import type { SelectedNetworkControllerMessenger } from '../src/SelectedNetworkController';
import type { SelectedNetworkMiddlewareJsonRpcRequest } from '../src/SelectedNetworkMiddleware';
import { createSelectedNetworkMiddleware } from '../src/SelectedNetworkMiddleware';

const buildMessenger = (): SelectedNetworkControllerMessenger => {
  return new ControllerMessenger().getRestricted({
    name: 'SelectedNetworkController',
  });
};

const noop = jest.fn();

describe('createSelectedNetworkMiddleware', () => {
  it('throws if not provided an origin', async () => {
    const messenger = buildMessenger();
    const middleware = createSelectedNetworkMiddleware(messenger);
    const req: SelectedNetworkMiddlewareJsonRpcRequest = {
      id: '123',
      jsonrpc: '2.0',
      method: 'anything',
      networkClientId: 'anything',
    };

    await expect(
      () =>
        new Promise((resolve, reject) =>
          middleware(req, {} as JsonRpcResponse<typeof req>, resolve, reject),
        ),
    ).rejects.toThrow("Request object is lacking an 'origin'");
  });

  it('puts networkClientId on request', async () => {
    const messenger = buildMessenger();
    const middleware = createSelectedNetworkMiddleware(messenger);

    const req = {
      origin: 'example.com',
    } as SelectedNetworkMiddlewareJsonRpcRequest;

    const mockGetNetworkClientIdForDomain = jest
      .fn()
      .mockReturnValue('mockNetworkClientId');

    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );

    await new Promise((resolve) =>
      middleware(req, {} as JsonRpcResponse<typeof req>, resolve, noop),
    );

    expect(req.networkClientId).toBe('mockNetworkClientId');
  });

  it('puts metamask selected networkClientId on the request object if the requesting origin does not have one set', async () => {
    const messenger = buildMessenger();
    const middleware = createSelectedNetworkMiddleware(messenger);

    const req = {
      origin: 'example.com',
    } as SelectedNetworkMiddlewareJsonRpcRequest;

    const mockGetNetworkClientIdForDomain = jest
      .fn()
      .mockReturnValue(undefined);
    const mockGetNetworkClientIdForMetamask = jest
      .fn()
      .mockReturnValue('metamaskNetworkClientId');

    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );
    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForMetamask,
      mockGetNetworkClientIdForMetamask,
    );

    await new Promise((resolve) =>
      middleware(req, {} as JsonRpcResponse<typeof req>, resolve, noop),
    );

    expect(req.networkClientId).toBe('metamaskNetworkClientId');
  });

  it('implements the json-rpc-engine middleware interface appropriately', async () => {
    const engine = new JsonRpcEngine();
    const messenger = buildMessenger();
    engine.push((req: SelectedNetworkMiddlewareJsonRpcRequest, _, next) => {
      req.origin = 'foobar';
      next();
    });
    engine.push(createSelectedNetworkMiddleware(messenger));
    const mockNextMiddleware = jest
      .fn()
      .mockImplementation((req, res, _, end) => {
        res.result = req.networkClientId;
        end();
      });
    engine.push(mockNextMiddleware);
    const testNetworkClientId = 'testNetworkClientId';
    const mockGetNetworkClientIdForDomain = jest
      .fn()
      .mockReturnValue(testNetworkClientId);
    messenger.registerActionHandler(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      mockGetNetworkClientIdForDomain,
    );

    const result = await engine.handle({
      id: 1,
      jsonrpc: '2.0',
      method: 'hello',
    });
    expect(mockNextMiddleware).toHaveBeenCalledWith(
      expect.objectContaining({
        networkClientId: testNetworkClientId,
      }),
      expect.any(Object),
      expect.any(Function),
      expect.any(Function),
    );
    expect(result).toStrictEqual(
      expect.objectContaining({ result: testNetworkClientId }),
    );
  });
});
