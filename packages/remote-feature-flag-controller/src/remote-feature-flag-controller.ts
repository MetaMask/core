import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import type {
  FeatureFlags,
  ApiResponse,
} from './remote-feature-flag-controller-types';

// === GENERAL ===

export const controllerName = 'RemoteFeatureFlagController';
export const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

// === STATE ===

export type RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: FeatureFlags;
  cacheTimestamp: number;
};

const remoteFeatureFlagControllerMetadata = {
  remoteFeatureFlags: { persist: true, anonymous: false },
  cacheTimestamp: { persist: true, anonymous: true },
};

// === MESSENGER ===

export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerGetRemoteFeatureFlagAction = {
  type: `${typeof controllerName}:getRemoteFeatureFlags`;
  handler: RemoteFeatureFlagController['getRemoteFeatureFlags'];
};

export type RemoteFeatureFlagControllerActions =
  RemoteFeatureFlagControllerGetStateAction;

export type AllowedActions = never;

export type RemoteFeatureFlagControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerEvents =
  RemoteFeatureFlagControllerStateChangeEvent;

export type AllowedEvents = never;

export type RemoteFeatureFlagControllerMessenger =
  RestrictedControllerMessenger<
    typeof controllerName,
    RemoteFeatureFlagControllerActions | AllowedActions,
    RemoteFeatureFlagControllerEvents | AllowedEvents,
    AllowedActions['type'],
    AllowedEvents['type']
  >;

/**
 * Returns the default state for the RemoteFeatureFlagController.
 *
 * @returns The default controller state.
 */
export function getDefaultRemoteFeatureFlagControllerState(): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: [],
    cacheTimestamp: 0,
  };
}

/**
 * The RemoteFeatureFlagController manages the retrieval and caching of remote feature flags.
 * It fetches feature flags from a remote API, caches them, and provides methods to access
 * and manage these flags. The controller ensures that feature flags are refreshed based on
 * a specified interval and handles cases where the controller is disabled or the network is unavailable.
 */
export class RemoteFeatureFlagController extends BaseController<
  typeof controllerName,
  RemoteFeatureFlagControllerState,
  RemoteFeatureFlagControllerMessenger
> {
  readonly #fetchInterval: number;

  #disabled: boolean;

  #clientConfigApiService: AbstractClientConfigApiService;

  #inProgressFlagUpdate?: Promise<ApiResponse>;

  /**
   * Constructs a new RemoteFeatureFlagController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messenger used for communication.
   * @param options.state - The initial state of the controller.
   * @param options.clientConfigApiService - The service instance to fetch remote feature flags.
   * @param options.fetchInterval - The interval in milliseconds before cached flags expire. Defaults to 1 day.
   * @param options.disabled - Determines if the controller should be disabled initially. Defaults to false.
   */
  constructor({
    messenger,
    state,
    clientConfigApiService,
    fetchInterval = DEFAULT_CACHE_DURATION,
    disabled = false,
  }: {
    messenger: RemoteFeatureFlagControllerMessenger;
    state?: Partial<RemoteFeatureFlagControllerState>;
    clientConfigApiService: AbstractClientConfigApiService;
    fetchInterval?: number;
    disabled?: boolean;
  }) {
    super({
      name: controllerName,
      metadata: remoteFeatureFlagControllerMetadata,
      messenger,
      state: {
        ...getDefaultRemoteFeatureFlagControllerState(),
        ...state,
      },
    });

    this.#fetchInterval = fetchInterval;
    this.#disabled = disabled;
    this.#clientConfigApiService = clientConfigApiService;
  }

  /**
   * Checks if the cached feature flags are expired based on the fetch interval.
   *
   * @returns Whether the cache is expired (`true`) or still valid (`false`).
   * @private
   */
  #isCacheExpired(): boolean {
    return Date.now() - this.state.cacheTimestamp > this.#fetchInterval;
  }

  /**
   * Retrieves the remote feature flags, fetching from the API if necessary.
   * Uses caching to prevent redundant API calls and handles concurrent fetches.
   *
   * @returns A promise that resolves to the current set of feature flags.
   */
  async getRemoteFeatureFlags(): Promise<FeatureFlags> {
    if (this.#disabled || !this.#isCacheExpired()) {
      return this.state.remoteFeatureFlags;
    }

    let serverData;

    try {
      if (this.#inProgressFlagUpdate) {
        serverData = await this.#inProgressFlagUpdate;
        const featureFlagsWithNames = this.getFeatureFlagsWithNames(
          serverData.remoteFeatureFlags,
        );
        this.updateCache(featureFlagsWithNames);
        return featureFlagsWithNames;
      }

      this.#inProgressFlagUpdate =
        this.#clientConfigApiService.fetchRemoteFeatureFlags();

      serverData = await this.#inProgressFlagUpdate;
    } catch {
      // Ignore
    } finally {
      this.#inProgressFlagUpdate = undefined;
    }

    if (serverData && serverData.remoteFeatureFlags?.length > 0) {
      const featureFlagsWithNames = this.getFeatureFlagsWithNames(
        serverData.remoteFeatureFlags,
      );
      this.updateCache(featureFlagsWithNames);
      return featureFlagsWithNames;
    }
    return this.state.remoteFeatureFlags ?? []; // Resolve with cached state if no data is returned
  }

  /**
   * Updates the controller's state with new feature flags and resets the cache timestamp.
   *
   * @param remoteFeatureFlags - The new feature flags to cache.
   * @private
   */
  private updateCache(remoteFeatureFlags: FeatureFlags) {
    this.update(() => {
      return {
        remoteFeatureFlags,
        cacheTimestamp: Date.now(),
      };
    });
  }

  private getFeatureFlagsWithNames(remoteFeatureFlags: FeatureFlags) {
    const featureFlagsWithNames = remoteFeatureFlags.map((flag) => ({
      ...flag,
      name: Object.keys(flag)?.[0],
    }));
    return featureFlagsWithNames;
  }

  /**
   * Enables the controller, allowing it to make network requests.
   */
  enable(): void {
    this.#disabled = false;
  }

  /**
   * Disables the controller, preventing it from making network requests.
   */
  disable(): void {
    this.#disabled = true;
  }
}
