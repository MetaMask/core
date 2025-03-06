import type { RemoteNetworkConfiguration } from './types';
import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import type UserStorageController from '../UserStorageController';

// TODO - parse type, and handle version changes
/**
 * parses the raw remote data to the NetworkConfiguration shape
 *
 * @todo - improve parsing instead of asserting
 * @todo - improve version handling
 * @param rawData - raw remote user storage data
 * @returns NetworkConfiguration or undefined if failed to parse
 */
function parseNetworkConfiguration(rawData: string) {
  try {
    return JSON.parse(rawData) as RemoteNetworkConfiguration;
  } catch {
    return undefined;
  }
}

const isDefined = <Value>(value: Value | null | undefined): value is Value =>
  value !== undefined && value !== null;

/**
 * gets all remote networks from user storage
 *
 * @param serviceOptions - service options
 * @param serviceOptions.getUserStorageControllerInstance - function to get the user storage controller instance
 * @returns array of all remote networks
 */
export async function getAllRemoteNetworks(serviceOptions: {
  getUserStorageControllerInstance: () => UserStorageController;
}): Promise<RemoteNetworkConfiguration[]> {
  try {
    const rawResults =
      (await serviceOptions
        .getUserStorageControllerInstance()
        .performGetStorageAllFeatureEntries(
          USER_STORAGE_FEATURE_NAMES.networks,
        )) ?? [];

    const results = rawResults
      .map((rawData) => parseNetworkConfiguration(rawData))
      .filter(isDefined);

    return results;
  } catch {
    return [];
  }
}

/**
 * Upserts a remote network to user storage
 *
 * @param network - network we are updating or inserting
 * @param serviceOptions - service options
 * @param serviceOptions.getUserStorageControllerInstance - function to get the user storage controller instance
 * @returns void
 */
export async function upsertRemoteNetwork(
  network: RemoteNetworkConfiguration,
  serviceOptions: {
    getUserStorageControllerInstance: () => UserStorageController;
  },
) {
  const chainId: string = network.chainId.toString();
  const data = JSON.stringify(network);
  return await serviceOptions
    .getUserStorageControllerInstance()
    .performSetStorage(`networks.${chainId}`, data);
}

/**
 * Batch upsert a list of remote networks into user storage
 *
 * @param networks - a list of networks to update or insert
 * @param serviceOptions - service options
 * @param serviceOptions.getUserStorageControllerInstance - function to get the user storage controller instance
 */
export async function batchUpsertRemoteNetworks(
  networks: RemoteNetworkConfiguration[],
  serviceOptions: {
    getUserStorageControllerInstance: () => UserStorageController;
  },
): Promise<void> {
  const networkPathAndValues = networks.map((n) => {
    const path = n.chainId;
    const data = JSON.stringify(n);
    return [path, data] as [string, string];
  });

  await serviceOptions
    .getUserStorageControllerInstance()
    .performBatchSetStorage('networks', networkPathAndValues);
}
