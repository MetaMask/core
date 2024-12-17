import type {
  NetworkConfiguration,
  NetworkClientId,
} from '@metamask/network-controller';
import type { Caveat } from '@metamask/permission-controller';
import { providerErrors } from '@metamask/rpc-errors';
import type { JsonRpcRequest } from '@metamask/utils';

import type { Caip25CaveatValue } from '../caip25Permission';
import {
  Caip25CaveatType,
  Caip25EndowmentPermissionName,
} from '../caip25Permission';
import { Eip1193OnlyMethods, KnownWalletScopeString } from '../scope/constants';
import type { InternalScopeString } from '../scope/types';
import { getSessionScopes } from './caip-permission-adapter-session-scopes';

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
  request: JsonRpcRequest & {
    networkClientId: NetworkClientId;
    origin: string;
  },
  _response: unknown,
  next: () => Promise<void>,
  end: (error?: Error) => void,
  hooks: {
    getCaveat: (
      ...args: unknown[]
    ) => Caveat<typeof Caip25CaveatType, Caip25CaveatValue>;
    getNetworkConfigurationByNetworkClientId: (
      networkClientId: NetworkClientId,
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

  const scope: InternalScopeString = `eip155:${parseInt(chainId, 16)}`;

  const sessionScopes = getSessionScopes(caveat.value);

  if (
    !sessionScopes[scope]?.methods?.includes(method) &&
    !sessionScopes[KnownWalletScopeString.Eip155]?.methods?.includes(method) &&
    !sessionScopes.wallet?.methods?.includes(method) &&
    !Eip1193OnlyMethods.includes(method)
  ) {
    return end(providerErrors.unauthorized());
  }

  return next();
}
