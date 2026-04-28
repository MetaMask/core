import type {
  Caip25CaveatValue,
  NormalizedScopesObject,
} from '@metamask/chain-agnostic-permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  getSessionScopes,
} from '@metamask/chain-agnostic-permission';
import type {
  JsonRpcEngineEndCallback,
  JsonRpcEngineNextCallback,
  MethodHandler,
} from '@metamask/json-rpc-engine';
import type { Caveat } from '@metamask/permission-controller';
import type {
  CaipAccountId,
  CaipChainId,
  JsonRpcParams,
  JsonRpcRequest,
  PendingJsonRpcResponse,
} from '@metamask/utils';

type WalletGetSessionResult = { sessionScopes: NormalizedScopesObject };

type WalletGetSessionHooks = {
  getCaveatForOrigin: (
    endowmentPermissionName: string,
    caveatType: string,
  ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
  getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  sortAccountIdsByLastSelected: (accounts: CaipAccountId[]) => CaipAccountId[];
};

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
 * @returns Nothing.
 */
async function handleWalletGetSession(
  _request: JsonRpcRequest & { origin: string },
  response: PendingJsonRpcResponse<WalletGetSessionResult>,
  _next: JsonRpcEngineNextCallback,
  end: JsonRpcEngineEndCallback,
  hooks: WalletGetSessionHooks,
) {
  let caveat;
  try {
    caveat = hooks.getCaveatForOrigin(
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  } catch {
    // noop
  }

  if (!caveat) {
    response.result = { sessionScopes: {} };
    return end();
  }

  response.result = {
    sessionScopes: getSessionScopes(caveat.value, {
      getNonEvmSupportedMethods: hooks.getNonEvmSupportedMethods,
      sortAccountIdsByLastSelected: hooks.sortAccountIdsByLastSelected,
    }),
  };
  return end();
}

type WalletGetSessionMethodHandler = MethodHandler<
  WalletGetSessionHooks,
  never,
  JsonRpcParams,
  WalletGetSessionResult,
  { origin: string }
>;

export const walletGetSession = {
  implementation: handleWalletGetSession,
  hookNames: {
    getCaveatForOrigin: true,
    getNonEvmSupportedMethods: true,
    sortAccountIdsByLastSelected: true,
  },
} satisfies WalletGetSessionMethodHandler;

export const walletGetSessionHandler = {
  wallet_getSession: walletGetSession,
};
