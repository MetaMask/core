import type { Caveat } from '@metamask/permission-controller';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { JsonRpcSuccess, Json, JsonRpcRequest } from '@metamask/utils';
import { numberToHex } from '@metamask/utils';
import type { JsonRpcRequestWithNetworkClientIdAndOrigin } from 'src/adapters/caip-permission-adapter-middleware';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import type { ScopeString } from '../scope';
import { mergeScopes, parseScopeString } from '../scope';

/**
 * Handler for the `wallet_invokeMethod` RPC method.
 *
 * @param request - The request object.
 * @param _response - The response object.
 * @param next - The next middleware function.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.getCaveat
 * @param hooks.findNetworkClientIdByChainId
 * @param hooks.getSelectedNetworkClientId
 */
export async function walletInvokeMethodHandler(
  request: JsonRpcRequestWithNetworkClientIdAndOrigin,
  _response: JsonRpcSuccess<Json>,
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
    scope: ScopeString;
    request: JsonRpcRequest;
  };

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

  const scopeObject = mergeScopes(
    caveat.value.requiredScopes,
    caveat.value.optionalScopes,
  )[scope];

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
