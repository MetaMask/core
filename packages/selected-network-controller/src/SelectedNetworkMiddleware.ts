import type {
  NetworkClientId,
  NetworkControllerMessenger,
} from '@metamask/network-controller';
import type { JsonRpcMiddleware } from 'json-rpc-engine';

import type { SelectedNetworkControllerMessenger } from './SelectedNetworkController';
import { SelectedNetworkControllerActionTypes } from './SelectedNetworkController';

export const createSelectedNetworkMiddleware = (
  selectedNetworkControllerMessenger: SelectedNetworkControllerMessenger,
  networkControllerMessenger: NetworkControllerMessenger,
): JsonRpcMiddleware<any, any> => {
  const getNetworkClientIdForDomain = (origin: string) =>
    selectedNetworkControllerMessenger.call(
      SelectedNetworkControllerActionTypes.getNetworkClientIdForDomain,
      origin,
    );

  const setNetworkClientIdForDomain = (
    origin: string,
    networkClientId: NetworkClientId,
  ) =>
    selectedNetworkControllerMessenger.call(
      SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
      origin,
      networkClientId,
    );

  const getDefaultNetworkClientId = () =>
    networkControllerMessenger.call('NetworkController:getState')
      .selectedNetworkClientId;

  return (req: any, _, next) => {
    if (getNetworkClientIdForDomain(req.origin) === undefined) {
      setNetworkClientIdForDomain(req.origin, getDefaultNetworkClientId());
    }

    req.networkClientId = getNetworkClientIdForDomain(req.origin);
    return next();
  };
};
