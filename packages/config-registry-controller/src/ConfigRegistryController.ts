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
import type { RemoteFeatureFlagControllerStateChangeEvent } from '@metamask/remote-feature-flag-controller';
import { Duration, inMilliseconds } from '@metamask/utils';

import type { ConfigRegistryApiServiceFetchConfigAction } from './config-registry-api-service/config-registry-api-service-method-action-types';
import type { RegistryNetworkConfig } from './config-registry-api-service/types';
import { isConfigRegistryApiEnabled } from './utils/feature-flags';

const controllerName = 'ConfigRegistryController';

export const DEFAULT_POLLING_INTERVAL = inMilliseconds(1, Duration.Day);

/**
 * State for the ConfigRegistryController.
 *
 * Tracks network configurations fetched from the config registry API,
 * along with metadata about the fetch status and caching.
 */
export type ConfigRegistryControllerState = {
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
} satisfies StateMetadata<ConfigRegistryControllerState>;

/**
 * Default fallback configuration when no configs are available.
 */
const DEFAULT_FALLBACK_CONFIG: Record<string, RegistryNetworkConfig> = {};

/**
 * Published when the state of {@link ConfigRegistryController} changes.
 */
export type ConfigRegistryControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    ConfigRegistryControllerState
  >;

/**
 * Retrieves the state of the {@link ConfigRegistryController}.
 */
export type ConfigRegistryControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ConfigRegistryControllerState
>;

/**
 * Starts polling the config registry API. Returns a polling token that can be
 * used to stop this polling session.
 */
export type ConfigRegistryControllerStartPollingAction = {
  type: `${typeof controllerName}:startPolling`;
  handler: (input: null) => string;
};

/**
 * Stops all config registry polling.
 */
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
  | ConfigRegistryControllerStopPollingAction;

/**
 * Actions from other messengers that {@link ConfigRegistryControllerMessenger}
 * calls.
 */
type AllowedActions =
  | RemoteFeatureFlagControllerGetStateAction
  | ConfigRegistryApiServiceFetchConfigAction;

/**
 * Events that {@link ConfigRegistryControllerMessenger} exposes to other consumers.
 */
export type ConfigRegistryControllerEvents =
  ConfigRegistryControllerStateChangeEvent;

/**
 * Events from other messengers that {@link ConfigRegistryControllerMessenger}
 * subscribes to.
 */
type AllowedEvents =
  | KeyringControllerUnlockEvent
  | KeyringControllerLockEvent
  | RemoteFeatureFlagControllerStateChangeEvent;

/**
 * The messenger restricted to actions and events accessed by
 * {@link ConfigRegistryController}.
 */
export type ConfigRegistryControllerMessenger = Messenger<
  typeof controllerName,
  ConfigRegistryControllerActions | AllowedActions,
  ConfigRegistryControllerEvents | AllowedEvents
>;

export type ConfigRegistryControllerOptions = {
  messenger: ConfigRegistryControllerMessenger;
  state?: Partial<ConfigRegistryControllerState>;
  pollingInterval?: number;
  fallbackConfig?: Record<string, RegistryNetworkConfig>;
};

export class ConfigRegistryController extends StaticIntervalPollingController<null>()<
  typeof controllerName,
  ConfigRegistryControllerState,
  ConfigRegistryControllerMessenger
> {
  /**
   * @param options - The controller options.
   * @param options.messenger - The controller messenger. Must have
   *   `ConfigRegistryApiService:fetchConfig` action handler registered
   *   (e.g. by instantiating {@link ConfigRegistryApiService} with the same
   *   messenger).
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
        configs: {
          networks: state.configs?.networks ?? { ...fallbackConfig },
        },
        version: state.version ?? null,
        lastFetched: state.lastFetched ?? null,
        etag: state.etag ?? null,
      },
    });

    this.setIntervalLength(pollingInterval);

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

    this.messenger.subscribe('RemoteFeatureFlagController:stateChange', () => {
      if (isConfigRegistryApiEnabled(this.messenger)) {
        this.startPolling(null);
      } else {
        this.stopAllPolling();
      }
    });
  }

  async _executePoll(_input: null): Promise<void> {
    const isApiEnabled = isConfigRegistryApiEnabled(this.messenger);

    // Skip fetch when API is disabled; client uses static config.
    if (!isApiEnabled) {
      return;
    }

    try {
      const result = await this.messenger.call(
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

      const apiChains = result.data.data.chains;
      const newConfigs: Record<string, RegistryNetworkConfig> = {};
      // duplicate chainIds from API response are not expected
      apiChains.forEach((chainConfig) => {
        const { chainId } = chainConfig;
        newConfigs[chainId] = chainConfig;
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
