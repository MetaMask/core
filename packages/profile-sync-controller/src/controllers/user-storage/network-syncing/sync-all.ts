import type { NetworkConfiguration } from '@metamask/network-controller';

import { setDifference, setIntersection } from '../utils';
import {
  toRemoteNetworkConfiguration,
  type RemoteNetworkConfiguration,
  toNetworkConfiguration,
} from './types';

type FindNetworksToUpdateProps = {
  localNetworks: NetworkConfiguration[];
  remoteNetworks: RemoteNetworkConfiguration[];
};

const createMap = <
  Network extends NetworkConfiguration | RemoteNetworkConfiguration,
>(
  networks: Network[],
): Map<string, Network> => {
  return new Map(networks.map((n) => [n.chainId, n]));
};

const createKeySet = <
  Network extends NetworkConfiguration | RemoteNetworkConfiguration,
>(
  networks: Network[],
  predicate?: (n: Network) => boolean,
): Set<string> => {
  const filteredNetworks = predicate
    ? networks.filter((n) => predicate(n))
    : networks;
  return new Set(filteredNetworks.map((n) => n.chainId));
};

export const getDataStructures = (
  localNetworks: NetworkConfiguration[],
  remoteNetworks: RemoteNetworkConfiguration[],
) => {
  const localMap = createMap(localNetworks);
  const remoteMap = createMap(remoteNetworks);
  const localKeySet = createKeySet(localNetworks);
  const remoteKeySet = createKeySet(remoteNetworks);
  const existingRemoteKeySet = createKeySet(remoteNetworks, (n) => !n.d);

  return {
    localMap,
    remoteMap,
    localKeySet,
    remoteKeySet,
    existingRemoteKeySet,
  };
};

type MatrixResult = 'Do Nothing' | 'Local Wins' | 'Remote Wins';
export const checkWhichNetworkIsLatest = (
  localNetwork: NetworkConfiguration,
  remoteNetwork: RemoteNetworkConfiguration,
): MatrixResult => {
  // Neither network has updatedAt field (indicating no changes were made)
  if (!localNetwork.lastUpdatedAt && !remoteNetwork.lastUpdatedAt) {
    return 'Do Nothing';
  }

  // Local only has updatedAt field
  if (localNetwork.lastUpdatedAt && !remoteNetwork.lastUpdatedAt) {
    return 'Local Wins';
  }

  // Remote only has updatedAt field
  if (!localNetwork.lastUpdatedAt && remoteNetwork.lastUpdatedAt) {
    return 'Remote Wins';
  }

  // Both have updatedAt field, perform comparison
  if (localNetwork.lastUpdatedAt && remoteNetwork.lastUpdatedAt) {
    if (localNetwork.lastUpdatedAt === remoteNetwork.lastUpdatedAt) {
      return 'Do Nothing';
    }

    return localNetwork.lastUpdatedAt > remoteNetwork.lastUpdatedAt
      ? 'Local Wins'
      : 'Remote Wins';
  }

  // Unreachable statement
  /* istanbul ignore next */
  return 'Do Nothing';
};

export const getMissingNetworkLists = (
  ds: ReturnType<typeof getDataStructures>,
) => {
  const {
    localKeySet,
    localMap,
    remoteKeySet,
    remoteMap,
    existingRemoteKeySet,
  } = ds;

  const missingLocalNetworks: NetworkConfiguration[] = [];
  const missingRemoteNetworks: RemoteNetworkConfiguration[] = [];

  // Networks that are in local, but not in remote
  const missingRemoteNetworkKeys = setDifference(localKeySet, remoteKeySet);
  missingRemoteNetworkKeys.forEach((chain) => {
    const n = localMap.get(chain);
    if (n) {
      missingRemoteNetworks.push(toRemoteNetworkConfiguration(n));
    }
  });

  // Networks that are in remote (not deleted), but not in local
  const missingLocalNetworkKeys = setDifference(
    existingRemoteKeySet,
    localKeySet,
  );
  missingLocalNetworkKeys.forEach((chain) => {
    const n = remoteMap.get(chain);
    if (n) {
      missingLocalNetworks.push(toNetworkConfiguration(n));
    }
  });

  return {
    missingLocalNetworks,
    missingRemoteNetworks,
  };
};

export const getUpdatedNetworkLists = (
  ds: ReturnType<typeof getDataStructures>,
) => {
  const { localKeySet, localMap, remoteKeySet, remoteMap } = ds;

  const remoteNetworksToUpdate: RemoteNetworkConfiguration[] = [];
  const localNetworksToUpdate: NetworkConfiguration[] = [];
  const localNetworksToRemove: NetworkConfiguration[] = [];

  // Get networks in both, these need to be compared against
  // each other to see which network to update.
  const networksInBoth = setIntersection(localKeySet, remoteKeySet);
  networksInBoth.forEach((chain) => {
    const localNetwork = localMap.get(chain);
    const remoteNetwork = remoteMap.get(chain);
    if (!localNetwork || !remoteNetwork) {
      // This should be unreachable as we know the Maps created will have the values
      // This is to satisfy types
      /* istanbul ignore next */
      return;
    }

    const whichIsLatest = checkWhichNetworkIsLatest(
      localNetwork,
      remoteNetwork,
    );

    // Local Wins -> Need to update remote
    if (whichIsLatest === 'Local Wins') {
      remoteNetworksToUpdate.push(toRemoteNetworkConfiguration(localNetwork));
    }

    // Remote Wins...
    if (whichIsLatest === 'Remote Wins') {
      if (remoteNetwork.d) {
        // ...and is deleted -> Need to remove from local list
        localNetworksToRemove.push(toNetworkConfiguration(remoteNetwork));
      } else {
        // ...and isn't deleted -> Need to update local list
        localNetworksToUpdate.push(toNetworkConfiguration(remoteNetwork));
      }
    }
  });

  return {
    remoteNetworksToUpdate,
    localNetworksToUpdate,
    localNetworksToRemove,
  };
};

export const findNetworksToUpdate = (props: FindNetworksToUpdateProps) => {
  try {
    const { localNetworks, remoteNetworks } = props;

    // Get Maps & Key Sets
    const ds = getDataStructures(localNetworks, remoteNetworks);

    // Calc Missing Networks
    const missingNetworks = getMissingNetworkLists(ds);

    // Calc Updated Networks
    const updatedNetworks = getUpdatedNetworkLists(ds);

    // List of networks we need to update
    const remoteNetworksToUpdate = [
      ...missingNetworks.missingRemoteNetworks,
      ...updatedNetworks.remoteNetworksToUpdate,
    ];

    return {
      remoteNetworksToUpdate,
      missingLocalNetworks: missingNetworks.missingLocalNetworks,
      localNetworksToRemove: updatedNetworks.localNetworksToRemove,
      localNetworksToUpdate: updatedNetworks.localNetworksToUpdate,
    };
  } catch {
    // Unable to perform sync, silently fail
  }

  // Unreachable statement
  /* istanbul ignore next */
  return undefined;
};
