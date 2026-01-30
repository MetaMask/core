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
import { RemoteFeatureFlagControllerGetStateAction } from '@metamask/remote-feature-flag-controller';
import { Duration, inMilliseconds } from '@metamask/utils';
import type { Json } from '@metamask/utils';

import type {
  FetchConfigOptions,
  FetchConfigResult,
  RegistryNetworkConfig,
} from './config-registry-api-service';
import { filterNetworks } from './config-registry-api-service';
import { isConfigRegistryApiEnabled as defaultIsConfigRegistryApiEnabled } from './utils/feature-flags';
import { NetworkConfiguration } from '../../network-controller/src/NetworkController';

const controllerName = 'ConfigRegistryController';

export const DEFAULT_POLLING_INTERVAL = inMilliseconds(1, Duration.Day);

export type NetworkConfigEntry = {
  key: string;
  value: RegistryNetworkConfig;
  metadata?: Json;
};

/**
 * State for the ConfigRegistryController.
 *
 * Tracks network configurations fetched from the config registry API,
 * along with metadata about the fetch status and caching.
 */
export type ConfigRegistryState = {
  /**
   * Network configurations organized by chain ID.
   * Contains the actual network configuration data fetched from the API.
   */
  configs: {
    networks: Record<string, RegistryNetworkConfig>;
  };
  /**
   * Semantic version string of the configuration data from the API.
   * Indicates the version/schema of the configuration structure itself
   * (e.g., "v1.0.0", "1.0.0").
   * This is different from `etag` which is used for HTTP cache validation.
   */
  version: string | null;
  /**
   * Timestamp (milliseconds since epoch) of when the configuration
   * was last successfully fetched from the API.
   */
  lastFetched: number | null;
  /**
   * HTTP entity tag (ETag) used for cache validation.
   * Sent as `If-None-Match` header in subsequent requests to check
   * if the content has changed. If the server returns 304 Not Modified,
   * the full response body is not downloaded, improving efficiency.
   * This is different from `version` which is a semantic version string
   * indicating the schema/version of the configuration data itself.
   */
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
  handler: (token?: string) => void;
};

export type ConfigRegistryControllerActions =
  | ConfigRegistryControllerGetStateAction
  | ConfigRegistryControllerStartPollingAction
  | ConfigRegistryControllerStopPollingAction
  | RemoteFeatureFlagControllerGetStateAction
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
  isConfigRegistryApiEnabled?: (messenger: ConfigRegistryMessenger) => boolean;
};

export class ConfigRegistryController extends StaticIntervalPollingController<null>()<
  typeof controllerName,
  ConfigRegistryState,
  ConfigRegistryMessenger
> {
  readonly #fallbackConfig: Record<string, NetworkConfigEntry>;

  readonly #isConfigRegistryApiEnabled: (
    messenger: ConfigRegistryMessenger,
  ) => boolean;

  /**
   * @param options - The controller options.
   * @param options.messenger - The controller messenger. Must have
   * `ConfigRegistryApiService:fetchConfig` action handler registered.
   * @param options.state - Initial state.
   * @param options.pollingInterval - Polling interval in milliseconds.
   * @param options.fallbackConfig - Fallback configuration.
   * @param options.isConfigRegistryApiEnabled - Function to check if the config
   * registry API is enabled. Defaults to checking the remote feature flag.
   */
  constructor({
    messenger,
    state = {},
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    fallbackConfig = DEFAULT_FALLBACK_CONFIG,
    isConfigRegistryApiEnabled = defaultIsConfigRegistryApiEnabled,
  }: ConfigRegistryControllerOptions) {
    super({
      name: controllerName,
      metadata: stateMetadata,
      messenger,
      state: {
        configs: {
          networks: state.configs?.networks ?? { ...fallbackConfig },
        },
        version: state.version ?? null,
        lastFetched: state.lastFetched ?? null,
        etag: state.etag ?? null,
      },
    });

    this.setIntervalLength(pollingInterval);
    this.#fallbackConfig = fallbackConfig;
    this.#isConfigRegistryApiEnabled = isConfigRegistryApiEnabled;

    this.messenger.registerActionHandler(
      `${controllerName}:startPolling`,
      (input: null) => this.startPolling(input),
    );

    this.messenger.registerActionHandler(`${controllerName}:stopPolling`, () =>
      this.stopAllPolling(),
    );

    this.messenger.subscribe('KeyringController:unlock', () =>
      this.startPolling(null),
    );

    this.messenger.subscribe('KeyringController:lock', () =>
      this.stopAllPolling(),
    );
  }

  async _executePoll(_input: null): Promise<void> {
    const isApiEnabled = this.#isConfigRegistryApiEnabled(this.messenger);

    if (!isApiEnabled) {
      // The config registry API will use the configuration that is already
      // in the state
      return;
    }

    if (this.state.lastFetched && Date.now() < this.state.lastFetched) {
      return;
    }

    try {
      const result: FetchConfigResult = await this.messenger.call(
        'ConfigRegistryApiService:fetchConfig',
        {
          etag: this.state.etag ?? undefined,
        },
      );

      if (!result.modified) {
        this.update((state) => {
          state.lastFetched = Date.now();
          if (result.etag !== undefined) {
            state.etag = result.etag ?? null;
          }
        });
        return;
      }

      // Filter networks: only featured, active, non-testnet networks
      const filteredNetworks = filterNetworks(result.data.data.networks, {
        isFeatured: true,
        isActive: true,
        isTestnet: false,
      });

      // Group networks by chainId to detect duplicates
      const networksByChainId = new Map<
        string,
        { network: RegistryNetworkConfig; index: number }[]
      >();
      filteredNetworks.forEach((network, index) => {
        const existing = networksByChainId.get(network.chainId) ?? [];
        existing.push({ network, index });
        networksByChainId.set(network.chainId, existing);
      });

      // Build configs, handling duplicates by keeping highest priority network
      const newConfigs: Record<string, NetworkConfigEntry> = {};
      for (const [chainId, networks] of networksByChainId) {
        if (networks.length > 1) {
          // Duplicate chainIds detected - log warning and keep highest priority
          const duplicateNames = networks
            .map((networkEntry) => networkEntry.network.name)
            .join(', ');
          const warningMessage = `Duplicate chainId ${chainId} detected in config registry API response. Networks: ${duplicateNames}. Keeping network with highest priority.`;

          if (this.messenger.captureException) {
            this.messenger.captureException(new Error(warningMessage));
          }

          // Sort by priority (lower number = higher priority), then by index (first occurrence)
          networks.sort((a, b) => {
            const priorityDiff = a.network.priority - b.network.priority;
            if (priorityDiff === 0) {
              return a.index - b.index;
            }
            return priorityDiff;
          });
        }

        // Use the first network (highest priority if duplicates existed)
        const selectedNetwork = networks[0].network;
        newConfigs[chainId] = {
          key: chainId,
          value: selectedNetwork,
        };
      }

      this.update((state) => {
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore - Type instantiation is excessively deep
        (state.configs as ConfigRegistryState['configs']) = {
          networks: newConfigs,
        };
        state.version = result.data.data.version;
        state.lastFetched = Date.now();
        state.etag = result.etag ?? null;
      });
    } catch (error) {
      const errorInstance =
        error instanceof Error ? error : new Error(String(error));

      this.messenger.captureException?.(errorInstance);
    }
  }
}
