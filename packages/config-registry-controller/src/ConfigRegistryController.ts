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

import type {
  FetchConfigOptions,
  FetchConfigResult,
  RegistryNetworkConfig,
} from './config-registry-api-service';
import { isConfigRegistryApiEnabled as defaultIsConfigRegistryApiEnabled } from './utils/feature-flags';

const controllerName = 'ConfigRegistryController';

export const DEFAULT_POLLING_INTERVAL = inMilliseconds(1, Duration.Day);

/**
 * State for the ConfigRegistryController.
 *
 * Tracks network configurations fetched from the config registry API,
 * along with metadata about the fetch status and caching.
 */
export type ConfigRegistryState = {
  /**
   * Network configurations organized by chain ID.
   * Stores the full API response including isFeatured, isTestnet, etc.
   * Use selectors (e.g. selectFeaturedNetworks) to filter when needed.
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

/**
 * Default fallback configuration when no configs are available.
 */
const DEFAULT_FALLBACK_CONFIG: Record<string, RegistryNetworkConfig> = {};

/**
 * Published when the state of {@link ConfigRegistryController} changes.
 */
export type ConfigRegistryControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, ConfigRegistryState>;

/**
 * Retrieves the state of the {@link ConfigRegistryController}.
 */
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

/**
 * Actions that {@link ConfigRegistryControllerMessenger} exposes to other consumers.
 */
export type ConfigRegistryControllerActions =
  | ConfigRegistryControllerGetStateAction
  | ConfigRegistryControllerStartPollingAction
  | ConfigRegistryControllerStopPollingAction
  | RemoteFeatureFlagControllerGetStateAction
  | {
      type: 'ConfigRegistryApiService:fetchConfig';
      handler: (options?: FetchConfigOptions) => Promise<FetchConfigResult>;
    };

/**
 * Events that {@link ConfigRegistryControllerMessenger} exposes to other consumers.
 */
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
  fallbackConfig?: Record<string, RegistryNetworkConfig>;
  isConfigRegistryApiEnabled?: (messenger: ConfigRegistryMessenger) => boolean;
};

export class ConfigRegistryController extends StaticIntervalPollingController<null>()<
  typeof controllerName,
  ConfigRegistryState,
  ConfigRegistryMessenger
> {
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
    this.#isConfigRegistryApiEnabled = isConfigRegistryApiEnabled;

    this.messenger.registerActionHandler(
      `${controllerName}:startPolling`,
      this.startPolling.bind(this),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:stopPolling`,
      this.stopAllPolling.bind(this),
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

      const apiNetworks = result.data.data.networks;
      const newConfigs: Record<string, RegistryNetworkConfig> = {};
      apiNetworks.forEach((registryConfig) => {
        const { chainId } = registryConfig;
        newConfigs[chainId] = registryConfig;
      });

      this.update((state) => {
        state.configs.networks = newConfigs;
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
