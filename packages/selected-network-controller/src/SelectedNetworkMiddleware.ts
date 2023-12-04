import type { ControllerMessenger } from '@metamask/base-controller';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type {
  NetworkClientId,
  NetworkControllerGetStateAction,
  NetworkControllerStateChangeEvent,
} from '@metamask/network-controller';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type {
  SelectedNetworkControllerGetNetworkClientIdForDomainAction,
  SelectedNetworkControllerSetNetworkClientIdForDomainAction,
} from './SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from './SelectedNetworkController';

export type MiddlewareAllowedActions = NetworkControllerGetStateAction;
export type MiddlewareAllowedEvents = NetworkControllerStateChangeEvent;

export type SelectedNetworkMiddlewareMessenger = ControllerMessenger<
  | SelectedNetworkControllerGetNetworkClientIdForDomainAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction
  | MiddlewareAllowedActions,
  MiddlewareAllowedEvents
>;

export type SelectedNetworkMiddlewareJsonRpcRequest = JsonRpcRequest & {
  networkClientId?: NetworkClientId;
  origin?: string;
};

export const createSelectedNetworkMiddleware = (
  messenger: SelectedNetworkMiddlewareMessenger,
): JsonRpcMiddleware<JsonRpcParams, Json> => {
  const getNetworkClientIdForDomain = (origin: string) =>
    messenger.call(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      origin,
    );

  const setNetworkClientIdForDomain = (
    origin: string,
    networkClientId: NetworkClientId,
  ) =>
    messenger.call(
      SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
      origin,
      networkClientId,
    );

  const getDefaultNetworkClientId = () =>
    messenger.call('NetworkController:getState').selectedNetworkClientId;

  return (req: SelectedNetworkMiddlewareJsonRpcRequest, _, next) => {
    if (!req.origin) {
      throw new Error("Request object is lacking an 'origin'");
    }

    if (getNetworkClientIdForDomain(req.origin) === undefined) {
      setNetworkClientIdForDomain(req.origin, getDefaultNetworkClientId());
    }

    req.networkClientId = getNetworkClientIdForDomain(req.origin);
    return next();
  };
};
