import log from 'loglevel';

import type { UserStorageBaseOptions } from '../services';
import type { UserStorageControllerMessenger } from '../UserStorageController';
import { addNetwork, deleteNetwork, updateNetwork } from './sync';

type SetupNetworkSyncingProps = {
  messenger: UserStorageControllerMessenger;
  getStorageConfig: () => Promise<UserStorageBaseOptions>;
};

/**
 * Initialize and setup events to listen to for network syncing
 * @param props - parameters used for initializing and enabling network syncing
 */
export function startNetworkSyncing(props: SetupNetworkSyncingProps) {
  const { messenger, getStorageConfig } = props;

  try {
    messenger.subscribe(
      'NetworkController:networkAdded',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (networkConfiguration) => {
        try {
          const opts = await getStorageConfig();
          await addNetwork(networkConfiguration, opts);
        } catch {
          // Silently fail sync
        }
      },
    );
  } catch (e) {
    log.warn('NetworkSyncing, event subscription failed', e);
  }

  try {
    messenger.subscribe(
      'NetworkController:networkDeleted',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (networkConfiguration) => {
        try {
          const opts = await getStorageConfig();
          await deleteNetwork(networkConfiguration, opts);
        } catch {
          // Silently fail sync
        }
      },
    );
  } catch (e) {
    log.warn('NetworkSyncing, event subscription failed', e);
  }

  try {
    messenger.subscribe(
      'NetworkController:networkChanged',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (networkConfiguration) => {
        try {
          const opts = await getStorageConfig();
          await updateNetwork(networkConfiguration, opts);
        } catch {
          // Silently fail sync
        }
      },
    );
  } catch (e) {
    log.warn('NetworkSyncing, event subscription failed', e);
  }
}
