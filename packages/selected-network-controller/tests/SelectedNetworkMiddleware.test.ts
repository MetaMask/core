import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import {
  Messenger,
  MOCK_ANY_NAMESPACE,
  type MessengerActions,
  type MessengerEvents,
  type MockAnyNamespace,
} from '@metamask/messenger';
import type { JsonRpcResponse } from '@metamask/utils';

import { SelectedNetworkControllerActionTypes } from '../src/SelectedNetworkController';
import type { SelectedNetworkControllerMessenger } from '../src/SelectedNetworkController';
import type { SelectedNetworkMiddlewareJsonRpcRequest } from '../src/SelectedNetworkMiddleware';
import { createSelectedNetworkMiddleware } from '../src/SelectedNetworkMiddleware';

type AllSelectedNetworkControllerActions =
  MessengerActions<SelectedNetworkControllerMessenger>;

type AllSelectedNetworkControllerEvents =
  MessengerEvents<SelectedNetworkControllerMessenger>;

type RootMessenger = Messenger<
  MockAnyNamespace,
  AllSelectedNetworkControllerActions,
  AllSelectedNetworkControllerEvents
>;

const controllerName = 'SelectedNetworkController';

/**
 * Constructs the root messenger.
 *
 * @returns A root messenger.
 */
function getRootMessenger(): RootMessenger {
  return new Messenger({
    namespace: MOCK_ANY_NAMESPACE,
  });
}

/**
 * Constructs the selected network controller messenger.
 *
 * @param rootMessenger - A root messenger.
 * @returns A selected network controller messenger.
 */
function getSelectedNetworkControllerMessenger(
  rootMessenger: RootMessenger,
): SelectedNetworkControllerMessenger {
  return new Messenger<
    typeof controllerName,
    AllSelectedNetworkControllerActions,
    AllSelectedNetworkControllerEvents,
    RootMessenger
  >({
    namespace: controllerName,
    parent: rootMessenger,
  });
}

const noop = jest.fn();

describe('createSelectedNetworkMiddleware', () => {
  it('throws if not provided an origin', async () => {
    const rootMessenger = getRootMessenger();
    const middleware = createSelectedNetworkMiddleware(
      getSelectedNetworkControllerMessenger(rootMessenger),
    );
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
    const rootMessenger = getRootMessenger();
    const messenger = getSelectedNetworkControllerMessenger(rootMessenger);
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

  it('implements the json-rpc-engine middleware interface appropriately', async () => {
    const engine = new JsonRpcEngine();
    const rootMessenger = getRootMessenger();
    const messenger = getSelectedNetworkControllerMessenger(rootMessenger);
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
