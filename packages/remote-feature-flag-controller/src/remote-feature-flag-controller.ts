import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { createDeferredPromise } from '@metamask/utils';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import { projectLogger, createModuleLogger } from './logger';
import type { FeatureFlags } from './remote-feature-flag-controller-types';

// === GENERAL ===

export const controllerName = 'RemoteFeatureFlagController';
export const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day
const log = createModuleLogger(projectLogger, 'ClientConfigApiService');

// === STATE ===

export type RemoteFeatureFlagControllerState = {
  remoteFeatureFlag: FeatureFlags;
  cacheTimestamp: number;
};

const remoteFeatureFlagControllerMetadata = {
  remoteFeatureFlag: { persist: true, anonymous: false },
  cacheTimestamp: { persist: true, anonymous: true },
};

// === MESSENGER ===

export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerGetRemoteFeatureFlagAction = {
  type: `${typeof controllerName}:getRemoteFeatureFlag`;
  handler: RemoteFeatureFlagController['getRemoteFeatureFlag'];
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
    remoteFeatureFlag: [],
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

  #inProgressFlagUpdate?: Promise<FeatureFlags>;

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
  async getRemoteFeatureFlag(): Promise<FeatureFlags> {
    if (this.#disabled) {
      return [];
    }

    if (!this.#isCacheExpired()) {
      return this.state.remoteFeatureFlag;
    }

    if (this.#inProgressFlagUpdate) {
      return await this.#inProgressFlagUpdate;
    }

    const { promise, resolve, reject } = createDeferredPromise<FeatureFlags>({
      suppressUnhandledRejection: true,
    });
    this.#inProgressFlagUpdate = promise;

    try {
      const serverData =
        await this.#clientConfigApiService.fetchRemoteFeatureFlag();
      if (serverData.remoteFeatureFlag.length > 0) {
        this.updateCache(serverData.remoteFeatureFlag);
        resolve(serverData.remoteFeatureFlag);
      } else {
        resolve([]); // Resolve with empty array if no data is returned
      }
      return await promise;
    } catch (error) {
      log('Remote feature flag API request failed: %o', error);
      reject(error);
      throw error;
    } finally {
      this.#inProgressFlagUpdate = undefined;
    }
  }

  /**
   * Updates the controller's state with new feature flags and resets the cache timestamp.
   *
   * @param remoteFeatureFlag - The new feature flags to cache.
   * @private
   */
  private updateCache(remoteFeatureFlag: FeatureFlags) {
    this.update(() => {
      return {
        remoteFeatureFlag,
        cacheTimestamp: Date.now(),
      };
    });
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
