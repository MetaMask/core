import type { ControllerMessenger } from '@metamask/base-controller';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import type {
  NetworkClientId,
  NetworkControllerGetStateAction,
} from '@metamask/network-controller';

import type {
  SelectedNetworkControllerGetNetworkClientIdForDomainAction,
  SelectedNetworkControllerSetNetworkClientIdForDomainAction,
} from './SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from './SelectedNetworkController';

export const createSelectedNetworkMiddleware = (
  messenger: ControllerMessenger<
    | SelectedNetworkControllerGetNetworkClientIdForDomainAction
    | SelectedNetworkControllerSetNetworkClientIdForDomainAction
    | NetworkControllerGetStateAction,
    never
  >,
): JsonRpcMiddleware<any, any> => {
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

  return (req: any, _, next) => {
    if (getNetworkClientIdForDomain(req.origin) === undefined) {
      setNetworkClientIdForDomain(req.origin, getDefaultNetworkClientId());
    }

    req.networkClientId = getNetworkClientIdForDomain(req.origin);
    return next();
  };
};
