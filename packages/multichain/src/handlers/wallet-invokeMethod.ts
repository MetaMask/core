import type { Caveat } from '@metamask/permission-controller';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type {
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import { numberToHex } from '@metamask/utils';

import { getSessionScopes } from '../adapters/caip-permission-adapter-session-scopes';
import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { assertIsInternalScopeString } from '../scope/assert';
import type { ExternalScopeString } from '../scope/types';
import { parseScopeString } from '../scope/types';

/**
 * Handler for the `wallet_invokeMethod` RPC method as specified by [CAIP-27](https://chainagnostic.org/CAIPs/caip-27).
 * The implementation below deviates from the linked spec in that it ignores the `sessionId` param
 * and instead uses the singular session for the origin if available.
 *
 * @param request - The request object.
 * @param _response - The response object. Unused.
 * @param next - The next middleware function.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.getCaveat - the hook for getting a caveat from a permission for an origin.
 * @param hooks.findNetworkClientIdByChainId - the hook for finding the networkClientId for a chainId.
 * @param hooks.getSelectedNetworkClientId - the hook for getting the current globally selected networkClientId.
 */
async function walletInvokeMethodHandler(
  request: JsonRpcRequest & {
    origin: string;
    params: {
      scope: ExternalScopeString;
      request: Pick<JsonRpcRequest, 'method' | 'params>;
    };
  },
  _response: PendingJsonRpcResponse<Json>,
  next: () => void,
  end: (error: Error) => void,
  hooks: {
    getCaveat: (
      origin: string,
      endowmentPermissionName: string,
      caveatType: string,
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
    findNetworkClientIdByChainId: (chainId: string) => string | undefined;
    getSelectedNetworkClientId: () => string;
  },
) {
  const { scope, request: wrappedRequest } = request.params as {
    scope: ExternalScopeString;
    request: JsonRpcRequest;
  };

  assertIsInternalScopeString(scope);

  let caveat;
  try {
    caveat = hooks.getCaveat(
      request.origin,
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  } catch (e) {
    // noop
  }
  if (!caveat?.value?.isMultichainOrigin) {
    return end(providerErrors.unauthorized());
  }

  const scopeObject = getSessionScopes(caveat.value)[scope];

  if (!scopeObject?.methods?.includes(wrappedRequest.method)) {
    return end(providerErrors.unauthorized());
  }

  const { namespace, reference } = parseScopeString(scope);

  let networkClientId;
  switch (namespace) {
    case 'wallet':
      networkClientId = hooks.getSelectedNetworkClientId();
      break;
    case 'eip155':
      if (reference) {
        networkClientId = hooks.findNetworkClientIdByChainId(
          numberToHex(parseInt(reference, 10)),
        );
      }
      break;
    default:
      console.error(
        'failed to resolve namespace for wallet_invokeMethod',
        request,
      );
      return end(rpcErrors.internal());
  }

  if (!networkClientId) {
    console.error(
      'failed to resolve network client for wallet_invokeMethod',
      request,
    );
    return end(rpcErrors.internal());
  }

  Object.assign(request, {
    scope,
    networkClientId,
    method: wrappedRequest.method,
    params: wrappedRequest.params,
  });
  return next();
}
export const walletInvokeMethod = {
  methodNames: ['wallet_invokeMethod'],
  implementation: walletInvokeMethodHandler,
  hookNames: {
    getCaveat: true,
    findNetworkClientIdByChainId: true,
    getSelectedNetworkClientId: true,
  },
};
