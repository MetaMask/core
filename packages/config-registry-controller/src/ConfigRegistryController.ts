import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { Json } from '@metamask/utils';

const controllerName = 'ConfigRegistryController';

// 24 hours in milliseconds
const DEFAULT_POLLING_INTERVAL = 24 * 60 * 60 * 1000; // 86400000ms

/**
 * Configuration entry in the registry.
 */
export type RegistryConfigEntry = {
  key: string;
  value: Json;
  metadata?: Json;
};

/**
 * The state of the {@link ConfigRegistryController}.
 *
 * @property configs - A map of configuration keys to their entries.
 * @property version - The version of the configuration from the API.
 * @property lastFetched - Timestamp of the last successful fetch.
 * @property fetchError - Error message if the last fetch failed, null otherwise.
 */
export type ConfigRegistryState = {
  configs: Record<string, RegistryConfigEntry>;
  version: string | null;
  lastFetched: number | null;
  fetchError: string | null;
};

const stateMetadata = {
  configs: {
    persist: true,
    anonymous: false,
    includeInStateLogs: false,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  version: {
    persist: true,
    anonymous: false,
    includeInStateLogs: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  lastFetched: {
    persist: true,
    anonymous: false,
    includeInStateLogs: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  fetchError: {
    persist: true,
    anonymous: false,
    includeInStateLogs: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
};

/**
 * Default fallback configuration.
 * This will be used when the API is unavailable.
 */
const DEFAULT_FALLBACK_CONFIG: Record<string, RegistryConfigEntry> = {};

/**
 * Polling input type for the controller.
 * For now, it's empty, but can be extended later if needed.
 */
type ConfigRegistryPollingInput = Record<string, never>;

export type ConfigRegistryControllerStateChangeEvent =
  ControllerStateChangeEvent<typeof controllerName, ConfigRegistryState>;

export type ConfigRegistryControllerGetStateAction = ControllerGetStateAction<
  typeof controllerName,
  ConfigRegistryState
>;

export type ConfigRegistryControllerGetConfigAction = {
  type: `${typeof controllerName}:getConfig`;
  handler: ConfigRegistryController['getConfig'];
};

export type ConfigRegistryControllerSetConfigAction = {
  type: `${typeof controllerName}:setConfig`;
  handler: ConfigRegistryController['setConfig'];
};

export type ConfigRegistryControllerGetAllConfigsAction = {
  type: `${typeof controllerName}:getAllConfigs`;
  handler: ConfigRegistryController['getAllConfigs'];
};

export type ConfigRegistryControllerStartPollingAction = {
  type: `${typeof controllerName}:startPolling`;
  handler: (input: ConfigRegistryPollingInput) => string;
};

export type ConfigRegistryControllerStopPollingAction = {
  type: `${typeof controllerName}:stopPolling`;
  handler: () => void;
};

export type ConfigRegistryControllerActions =
  | ConfigRegistryControllerGetStateAction
  | ConfigRegistryControllerGetConfigAction
  | ConfigRegistryControllerSetConfigAction
  | ConfigRegistryControllerGetAllConfigsAction
  | ConfigRegistryControllerStartPollingAction
  | ConfigRegistryControllerStopPollingAction;

export type ConfigRegistryControllerEvents =
  ConfigRegistryControllerStateChangeEvent;

export type ConfigRegistryMessenger = Messenger<
  typeof controllerName,
  ConfigRegistryControllerActions,
  ConfigRegistryControllerEvents
>;

/**
 * Options for constructing a ConfigRegistryController.
 */
export type ConfigRegistryControllerOptions = {
  messenger: ConfigRegistryMessenger;
  state?: Partial<ConfigRegistryState>;
  pollingInterval?: number;
  fallbackConfig?: Record<string, RegistryConfigEntry>;
};

/**
 * Controller for managing a configuration registry with dynamic updates from a remote API.
 */
export class ConfigRegistryController extends StaticIntervalPollingController<ConfigRegistryPollingInput>()<
  typeof controllerName,
  ConfigRegistryState,
  ConfigRegistryMessenger
> {
  readonly #fallbackConfig: Record<string, RegistryConfigEntry>;

  /**
   * Creates a ConfigRegistryController instance.
   *
   * @param options - Constructor options.
   * @param options.messenger - A reference to the messaging system.
   * @param options.state - Initial state to set on this controller.
   * @param options.pollingInterval - Polling interval in milliseconds. Defaults to 24 hours.
   * @param options.fallbackConfig - Fallback configuration to use when API fails.
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
        configs: {},
        version: null,
        lastFetched: null,
        fetchError: null,
        ...state,
      },
    });

    this.setIntervalLength(pollingInterval);
    this.#fallbackConfig = fallbackConfig;

    this.messenger.registerActionHandler(
      `${controllerName}:getConfig`,
      (key: string) => this.getConfig(key),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:setConfig`,
      (key: string, value: Json, metadata?: Json) =>
        this.setConfig(key, value, metadata),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:getAllConfigs`,
      () => this.getAllConfigs(),
    );

    this.messenger.registerActionHandler(
      `${controllerName}:startPolling`,
      (input: ConfigRegistryPollingInput) => this.startPolling(input),
    );

    this.messenger.registerActionHandler(`${controllerName}:stopPolling`, () =>
      this.stopPolling(),
    );
  }

  /**
   * Executes a poll to fetch configuration from the API.
   * This method is called automatically by the polling controller.
   *
   * @param _input - Polling input (unused for now).
   */
  async _executePoll(_input: ConfigRegistryPollingInput): Promise<void> {
    // TODO: This will be implemented in Task 2 (API service fetcher)
    // For now, this is a placeholder that will use fallback
    try {
      // Placeholder: Will call API service here
      // const apiResponse = await this.#apiService.fetchConfig();
      // Once implemented in Task 2, will update state with:
      // this.update((state) => {
      //   state.configs = apiResponse.configs;
      //   state.version = apiResponse.version;
      //   state.lastFetched = Date.now();
      //   state.fetchError = null;
      // });

      // For now, if we have no configs, use fallback
      if (Object.keys(this.state.configs).length === 0) {
        this.#useFallbackConfig();
      }
    } catch (error) {
      this.#handleFetchError(error);
    }
  }

  /**
   * Uses the fallback configuration when API fails.
   */
  #useFallbackConfig(): void {
    this.update((state) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.configs as any) = { ...this.#fallbackConfig };
      state.fetchError = 'Using fallback configuration - API unavailable';
      // Don't update lastFetched when using fallback
    });
  }

  /**
   * Handles errors during configuration fetch.
   *
   * @param error - The error that occurred.
   */
  #handleFetchError(error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    this.update((state) => {
      state.fetchError = errorMessage;
      // Use fallback if we have no configs
      if (Object.keys(state.configs).length === 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.configs as any) = { ...this.#fallbackConfig };
      }
    });
  }

  /**
   * Gets a specific configuration entry by key.
   *
   * @param key - The configuration key.
   * @returns The configuration entry, or undefined if not found.
   */
  getConfig(key: string): RegistryConfigEntry | undefined {
    return this.state.configs[key];
  }

  /**
   * Gets all configuration entries.
   *
   * @returns A copy of all configuration entries.
   */
  getAllConfigs(): Record<string, RegistryConfigEntry> {
    return { ...this.state.configs };
  }

  /**
   * Gets the value of a specific configuration entry by key.
   *
   * @param key - The configuration key.
   * @returns The configuration value, or undefined if not found.
   */
  getConfigValue<T = Json>(key: string): T | undefined {
    const entry = this.state.configs[key];
    return entry?.value as T | undefined;
  }

  /**
   * Sets a configuration entry in the registry.
   *
   * @param key - The configuration key.
   * @param value - The configuration value.
   * @param metadata - Optional metadata for the configuration entry.
   */
  setConfig(key: string, value: Json, metadata?: Json): void {
    this.update((state) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.configs as any)[key] = {
        key,
        value,
        metadata,
      };
    });
  }

  /**
   * Removes a configuration entry from the registry.
   *
   * @param key - The configuration key.
   */
  removeConfig(key: string): void {
    this.update((state) => {
      delete state.configs[key];
    });
  }

  /**
   * Clears all configuration entries from the registry.
   */
  clearConfigs(): void {
    this.update((state) => {
      state.configs = {};
    });
  }

  /**
   * Starts polling for configuration updates.
   *
   * @param input - Polling input (empty object for now).
   * @returns A polling token that can be used to stop polling.
   */
  startPolling(input: ConfigRegistryPollingInput = {}): string {
    return super.startPolling(input);
  }

  /**
   * Stops polling for configuration updates.
   */
  stopPolling(): void {
    this.stopAllPolling();
  }
}
