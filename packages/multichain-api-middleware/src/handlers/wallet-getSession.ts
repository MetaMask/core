import type {
  Caip25CaveatValue,
  NormalizedScopesObject,
} from '@metamask/chain-agnostic-permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
  getSessionScopes,
} from '@metamask/chain-agnostic-permission';
import type { Caveat } from '@metamask/permission-controller';
import type {
  CaipChainId,
  JsonRpcRequest,
  JsonRpcSuccess,
} from '@metamask/utils';

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
 * @returns Nothing.
 */
async function walletGetSessionHandler(
  _request: JsonRpcRequest & { origin: string },
  response: JsonRpcSuccess<{ sessionScopes: NormalizedScopesObject }>,
  _next: () => void,
  end: () => void,
  hooks: {
    getCaveatForOrigin: (
      endowmentPermissionName: string,
      caveatType: string,
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
    getNonEvmSupportedMethods: (scope: CaipChainId) => string[];
  },
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
    }),
  };
  return end();
}

export const walletGetSession = {
  methodNames: ['wallet_getSession'],
  implementation: walletGetSessionHandler,
  hookNames: {
    getCaveatForOrigin: true,
    getNonEvmSupportedMethods: true,
  },
};
