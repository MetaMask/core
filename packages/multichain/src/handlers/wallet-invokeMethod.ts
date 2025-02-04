import type { NetworkClientId } from '@metamask/network-controller';
import type { Caveat } from '@metamask/permission-controller';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type {
  CaipAccountId,
  CaipChainId,
  Hex,
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';
import {
  isCaipChainId,
  KnownCaipNamespace,
  numberToHex,
} from '@metamask/utils';

import { getSessionScopes } from '../adapters/caip-permission-adapter-session-scopes';
import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { assertIsInternalScopeString } from '../scope/assert';
import type { ExternalScopeString } from '../scope/types';
import { parseScopeString } from '../scope/types';

export type WalletInvokeMethodRequest = JsonRpcRequest & {
  origin: string;
  params: {
    scope: ExternalScopeString;
    request: Pick<JsonRpcRequest, 'method' | 'params'>;
  };
};

/**
 * Handler for the `wallet_invokeMethod` RPC method as specified by [CAIP-27](https://chainagnostic.org/CAIPs/caip-27).
 * The implementation below deviates from the linked spec in that it ignores the `sessionId` param
 * and instead uses the singular session for the origin if available.
 *
 * @param request - The request object.
 * @param response - The response object. Unused.
 * @param next - The next middleware function.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.getCaveatForOrigin - the hook for getting a caveat from a permission for an origin.
 * @param hooks.findNetworkClientIdByChainId - the hook for finding the networkClientId for a chainId.
 * @param hooks.getSelectedNetworkClientId - the hook for getting the current globally selected networkClientId.
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @param hooks.handleNonEvmRequestForOrigin - A function that sends a request to the MultichainRouter for processing.
 */
async function walletInvokeMethodHandler(
  request: WalletInvokeMethodRequest,
  response: PendingJsonRpcResponse<Json>,
  next: () => void,
  end: (error?: Error) => void,
  hooks: {
    getCaveatForOrigin: (
      endowmentPermissionName: string,
      caveatType: string,
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
    findNetworkClientIdByChainId: (chainId: Hex) => NetworkClientId | undefined;
    getSelectedNetworkClientId: () => NetworkClientId;
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
    handleNonEvmRequestForOrigin: (params: {
      connectedAddresses: CaipAccountId[];
      scope: CaipChainId;
      request: JsonRpcRequest;
    }) => Promise<Json>;
  },
) {
  const { scope, request: wrappedRequest } = request.params;

  assertIsInternalScopeString(scope);

  let caveat;
  try {
    caveat = hooks.getCaveatForOrigin(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  } catch (e) {
    // noop
  }
  if (!caveat?.value?.isMultichainOrigin) {
    return end(providerErrors.unauthorized());
  }

  const scopeObject = getSessionScopes(caveat.value, {
    getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
  })[scope];

  if (!scopeObject?.methods?.includes(wrappedRequest.method)) {
    return end(providerErrors.unauthorized());
  }

  const { namespace, reference } = parseScopeString(scope);

  const isEvmRequest =
    (namespace === KnownCaipNamespace.Wallet &&
      (!reference || reference === KnownCaipNamespace.Eip155)) ||
    namespace === KnownCaipNamespace.Eip155;

  const unwrappedRequest = {
    ...request,
    scope,
    method: wrappedRequest.method,
    params: wrappedRequest.params,
  };

  if (isEvmRequest) {
    let networkClientId;
    if (namespace === KnownCaipNamespace.Wallet) {
      networkClientId = hooks.getSelectedNetworkClientId();
    } else if (namespace === KnownCaipNamespace.Eip155) {
      if (reference) {
        networkClientId = hooks.findNetworkClientIdByChainId(
          numberToHex(parseInt(reference, 10)),
        );
      }
    }

    if (!networkClientId) {
      console.error(
        'failed to resolve network client for wallet_invokeMethod',
        request,
      );
      return end(rpcErrors.internal());
    }

    Object.assign(request, {
      ...unwrappedRequest,
      networkClientId,
    });
    return next();
  }

  if (!isCaipChainId(scope)) {
    return end(rpcErrors.internal());
  }

  try {
    response.result = await hooks.handleNonEvmRequestForOrigin({
      connectedAddresses: scopeObject.accounts,
      scope,
      request: unwrappedRequest,
    });
  } catch (err) {
    return end(err as Error);
  }
  return end();
}
export const walletInvokeMethod = {
  methodNames: ['wallet_invokeMethod'],
  implementation: walletInvokeMethodHandler,
  hookNames: {
    getCaveatForOrigin: true,
    findNetworkClientIdByChainId: true,
    getSelectedNetworkClientId: true,
    getNonEvmSupportedMethods: true,
    handleNonEvmRequest: true,
  },
};
