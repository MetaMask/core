import {
  JsonRpcEngine,
  createAsyncMiddleware,
} from '@metamask/json-rpc-engine';
import { rpcErrors, serializeError } from '@metamask/rpc-errors';

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
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      implementation(req as any, res as any, next, end, {
        requestPermissionsForOrigin: mockRequestPermissionsForOrigin,
      }),
    );

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'arbitraryName',
      params: [{}],
    });

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
    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const end: any = () => undefined; // this won't be called

    // Pass the middleware function to createAsyncMiddleware so the error
    // is catched.
    engine.push(
      createAsyncMiddleware(
        (req, res, next) =>
          // TODO: Replace `any` with type
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          implementation(req as any, res as any, next, end, {
            requestPermissionsForOrigin: mockRequestPermissionsForOrigin,
            // TODO: Replace `any` with type
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          }) as any,
      ),
    );

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'arbitraryName',
      params: [{}],
    });

    expect(response.result).toBeUndefined();
    delete response.error.stack;
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
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      implementation(req as any, res as any, next, end, {
        requestPermissionsForOrigin: mockRequestPermissionsForOrigin,
      }),
    );

    for (const invalidParams of ['foo', ['bar']]) {
      const req = {
        jsonrpc: '2.0',
        id: 1,
        method: 'arbitraryName',
        params: invalidParams,
      };

      const expectedError = rpcErrors
        .invalidParams({
          data: { request: { ...req } },
        })
        .serialize();
      delete expectedError.stack;

      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await engine.handle(req as any);
      delete response.error.stack;
      expect(response.error).toStrictEqual(expectedError);
      expect(mockRequestPermissionsForOrigin).not.toHaveBeenCalled();
    }
  });
});
