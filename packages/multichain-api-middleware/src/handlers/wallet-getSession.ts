import type { NormalizedScopesObject } from '@metamask/chain-agnostic-permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  getSessionProperties,
  getSessionScopes,
} from '@metamask/chain-agnostic-permission';
import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  MethodHandler,
} from '@metamask/json-rpc-engine';
import type {
  Json,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

import type {
  Caip25Caveat,
  GetCapabilitiesHook,
  GetCaveatForOriginHook,
  GetNonEvmSupportedMethodsHook,
  SortAccountIdsByLastSelectedHook,
} from './types.js';

type WalletGetSessionResult = {
  sessionScopes: NormalizedScopesObject;
  sessionProperties: Record<string, Json>;
};

export type WalletGetSessionHooks = GetCaveatForOriginHook &
  GetNonEvmSupportedMethodsHook &
  SortAccountIdsByLastSelectedHook &
  GetCapabilitiesHook;

/**
 * Handler for the `wallet_getSession` RPC method as specified by [CAIP-312](https://chainagnostic.org/CAIPs/caip-312).
 * The implementation below deviates from the linked spec in that it ignores the `sessionId` param entirely,
 * and that an empty object is returned for the `sessionScopes` result rather than throwing an error if there
 * is no active session for the origin.
 *
 * @param _request - The request object.
 * @param response - The response object.
 * @param _next - The next middleware function. Unused.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.getCaveatForOrigin - Function to retrieve a caveat for the origin.
 * @param hooks.getNonEvmSupportedMethods - A function that returns the supported methods for a non EVM scope.
 * @param hooks.sortAccountIdsByLastSelected - A function that accepts an array of CaipAccountId and returns an array of CaipAccountId sorted by corresponding last selected account in the wallet.
 * @param hooks.getCapabilities - A function that returns the capabilities for a given address.
 * @returns Nothing.
 */
async function handleWalletGetSession(
  _request: JsonRpcRequest & { origin: string },
  response: PendingJsonRpcResponse<WalletGetSessionResult>,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: WalletGetSessionHooks,
) {
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
    response.result = { sessionScopes: {}, sessionProperties: {} };
    return end();
  }

  response.result = {
    sessionScopes: getSessionScopes(caveat.value, {
      getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
      sortAccountIdsByLastSelected: hooks.sortAccountIdsByLastSelected,
    }),
    sessionProperties: await getSessionProperties(caveat.value, {
      getCapabilities: hooks.getCapabilities,
    }),
  };
  return end();
}

export type WalletGetSessionHandler = MethodHandler<
  WalletGetSessionHooks,
  never,
  JsonRpcParams,
  WalletGetSessionResult,
  { origin: string }
>;

export const walletGetSessionHandler = {
  implementation: handleWalletGetSession,
  hookNames: {
    getCaveatForOrigin: true,
    getNonEvmSupportedMethods: true,
    sortAccountIdsByLastSelected: true,
    getCapabilities: true,
  },
} satisfies WalletGetSessionHandler;
