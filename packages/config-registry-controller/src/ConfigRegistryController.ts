import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  StateMetadata,
} from '@metamask/base-controller';
import type {
  KeyringControllerLockEvent,
  KeyringControllerUnlockEvent,
} from '@metamask/keyring-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { Json } from '@metamask/utils';

import type {
  FetchConfigOptions,
  FetchConfigResult,
  NetworkConfig,
} from './config-registry-api-service';
import { filterNetworks } from './config-registry-api-service';
import { isConfigRegistryApiEnabled } from './utils/feature-flags';

const controllerName = 'ConfigRegistryController';

export const DEFAULT_POLLING_INTERVAL = inMilliseconds(1, Duration.Day);

export type RegistryConfigEntry = {
  key: string;
  value: Json;
  metadata?: Json;
};

export type NetworkConfigEntry = {
  key: string;
  value: NetworkConfig;
  metadata?: Json;
};

export type ConfigRegistryState = {
  configs: {
    networks?: Record<string, NetworkConfigEntry>;
  };
  version: string | null;
  lastFetched: number | null;
  fetchError: string | null;
  etag: string | null;
};

const stateMetadata = {
  configs: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  version: {
    persist: true,
    includeInStateLogs: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  lastFetched: {
    persist: true,
    includeInStateLogs: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  fetchError: {
    persist: true,
    includeInStateLogs: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  etag: {
    persist: true,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
} satisfies StateMetadata<ConfigRegistryState>;

const DEFAULT_FALLBACK_CONFIG: Record<string, NetworkConfigEntry> = {};

export type ConfigRegistryControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, ConfigRegistryState>;

export type ConfigRegistryControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ConfigRegistryState
>;

export type ConfigRegistryControllerStartPollingAction = {
  type: `${typeof controllerName}:startPolling`;
  handler: (input: null) => string;
};

export type ConfigRegistryControllerStopPollingAction = {
  type: `${typeof controllerName}:stopPolling`;
  handler: () => void;
};

export type ConfigRegistryControllerActions =
  | ConfigRegistryControllerGetStateAction
  | ConfigRegistryControllerStartPollingAction
  | ConfigRegistryControllerStopPollingAction
  | {
      type: 'RemoteFeatureFlagController:getState';
      handler: () => RemoteFeatureFlagControllerState;
    }
  | {
      type: 'KeyringController:getState';
      handler: () => { isUnlocked: boolean };
    }
  | {
      type: 'ConfigRegistryApiService:fetchConfig';
      handler: (options?: FetchConfigOptions) => Promise<FetchConfigResult>;
    };

export type ConfigRegistryControllerEvents =
  | KeyringControllerUnlockEvent
  | KeyringControllerLockEvent
  | ConfigRegistryControllerStateChangeEvent;

export type ConfigRegistryMessenger = Messenger<
  typeof controllerName,
  ConfigRegistryControllerActions,
  ConfigRegistryControllerEvents
>;

export type ConfigRegistryControllerOptions = {
  messenger: ConfigRegistryMessenger;
  state?: Partial<ConfigRegistryState>;
  pollingInterval?: number;
  fallbackConfig?: Record<string, NetworkConfigEntry>;
};

export class ConfigRegistryController extends StaticIntervalPollingController<null>()<
  typeof controllerName,
  ConfigRegistryState,
  ConfigRegistryMessenger
> {
  readonly #fallbackConfig: Record<string, NetworkConfigEntry>;

  /**
   * @param options - The controller options.
   * @param options.messenger - The controller messenger. Must have
   * `ConfigRegistryApiService:fetchConfig` action handler registered.
   * @param options.state - Initial state.
   * @param options.pollingInterval - Polling interval in milliseconds.
   * @param options.fallbackConfig - Fallback configuration.
   */
  constructor({
    messenger,
    state = {},
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    fallbackConfig = DEFAULT_FALLBACK_CONFIG,
  }: ConfigRegistryControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: {
        configs: { networks: {} },
        version: null,
        lastFetched: null,
        fetchError: null,
        etag: null,
        ...state,
      },
    });

    this.setIntervalLength(pollingInterval);
    this.#fallbackConfig = fallbackConfig;

    this.messenger.registerActionHandler(
      `${controllerName}:startPolling`,
      (input: null) => this.startPolling(input),
    );

    this.messenger.registerActionHandler(`${controllerName}:stopPolling`, () =>
      this.stopPolling(),
    );

    this.#registerKeyringEventListeners();
  }

  async _executePoll(_input: null): Promise<void> {
    const isApiEnabled = isConfigRegistryApiEnabled(this.messenger);

    if (!isApiEnabled) {
      this.useFallbackConfig(
        'Feature flag disabled - using fallback configuration',
      );
      return;
    }

    // Check if enough time has passed since last fetch to respect the polling interval
    const pollingInterval =
      this.getIntervalLength() ?? DEFAULT_POLLING_INTERVAL;
    const now = Date.now();
    const { lastFetched } = this.state;

    if (lastFetched !== null && now - lastFetched < pollingInterval) {
      // Not enough time has passed, skip the fetch
      return;
    }

    try {
      const result: FetchConfigResult = await this.messenger.call(
        'ConfigRegistryApiService:fetchConfig',
        {
          etag: this.state.etag ?? undefined,
        },
      );

      if (result.notModified) {
        this.update((state) => {
          state.fetchError = null;
          if (result.etag !== undefined) {
            state.etag = result.etag ?? null;
          }
        });
        return;
      }

      // Validate API response structure to prevent runtime crashes
      if (
        !result.data?.data ||
        !Array.isArray(result.data.data.networks) ||
        typeof result.data.data.version !== 'string'
      ) {
        throw new Error(
          'Invalid response structure from config registry API: missing or malformed data',
        );
      }

      // Filter networks: only featured, active, non-testnet networks
      const filteredNetworks = filterNetworks(result.data.data.networks, {
        isFeatured: true,
        isActive: true,
        isTestnet: false,
      });

      const newConfigs: Record<string, NetworkConfigEntry> = {};
      for (const network of filteredNetworks) {
        newConfigs[network.chainId] = {
          key: network.chainId,
          value: network,
        };
      }

      this.update((state) => {
        (state.configs as ConfigRegistryState['configs']) = {
          networks: newConfigs,
        };
        state.version = result.data.data.version;
        state.lastFetched = Date.now();
        state.fetchError = null;
        state.etag = result.etag ?? null;
      });
    } catch (error) {
      const errorInstance =
        error instanceof Error ? error : new Error(String(error));

      if (this.messenger.captureException) {
        this.messenger.captureException(errorInstance);
      }

      this.#handleFetchError(error);
    }
  }

  protected useFallbackConfig(errorMessage?: string): void {
    this.update((state) => {
      (state.configs as ConfigRegistryState['configs']) = {
        networks: { ...this.#fallbackConfig },
      };
      state.fetchError =
        errorMessage ?? 'Using fallback configuration - API unavailable';
      state.etag = null;
    });
  }

  #handleFetchError(error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    const hasNoConfigs =
      Object.keys(this.state.configs?.networks ?? {}).length === 0;

    if (hasNoConfigs) {
      this.useFallbackConfig(errorMessage);
    } else {
      this.update((state) => {
        state.fetchError = errorMessage;
      });
    }
  }

  /**
   * Registers event listeners for KeyringController unlock/lock events.
   * Automatically starts polling when unlocked and stops when locked.
   */
  #registerKeyringEventListeners(): void {
    // Check initial unlock state and start polling if already unlocked
    try {
      const { isUnlocked } = this.messenger.call('KeyringController:getState');
      if (isUnlocked) {
        this.startPolling(null);
      }
    } catch {
      // KeyringController may not be available, silently handle
    }

    // Subscribe to unlock event - start polling
    this.messenger.subscribe('KeyringController:unlock', () => {
      this.startPolling(null);
    });

    // Subscribe to lock event - stop polling
    this.messenger.subscribe('KeyringController:lock', () => {
      this.stopPolling();
    });
  }

  startPolling(input: null = null): string {
    return super.startPolling(input);
  }

  stopPolling(): void {
    super.stopAllPolling();
  }
}
