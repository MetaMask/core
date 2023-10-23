import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';

import { revokePermissionsHandler } from './revokePermissions';

describe('revokePermissions RPC method', () => {
  it('returns the values of the object returned by requestPermissionsForOrigin', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      implementation(req as any, res as any, next, end, {
        revokePermissionsForOrigin: mockRevokePermissionsForOrigin,
      }),
    );

    const response: any = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_revokePermissions',
      params: { snap_dialog: { caveats: [{ type: 'foo', value: 'bar' }] } },
    });

    expect(response.result).toBeNull();
    expect(mockRevokePermissionsForOrigin).toHaveBeenCalledTimes(1);
    expect(mockRevokePermissionsForOrigin).toHaveBeenCalledWith([
      'snap_dialog',
    ]);
  });

  it('returns an error if the request params is not a plain object', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      implementation(req as any, res as any, next, end, {
        revokePermissionsForOrigin: mockRevokePermissionsForOrigin,
      }),
    );

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_revokePermissions',
      params: [],
    };

    const expectedError = rpcErrors
      .invalidParams({
        data: { request: { ...req } },
      })
      .serialize();
    delete expectedError.stack;

    const response: any = await engine.handle(req as any);
    delete response.error.stack;
    expect(response.error).toStrictEqual(expectedError);
    expect(mockRevokePermissionsForOrigin).not.toHaveBeenCalled();
  });

  it('returns an error if the request params is an empty object', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      implementation(req as any, res as any, next, end, {
        revokePermissionsForOrigin: mockRevokePermissionsForOrigin,
      }),
    );

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_revokePermissions',
      params: {},
    };

    const expectedError = rpcErrors
      .invalidParams({
        data: { request: { ...req } },
      })
      .serialize();
    delete expectedError.stack;

    const response: any = await engine.handle(req as any);
    delete response.error.stack;
    expect(response.error).toStrictEqual(expectedError);
    expect(mockRevokePermissionsForOrigin).not.toHaveBeenCalled();
  });
});
