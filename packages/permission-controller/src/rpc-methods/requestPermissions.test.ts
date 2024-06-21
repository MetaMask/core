import {
  JsonRpcEngine,
  createAsyncMiddleware,
} from '@metamask/json-rpc-engine';
import { rpcErrors, serializeError } from '@metamask/rpc-errors';
import {
  assertIsJsonRpcFailure,
  assertIsJsonRpcSuccess,
  hasProperty,
} from '@metamask/utils';
import type {
  PermissionConstraint,
  RequestedPermissions,
} from 'src/Permission';

import { requestPermissionsHandler } from './requestPermissions';

describe('requestPermissions RPC method', () => {
  it('returns the values of the object returned by requestPermissionsForOrigin', async () => {
    const { implementation } = requestPermissionsHandler;
    const mockRequestPermissionsForOrigin = jest
      .fn()
      .mockImplementationOnce(() => {
        // Resolve this promise after a timeout to ensure that the function
        // is awaited properly.
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve([{ a: 'a', b: 'b', c: 'c' }]);
          }, 10);
        });
      });

    const engine = new JsonRpcEngine();
    engine.push<[RequestedPermissions], PermissionConstraint[]>(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      (req, res, next, end) =>
        implementation(req, res, next, end, {
          requestPermissionsForOrigin: mockRequestPermissionsForOrigin,
        }),
    );

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'arbitraryName',
      params: [{}],
    });
    assertIsJsonRpcSuccess(response);

    expect(response.result).toStrictEqual(['a', 'b', 'c']);
    expect(mockRequestPermissionsForOrigin).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionsForOrigin).toHaveBeenCalledWith({});
  });

  it('returns an error if requestPermissionsForOrigin rejects', async () => {
    const { implementation } = requestPermissionsHandler;
    const mockRequestPermissionsForOrigin = jest
      .fn()
      .mockImplementationOnce(async () => {
        throw new Error('foo');
      });

    const engine = new JsonRpcEngine();
    const end = () => undefined; // this won't be called

    // Pass the middleware function to createAsyncMiddleware so the error
    // is catched.
    engine.push<[RequestedPermissions], PermissionConstraint[]>(
      createAsyncMiddleware(async (req, res, next) =>
        // TODO: Either fix this lint violation or explain why it's necessary to ignore.
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        implementation(req, res, next, end, {
          requestPermissionsForOrigin: mockRequestPermissionsForOrigin,
        }),
      ),
    );

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'arbitraryName',
      params: [{}],
    });
    assertIsJsonRpcFailure(response);

    expect(hasProperty(response, 'result')).toBe(false);
    delete response.error.stack;
    // @ts-expect-error We do expect this property to exist.
    delete response.error.data.cause.stack;
    const expectedError = new Error('foo');
    delete expectedError.stack;
    expect(response.error).toStrictEqual(
      serializeError(expectedError, { shouldIncludeStack: false }),
    );
    expect(mockRequestPermissionsForOrigin).toHaveBeenCalledTimes(1);
    expect(mockRequestPermissionsForOrigin).toHaveBeenCalledWith({});
  });

  it('returns an error if the request params are invalid', async () => {
    const { implementation } = requestPermissionsHandler;
    const mockRequestPermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push<[RequestedPermissions], PermissionConstraint[]>(
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (req, res, next, end) => {
        await implementation(req, res, next, end, {
          requestPermissionsForOrigin: mockRequestPermissionsForOrigin,
        });
      },
    );

    for (const invalidParams of ['foo', ['bar']]) {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'arbitraryName',
        params: invalidParams,
      };

      const expectedError = rpcErrors
        .invalidParams({
          data: { request: { ...request } },
        })
        .serialize();
      delete expectedError.stack;

      // @ts-expect-error Intentional destructive testing
      // TODO: Either fix this lint violation or explain why it's necessary to ignore.
      // eslint-disable-next-line @typescript-eslint/await-thenable
      const response = await engine.handle(request);
      assertIsJsonRpcFailure(response);
      delete response.error.stack;
      expect(response.error).toStrictEqual(expectedError);
      expect(mockRequestPermissionsForOrigin).not.toHaveBeenCalled();
    }
  });
});
