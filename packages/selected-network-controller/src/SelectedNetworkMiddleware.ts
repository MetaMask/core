import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type { NetworkClientId } from '@metamask/network-controller';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { SelectedNetworkControllerMessenger } from './SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from './SelectedNetworkController';

export type SelectedNetworkMiddlewareJsonRpcRequest = JsonRpcRequest & {
  networkClientId?: NetworkClientId;
  origin?: string;
};

export const createSelectedNetworkMiddleware = (
  messenger: SelectedNetworkControllerMessenger,
): JsonRpcMiddleware<JsonRpcParams, Json> => {
  const getNetworkClientIdForDomain = (origin: string) =>
    messenger.call(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      origin,
    );

  return (req: SelectedNetworkMiddlewareJsonRpcRequest, _, next) => {
    if (!req.origin) {
      throw new Error("Request object is lacking an 'origin'");
    }

    req.networkClientId = getNetworkClientIdForDomain(req.origin);
    return next();
  };
};
