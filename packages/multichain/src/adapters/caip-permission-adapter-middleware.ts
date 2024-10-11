import type { NetworkConfiguration } from '@metamask/network-controller';
import type { Caveat } from '@metamask/permission-controller';
import { providerErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import type { ScopeString } from '../scope';
import { mergeScopes } from '../scope';

export type JsonRpcRequestWithNetworkClientIdAndOrigin = JsonRpcRequest & {
  networkClientId: string;
  origin: string;
};

/**
 * Middleware to handle CAIP-25 permission requests.
 *
 * @param request - The request object.
 * @param _response - The response object.
 * @param next - The next middleware function.
 * @param end - The end function.
 * @param hooks - The hooks object.
 * @param hooks.getCaveat - Function to retrieve a caveat.
 * @param hooks.getNetworkConfigurationByNetworkClientId - Function to retrieve a network configuration.
 */
export async function caipPermissionAdapterMiddleware(
  request: JsonRpcRequestWithNetworkClientIdAndOrigin,
  _response: unknown,
  next: () => Promise<void>,
  end: (error?: Error) => void,
  hooks: {
    getCaveat: (
      ...args: unknown[]
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
    getNetworkConfigurationByNetworkClientId: (
      networkClientId: string,
    ) => NetworkConfiguration;
  },
) {
  const { networkClientId, method } = request;

  let caveat;
  try {
    caveat = hooks.getCaveat(
      request.origin,
      Caip25EndowmentPermissionName,
      Caip25CaveatType,
    );
  } catch (err) {
    // noop
  }
  if (!caveat?.value?.isMultichainOrigin) {
    return next();
  }

  const { chainId } =
    hooks.getNetworkConfigurationByNetworkClientId(networkClientId);

  const scope: ScopeString = `eip155:${parseInt(chainId, 16)}`;

  const scopesObject = mergeScopes(
    caveat.value.requiredScopes,
    caveat.value.optionalScopes,
  );

  if (
    !scopesObject[scope]?.methods?.includes(method) &&
    !scopesObject['wallet:eip155']?.methods?.includes(method) &&
    !scopesObject.wallet?.methods?.includes(method)
  ) {
    return end(providerErrors.unauthorized());
  }

  return next();
}
