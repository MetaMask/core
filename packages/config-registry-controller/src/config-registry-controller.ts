import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  KeyringControllerGetStateAction,
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';

import type { NetworkConfig } from './config-registry-api-service/config-registry-api-service';
import type { ConfigRegistryApiServiceFetchConfigAction } from './config-registry-api-service/config-registry-api-service-method-action-types';
import type { ConfigRegistryControllerMethodActions } from './config-registry-controller-method-action-types';

// === GENERAL ===

/**
 * The name of the {@link ConfigRegistryController}, used to namespace the
 * controller's actions and events and to namespace the controller's state data
 * when composed with other controllers.
 */
export const controllerName = 'ConfigRegistryController';

// === STATE ===

/**
 * A network entry in the config registry state.
 */
export type NetworkEntry = {
  key: string;
  value: NetworkConfig;
};

/**
 * The configs object in the controller state.
 */
export type ConfigsState = {
  networks: Record<string, NetworkEntry>;
};

/**
 * Describes the shape of the state object for {@link ConfigRegistryController}.
 */
export type ConfigRegistryControllerState = {
  /**
   * The configs fetched from the registry API.
   */
  configs: ConfigsState;
  /**
   * The version of the config from the API.
   */
  version: string | null;
  /**
   * The timestamp of the last successful fetch.
   */
  lastFetched: number | null;
  /**
   * The error message if the last fetch failed.
   */
  fetchError: string | null;
  /**
   * The ETag from the last successful fetch.
   */
  etag: string | null;
};

/**
 * The metadata for each property in {@link ConfigRegistryControllerState}.
 */
const configRegistryControllerMetadata = {
  configs: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  version: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: true,
  },
  lastFetched: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: true,
    usedInUi: false,
  },
  fetchError: {
    includeInDebugSnapshot: false,
    includeInStateLogs: true,
    persist: false,
    usedInUi: false,
  },
  etag: {
    includeInDebugSnapshot: false,
    includeInStateLogs: false,
    persist: true,
    usedInUi: false,
  },
} satisfies StateMetadata<ConfigRegistryControllerState>;

/**
 * Constructs the default {@link ConfigRegistryController} state.
 *
 * @returns The default {@link ConfigRegistryController} state.
 */
export function getDefaultConfigRegistryControllerState(): ConfigRegistryControllerState {
  return {
    configs: {
      networks: {},
    },
    version: null,
    lastFetched: null,
    fetchError: null,
    etag: null,
  };
}

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = ['updateConfigs'] as const;

/**
 * Retrieves the state of the {@link ConfigRegistryController}.
 */
export type ConfigRegistryControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ConfigRegistryControllerState
>;

/**
 * Actions that {@link ConfigRegistryController} exposes to other consumers.
 */
export type ConfigRegistryControllerActions =
  | ConfigRegistryControllerGetStateAction
  | ConfigRegistryControllerMethodActions;

/**
 * Actions from other messengers that {@link ConfigRegistryControllerMessenger} calls.
 */
type AllowedActions =
  | KeyringControllerGetStateAction
  | ConfigRegistryApiServiceFetchConfigAction;

/**
 * Published when the state of {@link ConfigRegistryController} changes.
 */
export type ConfigRegistryControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    ConfigRegistryControllerState
  >;

/**
 * Events that {@link ConfigRegistryController} exposes to other consumers.
 */
export type ConfigRegistryControllerEvents =
  ConfigRegistryControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ConfigRegistryController} subscribes to.
 */
type AllowedEvents = KeyringControllerLockEvent | KeyringControllerUnlockEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ConfigRegistryController}.
 */
export type ConfigRegistryControllerMessenger = Messenger<
  typeof controllerName,
  ConfigRegistryControllerActions | AllowedActions,
  ConfigRegistryControllerEvents | AllowedEvents
>;

// === CONTROLLER DEFINITION ===

// Polling input type - empty object since we don't need any input for polling
type PollingInput = Record<string, never>;

/**
 * `ConfigRegistryController` fetches and persists network configurations from
 * the config registry API. It supports polling and manages the lifecycle based
 * on the wallet lock state.
 */
export class ConfigRegistryController extends StaticIntervalPollingController<PollingInput>()<
  typeof controllerName,
  ConfigRegistryControllerState,
  ConfigRegistryControllerMessenger
> {
  /**
   * Whether the wallet is currently unlocked.
   */
  #isUnlocked = false;

  /**
   * The current polling token, used to stop polling when needed.
   */
  #pollingToken: string | null = null;

  /**
   * Function to check if the config registry API feature flag is enabled.
   */
  readonly #isFeatureFlagEnabled: () => boolean;

  /**
   * Constructs a new {@link ConfigRegistryController}.
   *
   * @param args - The constructor arguments.
   * @param args.messenger - The messenger suited for this controller.
   * @param args.state - The desired state with which to initialize this controller.
   * @param args.pollingInterval - The interval in milliseconds at which to poll.
   * @param args.isFeatureFlagEnabled - Function to check if the feature flag is enabled.
   */
  constructor({
    messenger,
    state,
    pollingInterval = 60000,
    isFeatureFlagEnabled = (): boolean => true,
  }: {
    messenger: ConfigRegistryControllerMessenger;
    state?: Partial<ConfigRegistryControllerState>;
    pollingInterval?: number;
    isFeatureFlagEnabled?: () => boolean;
  }) {
    super({
      messenger,
      metadata: configRegistryControllerMetadata,
      name: controllerName,
      state: {
        ...getDefaultConfigRegistryControllerState(),
        ...state,
      },
    });

    this.#isFeatureFlagEnabled = isFeatureFlagEnabled;
    this.setIntervalLength(pollingInterval);

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );

    // Check initial lock state
    const { isUnlocked } = this.messenger.call('KeyringController:getState');
    this.#isUnlocked = isUnlocked;

    // Start polling if unlocked
    if (this.#isUnlocked) {
      this.#startPollingIfNeeded();
    }

    // Subscribe to lock/unlock events
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.#isUnlocked = true;
      this.#startPollingIfNeeded();
    });

    this.messenger.subscribe('KeyringController:lock', () => {
      this.#isUnlocked = false;
      this.#stopPollingIfNeeded();
    });
  }

  /**
   * Starts polling if not already polling.
   */
  #startPollingIfNeeded(): void {
    if (this.#pollingToken === null) {
      this.#pollingToken = this.startPolling({});
    }
  }

  /**
   * Stops polling if currently polling.
   */
  #stopPollingIfNeeded(): void {
    if (this.#pollingToken !== null) {
      this.stopPollingByPollingToken(this.#pollingToken);
      this.#pollingToken = null;
    }
  }

  /**
   * Execute a poll iteration. This is called by the polling controller.
   *
   * @param _input - The polling input (unused).
   */
  async _executePoll(_input: PollingInput): Promise<void> {
    await this.updateConfigs();
  }

  /**
   * Fetches the latest configuration from the API and updates the state.
   */
  async updateConfigs(): Promise<void> {
    // Check feature flag first
    if (!this.#isFeatureFlagEnabled()) {
      return;
    }

    const now = Date.now();

    try {
      const result = await this.messenger.call(
        'ConfigRegistryApiService:fetchConfig',
      );

      // If cached, only update lastFetched and clear error
      if (result.cached) {
        this.update((state) => {
          state.lastFetched = now;
          state.etag = result.etag;
          state.fetchError = null;
        });
        return;
      }

      // Filter networks: keep featured and active, drop testnet
      const filteredNetworks = result.data.networks.filter(
        (network) =>
          (network.isFeatured || network.isActive) && !network.isTestnet,
      );

      // Build networks map, handling duplicates by keeping highest priority
      const networksMap: Record<string, NetworkEntry> = {};
      for (const network of filteredNetworks) {
        const existing = networksMap[network.chainId];
        if (!existing || network.priority > existing.value.priority) {
          networksMap[network.chainId] = {
            key: network.chainId,
            value: network,
          };
        }
      }

      this.update((state) => {
        state.configs.networks = networksMap;
        state.version = result.data.version;
        state.lastFetched = now;
        state.etag = result.etag;
        state.fetchError = null;
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.update((state) => {
        state.fetchError = errorMessage;
        state.lastFetched = now;
      });
    }
  }
}
