import log from 'loglevel';

import type { UserStorageBaseOptions } from '../services';
import type { UserStorageControllerMessenger } from '../UserStorageController';
import { getAllRemoteNetworks } from './services';
import { findNetworksToUpdate } from './sync-all';
import { batchUpdateNetworks, deleteNetwork } from './sync-mutations';

type NetworkSyncingProps = {
  messenger: UserStorageControllerMessenger;
  getStorageConfig: () => Promise<UserStorageBaseOptions | null>;
};

/**
 * Global in-mem cache to signify that the network syncing is in progress
 * Ensures that listeners do not fire during main sync (prevent double requests)
 */
let isMainNetworkSyncInProgress = false;

/**
 * Initialize and setup events to listen to for network syncing
 * We will be listening to:
 * - Remove Event, to indicate that we need to remote network from remote
 *
 * We will not be listening to:
 * - Add/Update events are not required, as we can sync these during the main sync
 *
 * @param props - parameters used for initializing and enabling network syncing
 */
export function startNetworkSyncing(props: NetworkSyncingProps) {
  const { messenger, getStorageConfig } = props;
  try {
    messenger.subscribe(
      'NetworkController:networkRemoved',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (networkConfiguration) => {
        try {
          // As main sync is in progress, it will already local and remote networks
          // So no need to re-process again.
          if (isMainNetworkSyncInProgress) {
            return;
          }

          const opts = await getStorageConfig();
          if (!opts) {
            return;
          }
          await deleteNetwork(networkConfiguration, opts);
        } catch {
          // Silently fail sync
        }
      },
    );
  } catch (e) {
    log.warn('NetworkSyncing, event subscription failed', e);
  }
}

/**
 * Action to perform the main network sync.
 * It will fetch local networks and remote networks, then determines which networks (local and remote) to add/update
 * @param props - parameters used for this main sync
 */
export async function performMainNetworkSync(props: NetworkSyncingProps) {
  const { messenger, getStorageConfig } = props;
  isMainNetworkSyncInProgress = true;
  try {
    const opts = await getStorageConfig();
    if (!opts) {
      return;
    }

    const localNetworks = Object.values(
      messenger.call('NetworkController:getState')
        .networkConfigurationsByChainId ?? {},
    );

    const remoteNetworks = await getAllRemoteNetworks(opts);

    const networksToUpdate = findNetworksToUpdate({
      localNetworks,
      remoteNetworks,
    });

    // Update Remote
    if (networksToUpdate?.remoteNetworksToUpdate) {
      await batchUpdateNetworks(networksToUpdate?.remoteNetworksToUpdate, opts);
    }

    // Add missing local networks
    if (networksToUpdate?.missingLocalNetworks) {
      networksToUpdate.missingLocalNetworks.forEach((n) => {
        try {
          messenger.call('NetworkController:addNetwork', n);
        } catch {
          // Silently fail, we can try this again on next main sync
        }
      });
    }

    // Update local networks
    if (networksToUpdate?.localNetworksToUpdate) {
      const promises = networksToUpdate.localNetworksToUpdate.map(async (n) => {
        try {
          await messenger.call('NetworkController:updateNetwork', n.chainId, n);
        } catch {
          // Silently fail, we can try this again on next main sync
        }
      });
      await Promise.all(promises);
    }

    // Remove local networks
    if (networksToUpdate?.localNetworksToRemove) {
      networksToUpdate.localNetworksToRemove.forEach((n) => {
        try {
          messenger.call('NetworkController:removeNetwork', n.chainId);
        } catch {
          // Silently fail, we can try this again on next main sync
        }
      });
    }
  } catch {
    // Silently fail sync
  } finally {
    isMainNetworkSyncInProgress = false;
  }
}
