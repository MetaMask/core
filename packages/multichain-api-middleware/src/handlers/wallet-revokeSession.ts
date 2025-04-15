import { Caip25EndowmentPermissionName } from '@metamask/chain-agnostic-permission';
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

/**
 * Handler for the `wallet_revokeSession` RPC method as specified by [CAIP-285](https://chainagnostic.org/CAIPs/caip-285).
 * The implementation below deviates from the linked spec in that it ignores the `sessionId` param
 * and instead revokes the singular session for the origin if available. Additionally,
 * the handler also does not return an error if there is currently no active session and instead
 * returns true which is the same result returned if an active session was actually revoked.
 *
 * @param _request - The JSON-RPC request object. Unused.
 * @param response - The JSON-RPC response object.
 * @param _next - The next middleware function. Unused.
 * @param end - The end callback function.
 * @param hooks - The hooks object.
 * @param hooks.revokePermissionForOrigin - The hook for revoking a permission for an origin function.
 * @returns Nothing.
 */
async function walletRevokeSessionHandler(
  _request: JsonRpcRequest & { origin: string },
  response: JsonRpcSuccess<Json>,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: {
    revokePermissionForOrigin: (permissionName: string) => void;
  },
) {
  try {
    hooks.revokePermissionForOrigin(Caip25EndowmentPermissionName);
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
    revokePermissionForOrigin: true,
  },
};
