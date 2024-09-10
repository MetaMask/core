import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Hex, Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { SelectedNetworkControllerMessenger } from './SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from './SelectedNetworkController';

export type SelectedNetworkMiddlewareJsonRpcRequest = JsonRpcRequest & {
  chainId?: Hex;
  networkClientId?: NetworkClientId;
  origin?: string;
};

export const createSelectedNetworkMiddleware = (
  messenger: SelectedNetworkControllerMessenger,
): JsonRpcMiddleware<JsonRpcParams, Json> => {
  const getChainIdForDomain = (origin: string) =>
    messenger.call(
      SelectedNetworkControllerActionTypes.getChainIdForDomain,
      origin,
    );

  const getDefaultNetworkClientIdForChainId = (chainId: Hex) =>
    messenger.call(
      'NetworkController:getDefaultNetworkClientIdForChainId',
      chainId,
    );

  return (req: SelectedNetworkMiddlewareJsonRpcRequest, _, next) => {
    if (!req.origin) {
      throw new Error("Request object is lacking an 'origin'");
    }

    req.chainId = getChainIdForDomain(req.origin);
    req.networkClientId = getDefaultNetworkClientIdForChainId(req.chainId);
    return next();
  };
};
