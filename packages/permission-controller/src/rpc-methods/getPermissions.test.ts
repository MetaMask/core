import { JsonRpcEngine } from '@metamask/json-rpc-engine';

import { getPermissionsHandler } from './getPermissions';

describe('getPermissions RPC method', () => {
  it('returns the values of the object returned by getPermissionsForOrigin', async () => {
    const { implementation } = getPermissionsHandler;
    const mockGetPermissionsForOrigin = jest.fn().mockImplementationOnce(() => {
      return { a: 'a', b: 'b', c: 'c' };
    });

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // @ts-expect-error Abusing types for testing purposes
      implementation(req, res, next, end, {
        getPermissionsForOrigin: mockGetPermissionsForOrigin,
      }),
    );

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'arbitraryName',
    });
    // @ts-expect-error Abusing types for testing purposes
    expect(response.result).toStrictEqual(['a', 'b', 'c']);
    expect(mockGetPermissionsForOrigin).toHaveBeenCalledTimes(1);
  });

  it('returns an empty array if getPermissionsForOrigin returns a falsy value', async () => {
    const { implementation } = getPermissionsHandler;
    const mockGetPermissionsForOrigin = jest
      .fn()
      .mockImplementationOnce(() => null);

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // @ts-expect-error Abusing types for testing purposes
      implementation(req, res, next, end, {
        getPermissionsForOrigin: mockGetPermissionsForOrigin,
      }),
    );

    const response = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'arbitraryName',
    });
    // @ts-expect-error Abusing types for testing purposes
    expect(response.result).toStrictEqual([]);
    expect(mockGetPermissionsForOrigin).toHaveBeenCalledTimes(1);
  });
});
