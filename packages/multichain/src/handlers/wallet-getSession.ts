import type { Caveat } from '@metamask/permission-controller';
import type { JsonRpcSuccess } from '@metamask/utils';
import type { JsonRpcRequestWithNetworkClientIdAndOrigin } from 'src/adapters/caip-permission-adapter-middleware';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import type { ScopesObject } from '../scope';
import { mergeScopes } from '../scope';

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
export async function walletGetSessionHandler(
  request: JsonRpcRequestWithNetworkClientIdAndOrigin,
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
