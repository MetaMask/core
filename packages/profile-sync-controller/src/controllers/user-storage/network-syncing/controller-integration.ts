import log from 'loglevel';

import type { UserStorageBaseOptions } from '../services';
import type { UserStorageControllerMessenger } from '../UserStorageController';
import { getAllRemoteNetworks } from './services';
import { findNetworksToUpdate } from './sync-all';
import { batchUpdateNetworks, deleteNetwork } from './sync-mutations';

type StartNetworkSyncingProps = {
  messenger: UserStorageControllerMessenger;
  getStorageConfig: () => Promise<UserStorageBaseOptions | null>;
  isMutationSyncBlocked: () => boolean;
};

type PerformMainNetworkSyncProps = {
  messenger: UserStorageControllerMessenger;
  getStorageConfig: () => Promise<UserStorageBaseOptions | null>;
  onNetworkAdded?: (chainId: string) => void;
  onNetworkUpdated?: (chainId: string) => void;
  onNetworkRemoved?: (chainId: string) => void;
};

/**
 * Global in-mem cache to signify that the network syncing is in progress
 * Ensures that listeners do not fire during main sync (prevent double requests)
 */
// Exported to help testing
// eslint-disable-next-line import/no-mutable-exports
export let isMainNetworkSyncInProgress = false;

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
export function startNetworkSyncing(props: StartNetworkSyncingProps) {
  const { messenger, getStorageConfig, isMutationSyncBlocked } = props;
  try {
    messenger.subscribe(
      'NetworkController:networkRemoved',
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async (networkConfiguration) => {
        try {
          // If blocked (e.g. we have not yet performed a main-sync), then we should not perform any mutations
          if (isMutationSyncBlocked()) {
            return;
          }

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
export async function performMainNetworkSync(
  props: PerformMainNetworkSyncProps,
) {
  const { messenger, getStorageConfig } = props;

  // Edge-Case, we do not want to re-run the main-sync if it already is in progress
  /* istanbul ignore if - this is not testable */
  if (isMainNetworkSyncInProgress) {
    return;
  }

  isMainNetworkSyncInProgress = true;
  try {
    const opts = await getStorageConfig();
    if (!opts) {
      return;
    }

    const networkControllerState = messenger.call('NetworkController:getState');
    const localNetworks = Object.values(
      networkControllerState.networkConfigurationsByChainId ?? {},
    );

    const remoteNetworks = await getAllRemoteNetworks(opts);
    const networkChanges = findNetworksToUpdate({
      localNetworks,
      remoteNetworks,
    });

    log.debug('performMainNetworkSync() - Network Syncing Started', {
      localNetworks,
      remoteNetworks,
      networkChanges,
    });

    // Update Remote
    if (
      networkChanges?.remoteNetworksToUpdate &&
      networkChanges.remoteNetworksToUpdate.length > 0
    ) {
      await batchUpdateNetworks(networkChanges?.remoteNetworksToUpdate, opts);
    }

    // Add missing local networks
    if (
      networkChanges?.missingLocalNetworks &&
      networkChanges.missingLocalNetworks.length > 0
    ) {
      const errors: unknown[] = [];
      networkChanges.missingLocalNetworks.forEach((n) => {
        try {
          messenger.call('NetworkController:addNetwork', n);
          props.onNetworkAdded?.(n.chainId);
        } catch (e) {
          /* istanbul ignore next - allocates logs, do not need to test */
          errors.push(e);
          // Silently fail, we can try this again on next main sync
        }
      });

      /* istanbul ignore if - only logs errors, not useful to test */
      if (errors.length > 0) {
        log.error(
          'performMainNetworkSync() - NetworkController:addNetwork failures',
          errors,
        );
      }
    }

    // Update local networks
    if (
      networkChanges?.localNetworksToUpdate &&
      networkChanges.localNetworksToUpdate.length > 0
    ) {
      const errors: unknown[] = [];
      for (const n of networkChanges.localNetworksToUpdate) {
        try {
          await messenger.call(
            'NetworkController:dangerouslySetNetworkConfiguration',
            n,
          );
          props.onNetworkUpdated?.(n.chainId);
        } catch (e) {
          /* istanbul ignore next - allocates logs, do not need to test */
          errors.push(e);
          // Silently fail, we can try this again on next main sync
        }
      }

      /* istanbul ignore if - only logs errors, not useful to test */
      if (errors.length > 0) {
        log.error(
          'performMainNetworkSync() - NetworkController:dangerouslySetNetworkConfiguration failed',
          errors,
        );
      }
    }

    // Remove local networks
    if (
      networkChanges?.localNetworksToRemove &&
      networkChanges.localNetworksToRemove.length > 0
    ) {
      const errors: unknown[] = [];
      networkChanges.localNetworksToRemove.forEach((n) => {
        try {
          messenger.call('NetworkController:removeNetwork', n.chainId);
          props.onNetworkRemoved?.(n.chainId);
        } catch (e) {
          /* istanbul ignore next - allocates logs, do not need to test */
          errors.push(e);
          // Silently fail, we can try this again on next main sync
        }
      });

      /* istanbul ignore if - only logs errors, not useful to test */
      if (errors.length > 0) {
        log.error(
          'performMainNetworkSync() - NetworkController:removeNetwork failed',
          errors,
        );
      }
    }
  } catch (e) {
    /* istanbul ignore next - only logs errors, not useful to test */
    log.error('performMainNetworkSync() failed', e);
    // Silently fail sync
  } finally {
    isMainNetworkSyncInProgress = false;
  }
}
