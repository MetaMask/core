import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine/v2';
import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import { object } from '@metamask/superstruct';
import { StrictHexStruct } from '@metamask/utils';
import type { Json, JsonRpcRequest } from '@metamask/utils';

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
  context: WalletMiddlewareContext,
) => Promise<RevokeExecutionPermissionResult>;

/**
 * Creates a handler for the `wallet_revokeExecutionPermission` JSON-RPC method.
 *
 * @param options - The options for the handler.
 * @param options.processRevokeExecutionPermission - The function to process the
 * revoke execution permission request.
 * @returns A JSON-RPC middleware function that handles the
 * `wallet_revokeExecutionPermission` JSON-RPC method.
 */
export function createWalletRevokeExecutionPermissionHandler({
  processRevokeExecutionPermission,
}: {
  processRevokeExecutionPermission?: ProcessRevokeExecutionPermissionHook;
}): JsonRpcMiddleware<JsonRpcRequest, Json, WalletMiddlewareContext> {
  return async ({ request, context }) => {
    if (!processRevokeExecutionPermission) {
      throw rpcErrors.methodNotSupported(
        'wallet_revokeExecutionPermission - no middleware configured',
      );
    }

    const { params } = request;

    validateParams(params, RevokeExecutionPermissionRequestParamsStruct);

    return await processRevokeExecutionPermission(params, request, context);
  };
}
