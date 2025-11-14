import {
  Caip25CaveatMutators,
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  getCaipAccountIdsFromCaip25CaveatValue,
} from '@metamask/chain-agnostic-permission';
import type {
  JsonRpcEngineNextCallback,
  JsonRpcEngineEndCallback,
} from '@metamask/json-rpc-engine';
import {
  CaveatMutatorOperation,
  PermissionDoesNotExistError,
  UnrecognizedSubjectError,
} from '@metamask/permission-controller';
import { rpcErrors } from '@metamask/rpc-errors';
import {
  type JsonRpcSuccess,
  type JsonRpcRequest,
  isObject,
} from '@metamask/utils';

import type { WalletRevokeSessionHooks } from './types';

/**
 * Check whether the given error is a permission error.
 *
 * @param error - The error to check.
 * @returns Whether the error is a permission error.
 */
function isPermissionError(error: unknown) {
  if (
    !isObject(error) ||
    !('name' in error) ||
    typeof error.name !== 'string'
  ) {
    return false;
  }

  return [
    UnrecognizedSubjectError.name,
    PermissionDoesNotExistError.name,
  ].includes(error.name);
}

/**
 * Revokes specific session scopes from an existing caveat.
 * Fully revokes permission if no accounts remain permitted after iterating through scopes.
 *
 * @param scopes - Array of scope strings to remove from the caveat.
 * @param hooks - The hooks object.
 * @param hooks.revokePermissionForOrigin - The hook for revoking a permission for an origin function.
 * @param hooks.updateCaveat - The hook used to conditionally update the caveat rather than fully revoke the permission.
 * @param hooks.getCaveatForOrigin - The hook to fetch an existing caveat for the origin of the request.
 */
function partialRevokePermissions(
  scopes: string[],
  hooks: WalletRevokeSessionHooks,
) {
  let updatedCaveatValue = hooks.getCaveatForOrigin(
    Caip25EndowmentPermissionName,
    Caip25CaveatType,
  ).value;

  for (const scopeString of scopes) {
    const result = Caip25CaveatMutators[Caip25CaveatType].removeScope(
      updatedCaveatValue,
      scopeString,
    );

    // If operation is a Noop, it means a scope was passed that was not present in the permission, so we proceed with the loop
    if (result.operation === CaveatMutatorOperation.Noop) {
      continue;
    }

    updatedCaveatValue = result?.value ?? {
      requiredScopes: {},
      optionalScopes: {},
      sessionProperties: {},
      isMultichainOrigin: true,
    };
  }

  const caipAccountIds =
    getCaipAccountIdsFromCaip25CaveatValue(updatedCaveatValue);

  // We fully revoke permission if no accounts are left after scope removal loop.
  if (!caipAccountIds.length) {
    hooks.revokePermissionForOrigin(Caip25EndowmentPermissionName);
  } else {
    hooks.updateCaveat(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
      updatedCaveatValue,
    );
  }
}

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
 * @param hooks.updateCaveat - The hook used to conditionally update the caveat rather than fully revoke the permission.
 * @param hooks.getCaveatForOrigin - The hook to fetch an existing caveat for the origin of the request.
 * @returns Nothing.
 */
async function walletRevokeSessionHandler(
  request: JsonRpcRequest & {
    origin: string;
    params: { scopes?: string[] };
  },
  response: JsonRpcSuccess,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: WalletRevokeSessionHooks,
) {
  const {
    params: { scopes },
  } = request;

  try {
    if (scopes?.length) {
      partialRevokePermissions(scopes, hooks);
    } else {
      hooks.revokePermissionForOrigin(Caip25EndowmentPermissionName);
    }
  } catch (err) {
    if (!isPermissionError(err)) {
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
