import type { UserStorageBaseOptions } from '../services';
import { batchUpsertRemoteNetworks, upsertRemoteNetwork } from './services';
import type { NetworkConfiguration, RemoteNetworkConfiguration } from './types';

export const updateNetwork = async (
  network: NetworkConfiguration,
  opts: UserStorageBaseOptions,
) => {
  return await upsertRemoteNetwork({ v: '1', ...network, d: false }, opts);
};

export const addNetwork = updateNetwork;

export const deleteNetwork = async (
  network: NetworkConfiguration,
  opts: UserStorageBaseOptions,
) => {
  // we are soft deleting, as we need to consider devices that have not yet synced
  return await upsertRemoteNetwork({ v: '1', ...network, d: true }, opts);
};

export const batchUpdateNetworks = async (
  networks: (NetworkConfiguration & { deleted?: boolean })[],
  opts: UserStorageBaseOptions,
) => {
  const remoteNetworks: RemoteNetworkConfiguration[] = networks.map((n) => ({
    v: '1',
    ...n,
  }));
  return await batchUpsertRemoteNetworks(remoteNetworks, opts);
};
