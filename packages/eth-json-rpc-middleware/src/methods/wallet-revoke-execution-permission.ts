import { rpcErrors } from '@metamask/rpc-errors';
import type { Infer } from '@metamask/superstruct';
import {
  type JsonRpcRequest,
  object,
  type PendingJsonRpcResponse,
  StrictHexStruct,
} from '@metamask/utils';

import { validateParams } from '../utils/validation';

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

export async function walletRevokeExecutionPermission(
  req: JsonRpcRequest,
  res: PendingJsonRpcResponse,
  {
    processRevokeExecutionPermission,
  }: {
    processRevokeExecutionPermission?: ProcessRevokeExecutionPermissionHook;
  },
): Promise<void> {
  if (!processRevokeExecutionPermission) {
    throw rpcErrors.methodNotSupported(
      'wallet_revokeExecutionPermission - no middleware configured',
    );
  }

  const { params } = req;

  validateParams(params, RevokeExecutionPermissionRequestParamsStruct);

  res.result = await processRevokeExecutionPermission(params, req);
}
