import type { AddApprovalRequest } from '@metamask/approval-controller';
import type { ControllerMessenger } from '@metamask/base-controller';
import { ApprovalType, isNetworkType } from '@metamask/controller-utils';
import type { JsonRpcMiddleware } from '@metamask/json-rpc-engine';
import { createAsyncMiddleware } from '@metamask/json-rpc-engine';
import type {
  NetworkClientId,
  NetworkControllerFindNetworkClientIdByChainIdAction,
  NetworkControllerGetNetworkClientByIdAction,
  NetworkControllerGetStateAction,
  NetworkControllerSetActiveNetworkAction,
} from '@metamask/network-controller';
import { serializeError } from '@metamask/rpc-errors';
import type { SelectedNetworkControllerSetNetworkClientIdForDomainAction } from '@metamask/selected-network-controller';
import { SelectedNetworkControllerActionTypes } from '@metamask/selected-network-controller';
import type { Json, JsonRpcParams, JsonRpcRequest } from '@metamask/utils';

import type { QueuedRequestControllerEnqueueRequestAction } from './QueuedRequestController';
import { QueuedRequestControllerActionTypes } from './QueuedRequestController';

export type MiddlewareAllowedActions =
  | NetworkControllerGetStateAction
  | NetworkControllerSetActiveNetworkAction
  | NetworkControllerGetNetworkClientByIdAction
  | NetworkControllerFindNetworkClientIdByChainIdAction
  | SelectedNetworkControllerSetNetworkClientIdForDomainAction
  | AddApprovalRequest;

export type QueuedRequestMiddlewareMessenger = ControllerMessenger<
  QueuedRequestControllerEnqueueRequestAction | MiddlewareAllowedActions,
  never
>;

export type QueuedRequestMiddlewareJsonRpcRequest = JsonRpcRequest & {
  networkClientId?: NetworkClientId;
  origin?: string;
};

const isConfirmationMethod = (method: string) => {
  const confirmationMethods = [
    'eth_sendTransaction',
    'wallet_watchAsset',
    'wallet_switchEthereumChain',
    'eth_signTypedData_v4',
    'wallet_addEthereumChain',
    'wallet_requestPermissions',
    'wallet_requestSnaps',
    'personal_sign',
    'eth_sign',
    'eth_requestAccounts',
  ];

  return confirmationMethods.includes(method);
};

/**
 * Creates a JSON-RPC middleware for handling queued requests. This middleware
 * intercepts JSON-RPC requests, checks if they require queueing, and manages
 * their execution based on the specified options.
 *
 * @param options - Configuration options.
 * @param options.messenger - A controller messenger used for communication with various controllers.
 * @param options.useRequestQueue - A function that determines if the request queue feature is enabled.
 * @returns The JSON-RPC middleware that manages queued requests.
 */
export const createQueuedRequestMiddleware = ({
  messenger,
  useRequestQueue,
}: {
  messenger: QueuedRequestMiddlewareMessenger;
  useRequestQueue: () => boolean;
}): JsonRpcMiddleware<JsonRpcParams, Json> => {
  return createAsyncMiddleware(
    async (req: QueuedRequestMiddlewareJsonRpcRequest, res, next) => {
      const { origin, networkClientId: networkClientIdForRequest } = req;

      if (!origin) {
        throw new Error("Request object is lacking an 'origin'");
      }

      if (!networkClientIdForRequest) {
        throw new Error("Request object is lacking a 'networkClientId'");
      }

      // if the request queue feature is turned off, or this method is not a confirmation method
      // do nothing
      if (!useRequestQueue() || !isConfirmationMethod(req.method)) {
        next();
        return;
      }

      await messenger.call(
        QueuedRequestControllerActionTypes.enqueueRequest,
        async () => {
          if (
            req.method === 'wallet_switchEthereumChain' ||
            req.method === 'wallet_addEthereumChain'
          ) {
            return next();
          }

          const networkClientConfigurationForRequest = messenger.call(
            'NetworkController:getNetworkClientById',
            networkClientIdForRequest,
          ).configuration;

          const networkControllerState = messenger.call(
            'NetworkController:getState',
          );

          const isBuiltIn = isNetworkType(networkClientIdForRequest);
          let networkConfigurationForRequest;
          if (!isBuiltIn) {
            networkConfigurationForRequest =
              networkControllerState.networkConfigurations[
                networkClientIdForRequest
              ];
          } else {
            // if its a built in
            // Ideally we should be using only networkConfigurations, and networkClientIds &
            // networkConfiguration.id should be the same thing.
            networkConfigurationForRequest =
              networkClientConfigurationForRequest;
          }

          const currentProviderConfig = networkControllerState.providerConfig;
          const currentChainId = currentProviderConfig.chainId;

          // if the 'globally selected network' is already on the correct chain for the request currently being processed
          // continue with the request as normal.
          if (currentChainId === networkConfigurationForRequest.chainId) {
            return next();
          }

          // todo once we have 'batches':
          // if is switch eth chain call
          // clear request queue when the switch ethereum chain call completes (success, but maybe not if it fails?)
          // This is because a dapp-requested switch ethereum chain invalidates any requests they've made after this switch, since we dont know if they were expecting the chain after the switch or before.
          // with the queue batching approach, this would mean clearing any batch for that origin (batches being per-origin.)
          const requestData = {
            toNetworkConfiguration: networkConfigurationForRequest,
            fromNetworkConfiguration: currentProviderConfig,
          };

          try {
            await messenger.call(
              'ApprovalController:addRequest',
              {
                origin,
                type: ApprovalType.SwitchEthereumChain,
                requestData,
              },
              true,
            );

            await messenger.call(
              `NetworkController:setActiveNetwork`,
              networkClientIdForRequest,
            );

            messenger.call(
              SelectedNetworkControllerActionTypes.setNetworkClientIdForDomain,
              origin,
              networkClientIdForRequest,
            );
          } catch (error) {
            res.error = serializeError(error);
            return error;
          }

          return next();
        },
      );
    },
  );
};
