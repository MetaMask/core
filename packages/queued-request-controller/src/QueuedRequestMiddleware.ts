import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { ControllerMessenger } from '@metamask/base-controller';
import type { InfuraNetworkType } from '@metamask/controller-utils';
import {
  ApprovalType,
  BUILT_IN_NETWORKS,
  isNetworkType,
} from '@metamask/controller-utils';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  NetworkClientId,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerSetProviderTypeAction,
} from '@metamask/network-controller';
import type { SelectedNetworkControllerSetNetworkClientIdForDomainAction } from '@metamask/selected-network-controller';
import { SelectedNetworkControllerActionTypes } from '@metamask/selected-network-controller';

import type { QueuedRequestControllerEnqueueRequestAction } from './QueuedRequestController';
import { QueuedRequestControllerActionTypes } from './QueuedRequestController';

const isConfirmationMethod = (method: string) => {
  const confirmationMethods = [
    'eth_sendTransaction',
    'wallet_watchAsset',
    'wallet_switchEthereumChain',
    'eth_signTypedData_v4',
  ];

  return !confirmationMethods.includes(method);
};

export const createQueuedRequestMiddleware = (
  messenger: ControllerMessenger<
    | QueuedRequestControllerEnqueueRequestAction
    | NetworkControllerGetStateAction
    | NetworkControllerSetActiveNetworkAction
    | NetworkControllerSetProviderTypeAction
    | NetworkControllerGetNetworkClientByIdAction
    | NetworkControllerFindNetworkClientIdByChainIdAction
    | SelectedNetworkControllerSetNetworkClientIdForDomainAction
    | AddApprovalRequest,
    never
  >,
  useRequestQueue: () => boolean,
): JsonRpcMiddleware<any, any> => {
  return createAsyncMiddleware(async (req: any, res: any, next) => {
    if (!useRequestQueue() || isConfirmationMethod(req.method)) {
      next();
      return;
    }

    const networkClientIdForRequest = req.networkClientId as NetworkClientId;

    await messenger.call(
      QueuedRequestControllerActionTypes.enqueueRequest,
      async () => {
        if (req.method === 'wallet_switchEthereumChain') {
          // eslint-disable-next-line n/callback-return
          return next();
        }

        const isBuiltIn = isNetworkType(networkClientIdForRequest);
        let networkConfigurationForRequest;
        if (isBuiltIn) {
          const builtIn = BUILT_IN_NETWORKS[networkClientIdForRequest];
          if (builtIn.chainId) {
            networkConfigurationForRequest = builtIn;
          }
        }

        networkConfigurationForRequest =
          networkConfigurationForRequest ||
          messenger.call(
            'NetworkController:getNetworkClientById',
            networkClientIdForRequest,
          ).configuration;

        const currentProviderConfig = messenger.call(
          'NetworkController:getState',
        ).providerConfig;

        const currentChainId = currentProviderConfig.chainId;

        if (currentChainId === networkConfigurationForRequest.chainId) {
          // eslint-disable-next-line n/callback-return
          return next();
        }

        // if is switch eth chain call
        // clear request queue when the switch ethereum chain call completes (success or fail)
        // This is because a dapp-requested switch ethereum chain invalidates any requests they've made after this switch, since we dont know if they were expecting the chain after the switch or before.
        // with the queue batching approach, this would mean clearing any batch for that origin (batches being per-origin.)
        const requestData = {
          toNetworkConfiguration: networkConfigurationForRequest,
          fromNetworkConfiguration: currentProviderConfig,
        };

        try {
          const approvedRequestData = await messenger.call(
            'ApprovalController:addRequest',
            {
              origin,
              type: ApprovalType.SwitchEthereumChain,
              requestData,
            },
            true,
          );

          if (isBuiltIn) {
            await messenger.call(
              'NetworkController:setProviderType',
              (approvedRequestData as { type: InfuraNetworkType }).type,
            );
          } else {
            await messenger.call(
              'NetworkController:setActiveNetwork',
              (approvedRequestData as { id: NetworkClientId }).id,
            );
          }

          messenger.call(
            SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
            req.origin,
            networkClientIdForRequest,
          );
        } catch (error) {
          res.error = error;
          return error;
        }

        // eslint-disable-next-line n/callback-return
        return next();
      },
    );
  });
};
