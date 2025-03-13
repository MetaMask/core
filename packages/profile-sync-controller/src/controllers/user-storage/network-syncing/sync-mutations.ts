import type { NetworkConfiguration } from '@metamask/network-controller';

import { batchUpsertRemoteNetworks, upsertRemoteNetwork } from './services';
import type { RemoteNetworkConfiguration } from './types';
import type UserStorageController from '../UserStorageController';

export const updateNetwork = async (
  network: NetworkConfiguration,
  opts: {
    getUserStorageControllerInstance: () => UserStorageController;
  },
) => {
  return await upsertRemoteNetwork({ v: '1', ...network, d: false }, opts);
};

export const addNetwork = updateNetwork;

export const deleteNetwork = async (
  network: NetworkConfiguration,
  opts: {
    getUserStorageControllerInstance: () => UserStorageController;
  },
) => {
  // we are soft deleting, as we need to consider devices that have not yet synced
  return await upsertRemoteNetwork(
    {
      v: '1',
      ...network,
      d: true,
      lastUpdatedAt: Date.now(), // Ensures that a deleted entry has a date field
    },
    opts,
  );
};

export const batchUpdateNetworks = async (
  networks: (NetworkConfiguration & { deleted?: boolean })[],
  opts: {
    getUserStorageControllerInstance: () => UserStorageController;
  },
) => {
  const remoteNetworks: RemoteNetworkConfiguration[] = networks.map((n) => ({
    v: '1',
    ...n,
  }));
  return await batchUpsertRemoteNetworks(remoteNetworks, opts);
};
