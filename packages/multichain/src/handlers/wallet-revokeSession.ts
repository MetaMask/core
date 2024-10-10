import type { JsonRpcEngineNextCallback, JsonRpcEngineEndCallback } from '@metamask/json-rpc-engine';
import {
  PermissionDoesNotExistError,
  UnrecognizedSubjectError,
  PermissionController
} from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import { Caip25EndowmentPermissionName } from '../caip25Permission';
import { JsonRpcRequest, JsonRpcResponse } from '@metamask/utils';

export async function walletRevokeSessionHandler(
  request: JsonRpcRequest<Params>,
  response: JsonRpcResponse<true>,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: {
    revokePermission: PermissionController['revokePermission']
  },
) {
  try {
    hooks.revokePermission(request.origin, Caip25EndowmentPermissionName);
  } catch (err) {
    if (
      !(err instanceof UnrecognizedSubjectError) &&
      !(err instanceof PermissionDoesNotExistError)
    ) {
      console.error(err);
      return end(rpcErrors.internal());
    }
  }

  response.result = true;
  return end();
}
