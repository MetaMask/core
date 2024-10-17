import type { Caveat } from '@metamask/permission-controller';
import type { JsonRpcRequest, JsonRpcSuccess } from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { mergeScopes } from '../scope/transform';
import type { ScopesObject } from '../scope/types';

/**
 * Handler for the `wallet_getSession` RPC method.
 *
 * @param request - The request object.
 * @param response - The response object.
 * @param _next - The next middleware function.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.getCaveat - Function to retrieve a caveat.
 */
async function walletGetSessionHandler(
  request: JsonRpcRequest & { origin: string },
  response: JsonRpcSuccess<{ sessionScopes: ScopesObject }>,
  _next: () => void,
  end: () => void,
  hooks: {
    getCaveat: (
      origin: string,
      endowmentPermissionName: string,
      caveatType: string,
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
  },
) {
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

  if (!caveat) {
    response.result = { sessionScopes: {} };
    return end();
  }

  response.result = {
    sessionScopes: mergeScopes(
      caveat.value.requiredScopes,
      caveat.value.optionalScopes,
    ),
  };
  return end();
}

export const walletGetSession = {
  methodNames: ['wallet_getSession'],
  implementation: walletGetSessionHandler,
  hookNames: {
    getCaveat: true,
  },
};
