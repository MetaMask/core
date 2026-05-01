import type { ExternalScopeString } from '@metamask/chain-agnostic-permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  assertIsInternalScopeString,
  getSessionScopes,
  parseScopeString,
} from '@metamask/chain-agnostic-permission';
import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  MethodHandler,
} from '@metamask/json-rpc-engine';
import type {
  NetworkClientId,
  NetworkController,
} from '@metamask/network-controller';
import { providerErrors, rpcErrors } from '@metamask/rpc-errors';
import type { MultichainRoutingService } from '@metamask/snaps-controllers';
import { isObject, KnownCaipNamespace, numberToHex } from '@metamask/utils';
import type {
  CaipAccountId,
  CaipChainId,
  Json,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type {
  Caip25Caveat,
  GetCaveatForOriginHook,
  GetNonEvmSupportedMethodsHook,
  SortAccountIdsByLastSelectedHook,
} from './types';

export type WalletInvokeMethodParams = {
  scope: ExternalScopeString;
  request: Pick<JsonRpcRequest, 'method' | 'params'>;
};

export type WalletInvokeMethodRequest =
  JsonRpcRequest<WalletInvokeMethodParams> & {
    origin: string;
  };

export type WalletInvokeMethodHooks = GetCaveatForOriginHook &
  GetNonEvmSupportedMethodsHook &
  SortAccountIdsByLastSelectedHook & {
    findNetworkClientIdByChainId: NetworkController['findNetworkClientIdByChainId'];
    getSelectedNetworkClientId: () => NetworkClientId;
    handleNonEvmRequestForOrigin: (params: {
      connectedAddresses: CaipAccountId[];
      scope: CaipChainId;
      request: JsonRpcRequest;
    }) => ReturnType<MultichainRoutingService['handleRequest']>;
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
 * @param hooks.sortAccountIdsByLastSelected - A function that sorts accounts by their last selected order.
 * @param hooks.handleNonEvmRequestForOrigin - A function that sends a request to the MultichainRouter for processing.
 * @returns Nothing.
 */
async function handleWalletInvokeMethod(
  request: WalletInvokeMethodRequest,
  response: PendingJsonRpcResponse<Json>,
  next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: WalletInvokeMethodHooks,
) {
  if (!isObject(request.params)) {
    return end(rpcErrors.invalidParams({ data: { request } }));
  }

  const { scope, request: wrappedRequest } = request.params;
  assertIsInternalScopeString(scope);

  let caveat: Caip25Caveat | undefined;
  try {
    caveat = hooks.getCaveatForOrigin(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    ) as Caip25Caveat | undefined;
  } catch {
    // noop
  }
  if (!caveat) {
    return end(providerErrors.unauthorized());
  }

  const scopeObject = getSessionScopes(caveat.value, {
    getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
    sortAccountIdsByLastSelected: hooks.sortAccountIdsByLastSelected,
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

  try {
    response.result = await hooks.handleNonEvmRequestForOrigin({
      connectedAddresses: scopeObject.accounts,
      // Type assertion: We know that scope is not "wallet" by now because it
      // is already being handled above.
      scope: scope as CaipChainId,
      request: unwrappedRequest,
    });
  } catch (err) {
    return end(err as Error);
  }
  return end();
}

export type WalletInvokeMethodHandler = MethodHandler<
  WalletInvokeMethodHooks,
  never,
  WalletInvokeMethodParams,
  Json,
  { origin: string }
>;

export const walletInvokeMethodHandler = {
  implementation: handleWalletInvokeMethod,
  hookNames: {
    getCaveatForOrigin: true,
    findNetworkClientIdByChainId: true,
    getSelectedNetworkClientId: true,
    getNonEvmSupportedMethods: true,
    sortAccountIdsByLastSelected: true,
    handleNonEvmRequestForOrigin: true,
  },
} satisfies WalletInvokeMethodHandler;
