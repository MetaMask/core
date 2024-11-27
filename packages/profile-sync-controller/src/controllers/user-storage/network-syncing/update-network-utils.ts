import {
  RpcEndpointType,
  type UpdateNetworkFields,
} from '@metamask/network-controller';

import { setDifference } from '../utils';
import type { NetworkConfiguration } from './types';

/**
 * Will map the network configuration we want to update into something valid that `updateNetwork` accepts
 * Exported for testability
 *
 * @param props - properties
 * @param props.originalNetworkConfiguration - original network configuration we will override
 * @param props.newNetworkConfiguration - new network configuration
 * @returns NetworkConfiguration to dispatch to `NetworkController:updateNetwork`
 */
export const getMappedNetworkConfiguration = (props: {
  originalNetworkConfiguration: NetworkConfiguration;
  newNetworkConfiguration: NetworkConfiguration;
}): UpdateNetworkFields => {
  const { originalNetworkConfiguration, newNetworkConfiguration } = props;

  // Map of URL <> clientId (url is unique)
  const originalRPCUrlMap = new Map(
    originalNetworkConfiguration.rpcEndpoints.map(
      (r) => [r.url, r.networkClientId] as const,
    ),
  );

  const updateNetworkConfig = newNetworkConfiguration as UpdateNetworkFields;

  updateNetworkConfig.rpcEndpoints = updateNetworkConfig.rpcEndpoints.map(
    (r) => {
      const originalRPCClientId = originalRPCUrlMap.get(r.url);

      // This is an existing RPC, so use the clients networkClientId
      if (originalRPCClientId) {
        r.networkClientId = originalRPCClientId;
        return r;
      }

      // This is a new RPC, so remove the remote networkClientId
      r.networkClientId = undefined;
      return r;
    },
  );

  return updateNetworkConfig;
};

/**
 * Will insert any missing infura RPCs, as we cannot remove infura RPC
 * Exported for testability
 * @param props - properties
 * @param props.originalNetworkConfiguration - original network configuration
 * @param props.updateNetworkConfiguration - the updated network configuration to use when dispatching `NetworkController:updateNetwork`
 * @returns mutates and returns the updateNetworkConfiguration
 */
export const appendMissingInfuraNetworks = (props: {
  originalNetworkConfiguration: NetworkConfiguration;
  updateNetworkConfiguration: UpdateNetworkFields;
}) => {
  const { originalNetworkConfiguration, updateNetworkConfiguration } = props;

  // Ensure we have not removed any infura networks (and add them back if they were removed)
  const origInfuraRPCMap = new Map(
    originalNetworkConfiguration.rpcEndpoints
      .filter((r) => r.type === RpcEndpointType.Infura)
      .map((r) => [r.networkClientId, r] as const),
  );
  const newInfuraRPCMap = new Map(
    updateNetworkConfiguration.rpcEndpoints
      .filter((r) => r.type === RpcEndpointType.Infura && r.networkClientId)
      .map((r) => [r.networkClientId as string, r]),
  );
  const missingOrigInfuraRPCs = setDifference(
    new Set(origInfuraRPCMap.keys()),
    new Set(newInfuraRPCMap.keys()),
  );

  if (missingOrigInfuraRPCs.size > 0) {
    const missingRPCs: UpdateNetworkFields['rpcEndpoints'] = [];
    missingOrigInfuraRPCs.forEach((clientId) => {
      missingRPCs.push(
        origInfuraRPCMap.get(
          clientId,
        ) as UpdateNetworkFields['rpcEndpoints'][number],
      );
    });

    updateNetworkConfiguration.rpcEndpoints.unshift(...missingRPCs);
  }

  return updateNetworkConfiguration;
};

/**
 * The `NetworkController:updateNetwork` method will require us to pass in a `replacementSelectedRpcEndpointIndex` if the selected RPC is removed or modified
 * @param props - properties
 * @param props.originalNetworkConfiguration - the original network configuration
 * @param props.updateNetworkConfiguration - the new network configuration we will use to update
 * @param props.selectedNetworkClientId - the NetworkController's selected network id.
 * @returns the new RPC index if it needs modification
 */
export const getNewRPCIndex = (props: {
  originalNetworkConfiguration: NetworkConfiguration;
  updateNetworkConfiguration: UpdateNetworkFields;
  selectedNetworkClientId: string;
}) => {
  const {
    originalNetworkConfiguration,
    updateNetworkConfiguration,
    selectedNetworkClientId,
  } = props;

  const isRPCInNewList = updateNetworkConfiguration.rpcEndpoints.some(
    (r) => r.networkClientId === selectedNetworkClientId,
  );
  const isRPCInOldList = originalNetworkConfiguration.rpcEndpoints.some(
    (r) => r.networkClientId === selectedNetworkClientId,
  );

  const getAnyRPCIndex = () =>
    Math.max(
      updateNetworkConfiguration.rpcEndpoints.findIndex((r) =>
        Boolean(r.networkClientId),
      ),
      0,
    );

  // We have removed the selected RPC, so we must point to a new RPC index
  if (isRPCInOldList && !isRPCInNewList) {
    // Try finding an existing index, or default to first RPC.
    const newIndex = getAnyRPCIndex();
    return newIndex;
  }

  // We have updated the selected RPC, so we must point to the same RPC index (or a new one)
  if (isRPCInOldList && isRPCInNewList) {
    const existingIndex = updateNetworkConfiguration.rpcEndpoints.findIndex(
      (r) => r.networkClientId === selectedNetworkClientId,
    );
    /* istanbul ignore next - the `getAnyRPCIndex` should not be reachable since this is an existing network */
    return existingIndex !== -1 ? existingIndex : getAnyRPCIndex();
  }

  return undefined;
};

/**
 * create the correct `NetworkController:updateNetwork` parameters
 * @param props - properties
 * @param props.originalNetworkConfiguration - original config
 * @param props.newNetworkConfiguration - new config (from remote)
 * @param props.selectedNetworkClientId - the current selected network client id
 * @returns parameters to be used for `NetworkController:updateNetwork` call
 */
export const createUpdateNetworkProps = (props: {
  originalNetworkConfiguration: NetworkConfiguration;
  newNetworkConfiguration: NetworkConfiguration;
  selectedNetworkClientId: string;
}) => {
  const {
    originalNetworkConfiguration,
    newNetworkConfiguration,
    selectedNetworkClientId,
  } = props;

  // The `NetworkController:updateNetwork` has a strict set of rules to follow
  // New RPCs that we are adding must not have a networkClientId
  // Existing RPCs must point to the correct networkClientId (so we must convert and use this client clientIds set)
  // Removing RPCs are omitted from the list
  // We cannot remove infura RPCs - so ensure that they stay populated
  // If we are removing a selected RPC - then we need to provide `replacementSelectedRpcEndpointIndex` to an index in the new list
  // If we are updating a selected RPC - then we need to provide `replacementSelectedRpcEndpointIndex` to the index in the new list

  const mappedNetworkConfiguration = getMappedNetworkConfiguration({
    originalNetworkConfiguration,
    newNetworkConfiguration,
  });

  appendMissingInfuraNetworks({
    originalNetworkConfiguration,
    updateNetworkConfiguration: mappedNetworkConfiguration,
  });

  const updatedRPCIndex = getNewRPCIndex({
    originalNetworkConfiguration,
    updateNetworkConfiguration: mappedNetworkConfiguration,
    selectedNetworkClientId,
  });

  return {
    updateNetworkFields: mappedNetworkConfiguration,
    newSelectedRpcEndpointIndex: updatedRPCIndex,
  };
};
