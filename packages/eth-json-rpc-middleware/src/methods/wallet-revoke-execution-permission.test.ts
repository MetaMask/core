import type { MiddlewareParams } from '@metamask/json-rpc-engine/v2';
import type { JsonRpcRequest } from '@metamask/utils';
import { klona } from 'klona';

import type {
  ProcessRevokeExecutionPermissionHook,
  RevokeExecutionPermissionRequestParams,
} from './wallet-revoke-execution-permission';
import { createWalletRevokeExecutionPermissionHandler } from './wallet-revoke-execution-permission';

const HEX_MOCK = '0x123abc';

const REQUEST_MOCK = {
  params: {
    permissionContext: HEX_MOCK,
  },
} as unknown as JsonRpcRequest<RevokeExecutionPermissionRequestParams>;

describe('wallet_revokeExecutionPermission', () => {
  let request: JsonRpcRequest<RevokeExecutionPermissionRequestParams>;
  let params: RevokeExecutionPermissionRequestParams;
  let processRevokeExecutionPermissionMock: jest.MockedFunction<ProcessRevokeExecutionPermissionHook>;

  const callMethod = async () => {
    const handler = createWalletRevokeExecutionPermissionHandler({
      processRevokeExecutionPermission: processRevokeExecutionPermissionMock,
    });
    return handler({ request } as MiddlewareParams<JsonRpcRequest>);
  };

  beforeEach(() => {
    jest.resetAllMocks();

    request = klona(REQUEST_MOCK);
    params = request.params as RevokeExecutionPermissionRequestParams;

    processRevokeExecutionPermissionMock = jest.fn();
    processRevokeExecutionPermissionMock.mockResolvedValue({});
  });

  it('calls hook', async () => {
    await callMethod();
    expect(processRevokeExecutionPermissionMock).toHaveBeenCalledWith(
      params,
      request,
    );
  });

  it('returns result from hook', async () => {
    const result = await callMethod();
    expect(result).toStrictEqual({});
  });

  it('throws if no hook', async () => {
    await expect(
      createWalletRevokeExecutionPermissionHandler({})({
        request,
      } as MiddlewareParams<JsonRpcRequest>),
    ).rejects.toThrow(
      'wallet_revokeExecutionPermission - no middleware configured',
    );
  });

  it('throws if no params', async () => {
    (request as JsonRpcRequest).params = undefined;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if missing properties', async () => {
    (request as JsonRpcRequest).params = {} as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if wrong types', async () => {
    params.permissionContext = 123 as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });

  it('throws if not hex', async () => {
    params.permissionContext = '123' as never;

    await expect(callMethod()).rejects.toThrow('Invalid params');
  });
});
