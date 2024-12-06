import { USER_STORAGE_FEATURE_NAMES } from '../../../shared/storage-schema';
import type { UserStorageBaseOptions } from '../services';
import {
  batchUpsertUserStorage,
  getUserStorageAllFeatureEntries,
  upsertUserStorage,
} from '../services';
import type { RemoteNetworkConfiguration } from './types';

// TODO - parse type, and handle version changes
/**
 * parses the raw remote data to the NetworkConfiguration shape
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
 * @param opts - user storage options/configuration
 * @returns array of all remote networks
 */
export async function getAllRemoteNetworks(
  opts: UserStorageBaseOptions,
): Promise<RemoteNetworkConfiguration[]> {
  const rawResults =
    (await getUserStorageAllFeatureEntries({
      ...opts,
      path: USER_STORAGE_FEATURE_NAMES.networks,
    })) ?? [];

  const results = rawResults
    .map((rawData) => parseNetworkConfiguration(rawData))
    .filter(isDefined);

  return results;
}

/**
 * Upserts a remote network to user storage
 * @param network - network we are updating or inserting
 * @param opts - user storage options/configuration
 */
export async function upsertRemoteNetwork(
  network: RemoteNetworkConfiguration,
  opts: UserStorageBaseOptions,
) {
  const chainId: string = network.chainId.toString();
  const data = JSON.stringify(network);
  return await upsertUserStorage(data, {
    ...opts,
    path: `networks.${chainId}`,
  });
}

/**
 * Batch upsert a list of remote networks into user storage
 * @param networks - a list of networks to update or insert
 * @param opts - user storage options/configuration
 */
export async function batchUpsertRemoteNetworks(
  networks: RemoteNetworkConfiguration[],
  opts: UserStorageBaseOptions,
): Promise<void> {
  const networkPathAndValues = networks.map((n) => {
    const path = n.chainId;
    const data = JSON.stringify(n);
    return [path, data] as [string, string];
  });

  await batchUpsertUserStorage(networkPathAndValues, {
    path: 'networks',
    ...opts,
  });
}
