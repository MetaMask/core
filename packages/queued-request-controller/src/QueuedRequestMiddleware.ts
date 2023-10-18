import type {
  AddApprovalRequest,
  ApprovalRequest,
} from '@metamask/approval-controller';
import type { ControllerMessenger } from '@metamask/base-controller';
import type { InfuraNetworkType } from '@metamask/controller-utils';
import {
  ApprovalType,
  BUILT_IN_NETWORKS,
  isNetworkType,
} from '@metamask/controller-utils';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  NetworkClientId,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
  NetworkControllerSetProviderTypeAction,
} from '@metamask/network-controller';
import type { CustomNetworkClientConfiguration } from '@metamask/network-controller/src/types';
import type { SelectedNetworkControllerSetNetworkClientIdForDomainAction } from '@metamask/selected-network-controller';
import { SelectedNetworkControllerActionTypes } from '@metamask/selected-network-controller';
import type { Json } from '@metamask/utils';
import { isJsonRpcError } from '@metamask/utils';

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
) => {
  return createAsyncMiddleware<
    {
      networkClientId?: NetworkClientId;
      origin: string;
    },
    Json
  >(async (req, res, next) => {
    if (
      !useRequestQueue() ||
      isConfirmationMethod(req.method) ||
      req.params === undefined
    ) {
      next();
      return;
    }

    const { origin, networkClientId: networkClientIdForRequest } = req.params;

    await messenger.call(
      QueuedRequestControllerActionTypes.enqueueRequest,
      async () => {
        if (req.method === 'wallet_switchEthereumChain') {
          // eslint-disable-next-line n/callback-return
          return next();
        }

        const isBuiltIn = isNetworkType(networkClientIdForRequest);
        let networkConfigurationForRequest:
          | ((typeof BUILT_IN_NETWORKS)[keyof typeof BUILT_IN_NETWORKS] &
              Record<string, Json>)
          | CustomNetworkClientConfiguration;
        if (isBuiltIn) {
          const builtIn = BUILT_IN_NETWORKS[networkClientIdForRequest];
          if (builtIn.chainId) {
            networkConfigurationForRequest = builtIn;
          }
        }

        networkConfigurationForRequest ??= messenger.call(
          'NetworkController:getNetworkClientById',
          networkClientIdForRequest ?? '',
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
          const approvedRequestData = (await messenger.call(
            'ApprovalController:addRequest',
            {
              origin: req.origin,
              type: ApprovalType.SwitchEthereumChain,
              requestData,
            },
            true,
          )) as ApprovalRequest<typeof requestData> & {
            type: InfuraNetworkType;
          };

          if (isBuiltIn) {
            await messenger.call(
              'NetworkController:setProviderType',
              approvedRequestData.type,
            );
          } else {
            await messenger.call(
              'NetworkController:setActiveNetwork',
              approvedRequestData.id,
            );
          }

          messenger.call(
            SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
            origin,
            networkClientIdForRequest ?? '',
          );
        } catch (error) {
          if (isJsonRpcError(error)) {
            res.error = error;
          }
          return error;
        }

        // eslint-disable-next-line n/callback-return
        return next();
      },
    );
  });
};
