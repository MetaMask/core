import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import { object } from '@metamask/superstruct';
import type { Json } from '@metamask/utils';
import { type JsonRpcRequest, StrictHexStruct } from '@metamask/utils';

import { validateParams } from '../utils/validation';
import type { WalletMiddlewareContext } from '../wallet';

export const RevokeExecutionPermissionResultStruct = object({});

export type RevokeExecutionPermissionResult = Infer<
  typeof RevokeExecutionPermissionResultStruct
>;

export const RevokeExecutionPermissionRequestParamsStruct = object({
  permissionContext: StrictHexStruct,
});

export type RevokeExecutionPermissionRequestParams = Infer<
  typeof RevokeExecutionPermissionRequestParamsStruct
>;

export type ProcessRevokeExecutionPermissionHook = (
  request: RevokeExecutionPermissionRequestParams,
  req: JsonRpcRequest,
) => Promise<RevokeExecutionPermissionResult>;

export function createWalletRevokeExecutionPermissionHandler({
  processRevokeExecutionPermission,
}: {
  processRevokeExecutionPermission?: ProcessRevokeExecutionPermissionHook;
}): JsonRpcMiddleware<JsonRpcRequest, Json, WalletMiddlewareContext> {
  return async ({ request }) => {
    if (!processRevokeExecutionPermission) {
      throw rpcErrors.methodNotSupported(
        'wallet_revokeExecutionPermission - no middleware configured',
      );
    }

    const { params } = request;

    validateParams(params, RevokeExecutionPermissionRequestParamsStruct);

    return await processRevokeExecutionPermission(params, request);
  };
}
