import type {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
} from '@metamask/json-rpc-engine';
import {
  PermissionDoesNotExistError,
  UnrecognizedSubjectError,
} from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcSuccess, Json, JsonRpcRequest } from '@metamask/utils';

import { Caip25EndowmentPermissionName } from '../caip25Permission';

/**
 * Handles the `wallet_revokeSession` RPC method.
 *
 * @param request - The JSON-RPC request object.
 * @param response - The JSON-RPC response object.
 * @param _next - The next middleware function.
 * @param end - The end callback function.
 * @param hooks - The hooks object.
 * @param hooks.revokePermission - The revokePermission function.
 */
async function walletRevokeSessionHandler(
  request: JsonRpcRequest & { origin: string },
  response: JsonRpcSuccess<Json>,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: {
    revokePermission: (origin: string, permissionName: string) => void;
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
export const walletRevokeSession = {
  methodNames: ['wallet_revokeSession'],
  implementation: walletRevokeSessionHandler,
  hookNames: {
    revokePermission: true,
  },
};
