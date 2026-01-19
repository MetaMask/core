import {
  type ControllerGetStateAction,
  type ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { StaticIntervalPollingController } from '@metamask/polling-controller';
import type { RemoteFeatureFlagControllerState } from '@metamask/remote-feature-flag-controller';
import type { Json } from '@metamask/utils';

import type { AbstractConfigRegistryApiService } from './config-registry-api-service';
import {
  ConfigRegistryApiService,
  type FetchConfigResult,
} from './config-registry-api-service';
import { isConfigRegistryApiEnabled } from './utils/feature-flags';

const controllerName = 'ConfigRegistryController';

export const DEFAULT_POLLING_INTERVAL = 24 * 60 * 60 * 1000;

export type RegistryConfigEntry = {
  key: string;
  value: Json;
  metadata?: Json;
};

export type ConfigRegistryState = {
  configs: {
    networks?: Record<string, RegistryConfigEntry>;
  };
  version: string | null;
  lastFetched: number | null;
  fetchError: string | null;
  etag: string | null;
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
  etag: {
    persist: true,
    anonymous: false,
    includeInStateLogs: false,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

const DEFAULT_FALLBACK_CONFIG: Record<string, RegistryConfigEntry> = {};

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
  | ConfigRegistryControllerStopPollingAction
  | {
      type: 'RemoteFeatureFlagController:getState';
      handler: () => RemoteFeatureFlagControllerState;
    };

export type ConfigRegistryControllerEvents =
  ConfigRegistryControllerStateChangeEvent;

export type ConfigRegistryMessenger = Messenger<
  typeof controllerName,
  ConfigRegistryControllerActions,
  ConfigRegistryControllerEvents
>;

export type ConfigRegistryControllerOptions = {
  messenger: ConfigRegistryMessenger;
  state?: Partial<ConfigRegistryState>;
  pollingInterval?: number;
  fallbackConfig?: Record<string, RegistryConfigEntry>;
  apiService?: AbstractConfigRegistryApiService;
};

export class ConfigRegistryController extends StaticIntervalPollingController<ConfigRegistryPollingInput>()<
  typeof controllerName,
  ConfigRegistryState,
  ConfigRegistryMessenger
> {
  readonly #fallbackConfig: Record<string, RegistryConfigEntry>;

  readonly #apiService: AbstractConfigRegistryApiService;

  /**
   * @param options - The controller options.
   * @param options.messenger - The controller messenger.
   * @param options.state - Initial state.
   * @param options.pollingInterval - Polling interval in milliseconds.
   * @param options.fallbackConfig - Fallback configuration.
   * @param options.apiService - The API service.
   */
  constructor({
    messenger,
    state = {},
    pollingInterval = DEFAULT_POLLING_INTERVAL,
    fallbackConfig = DEFAULT_FALLBACK_CONFIG,
    apiService = new ConfigRegistryApiService(),
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
    this.#apiService = apiService;

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

  async _executePoll(_input: ConfigRegistryPollingInput): Promise<void> {
    const isApiEnabled = isConfigRegistryApiEnabled(this.messenger);

    if (!isApiEnabled) {
      this.#useFallbackConfig(
        'Feature flag disabled - using fallback configuration',
      );
      return;
    }

    try {
      const result: FetchConfigResult = await this.#apiService.fetchConfig({
        etag: this.state.etag ?? undefined,
      });

      if (result.notModified) {
        this.update((state) => {
          state.fetchError = null;
        });
        return;
      }

      const newConfigs: Record<string, RegistryConfigEntry> = {};
      for (const network of result.data.data.networks) {
        newConfigs[network.chainId] = {
          key: network.chainId,
          value: network as unknown as Json,
          metadata: {
            name: network.name,
            isTestnet: network.isTestnet,
            isFeatured: network.isFeatured,
          } as unknown as Json,
        };
      }

      this.update((state) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.configs as any) = { networks: newConfigs };
        state.version = result.data.data.version;
        state.lastFetched = Date.now();
        state.fetchError = null;
        state.etag = result.etag ?? null;
      });
    } catch (error) {
      this.#handleFetchError(error);
    }
  }

  #useFallbackConfig(errorMessage?: string): void {
    this.update((state) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.configs as any) = { networks: { ...this.#fallbackConfig } };
      state.fetchError =
        errorMessage ?? 'Using fallback configuration - API unavailable';
      state.etag = null;
    });
  }

  #handleFetchError(error: unknown): void {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error occurred';

    const hasNoConfigs =
      Object.keys(this.state.configs?.networks || {}).length === 0;

    if (hasNoConfigs) {
      this.#useFallbackConfig(errorMessage);
    } else {
      this.update((state) => {
        state.fetchError = errorMessage;
      });
    }
  }

  getConfig(key: string): RegistryConfigEntry | undefined {
    return this.state.configs?.networks?.[key];
  }

  getAllConfigs(): Record<string, RegistryConfigEntry> {
    return { ...(this.state.configs?.networks || {}) };
  }

  getConfigValue<T = Json>(key: string): T | undefined {
    const entry = this.state.configs?.networks?.[key];
    return entry?.value as T | undefined;
  }

  setConfig(key: string, value: Json, metadata?: Json): void {
    this.update((state) => {
      if (!state.configs) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.configs as any) = { networks: {} };
      }
      if (!state.configs.networks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (state.configs.networks as any) = {};
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.configs.networks as any)[key] = {
        key,
        value,
        metadata,
      };
    });
  }

  removeConfig(key: string): void {
    this.update((state) => {
      if (state.configs?.networks) {
        delete state.configs.networks[key];
      }
    });
  }

  clearConfigs(): void {
    this.update((state) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (state.configs as any) = { networks: {} };
    });
  }

  startPolling(input: ConfigRegistryPollingInput = {}): string {
    return super.startPolling(input);
  }

  stopPolling(): void {
    this.stopAllPolling();
  }
}
