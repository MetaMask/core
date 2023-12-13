import { JsonRpcEngine } from '@metamask/json-rpc-engine';
import { rpcErrors } from '@metamask/rpc-errors';

import { revokePermissionsHandler } from './revokePermissions';

describe('revokePermissionsHandler', () => {
  it('has the expected shape', () => {
    expect(revokePermissionsHandler).toStrictEqual({
      methodNames: ['wallet_revokePermissions'],
      implementation: expect.any(Function),
      hookNames: {
        revokePermissionsForOrigin: true,
      },
    });
  });
});

describe('revokePermissions RPC method', () => {
  it('revokes permissions using revokePermissionsForOrigin', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      implementation(req as any, res as any, next, end, {
        revokePermissionsForOrigin: mockRevokePermissionsForOrigin,
      }),
    );

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle({
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_revokePermissions',
      params: [
        {
          snap_dialog: {},
        },
      ],
    });

    expect(response.result).toBeNull();
    expect(mockRevokePermissionsForOrigin).toHaveBeenCalledTimes(1);
    expect(mockRevokePermissionsForOrigin).toHaveBeenCalledWith([
      'snap_dialog',
    ]);
  });

  it('returns an error if the request params is a plain object', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle(req as any);
    delete response.error.stack;
    expect(response.error).toStrictEqual(expectedError);
    expect(mockRevokePermissionsForOrigin).not.toHaveBeenCalled();
  });

  it('returns an error if the permissionKeys is a plain object', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      implementation(req as any, res as any, next, end, {
        revokePermissionsForOrigin: mockRevokePermissionsForOrigin,
      }),
    );

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_revokePermissions',
      params: [{}],
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
    expect(mockRevokePermissionsForOrigin).not.toHaveBeenCalled();
  });

  it('returns an error if the params are not set', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      implementation(req as any, res as any, next, end, {
        revokePermissionsForOrigin: mockRevokePermissionsForOrigin,
      }),
    );

    const req = {
      jsonrpc: '2.0',
      id: 1,
      method: 'wallet_revokePermissions',
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
    expect(mockRevokePermissionsForOrigin).not.toHaveBeenCalled();
  });

  it('returns an error if the request params is an empty array', async () => {
    const { implementation } = revokePermissionsHandler;
    const mockRevokePermissionsForOrigin = jest.fn();

    const engine = new JsonRpcEngine();
    engine.push((req, res, next, end) =>
      // TODO: Replace `any` with type
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

    // TODO: Replace `any` with type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const response: any = await engine.handle(req as any);
    delete response.error.stack;
    expect(response.error).toStrictEqual(expectedError);
    expect(mockRevokePermissionsForOrigin).not.toHaveBeenCalled();
  });
});
