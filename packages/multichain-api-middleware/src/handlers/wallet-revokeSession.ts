import {
  Caip25CaveatMutators,
  Caip25CaveatType,
  type Caip25CaveatValue,
  Caip25EndowmentPermissionName,
} from '@metamask/chain-agnostic-permission';
import type {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
} from '@metamask/json-rpc-engine';
import {
  type Caveat,
  PermissionDoesNotExistError,
  UnrecognizedSubjectError,
} from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcSuccess, JsonRpcRequest } from '@metamask/utils';

/**
 * Handler for the `wallet_revokeSession` RPC method as specified by [CAIP-285](https://chainagnostic.org/CAIPs/caip-285).
 * The implementation below deviates from the linked spec in that it ignores the `sessionId` param
 * and instead revokes the singular session for the origin if available. Additionally,
 * the handler also does not return an error if there is currently no active session and instead
 * returns true which is the same result returned if an active session was actually revoked.
 *
 * @param request - The JSON-RPC request object. Unused.
 * @param response - The JSON-RPC response object.
 * @param _next - The next middleware function. Unused.
 * @param end - The end callback function.
 * @param hooks - The hooks object.
 * @param hooks.revokePermissionForOrigin - The hook for revoking a permission for an origin function.
 * @param hooks.updateCaveat -
 * @param hooks.getCaveatForOrigin -
 * @returns Nothing.
 */
async function walletRevokeSessionHandler(
  request: JsonRpcRequest & {
    origin: string;
    params: { sessionScopes?: string[] };
  },
  response: JsonRpcSuccess,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: {
    revokePermissionForOrigin: (permissionName: string) => void;
    updateCaveat: (
      target: string,
      caveatType: string,
      caveatValue: Caip25CaveatValue,
    ) => void;
    getCaveatForOrigin: (
      endowmentPermissionName: string,
      caveatType: string,
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
  },
) {
  const {
    params: { sessionScopes },
  } = request;

  try {
    if (sessionScopes?.length) {
      const existingCaveat = hooks.getCaveatForOrigin(
        Caip25EndowmentPermissionName,
        Caip25CaveatType,
      );

      let updatedCaveatValue;
      for (const scopeString of sessionScopes) {
        updatedCaveatValue =
          Caip25CaveatMutators[Caip25CaveatType].removeScope(
            existingCaveat.value,
            scopeString,
          )?.value ?? updatedCaveatValue;
      }

      if (updatedCaveatValue) {
        hooks.updateCaveat(
          Caip25EndowmentPermissionName,
          Caip25CaveatType,
          updatedCaveatValue,
        );
      }
    } else {
      hooks.revokePermissionForOrigin(Caip25EndowmentPermissionName);
    }
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
    updateCaveat: true,
    getCaveatForOrigin: true,
  },
};
