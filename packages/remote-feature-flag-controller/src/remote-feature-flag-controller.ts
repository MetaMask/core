import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import type {
  FeatureFlags,
  ServiceResponse,
  FeatureFlagScopeValue,
} from './remote-feature-flag-controller-types';
import {
  generateDeterministicRandomNumber,
  isFeatureFlagWithScopeValue,
} from './utils/user-segmentation-utils';

// === GENERAL ===

export const controllerName = 'RemoteFeatureFlagController';
export const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

// === STATE ===

export type RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: FeatureFlags;
  cacheTimestamp: number;
};

const remoteFeatureFlagControllerMetadata = {
  remoteFeatureFlags: { persist: true, anonymous: true },
  cacheTimestamp: { persist: true, anonymous: true },
};

// === MESSENGER ===

export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerGetRemoteFeatureFlagAction = {
  type: `${typeof controllerName}:updateRemoteFeatureFlags`;
  handler: RemoteFeatureFlagController['updateRemoteFeatureFlags'];
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
    remoteFeatureFlags: {},
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

  #inProgressFlagUpdate?: Promise<ServiceResponse>;

  #getMetaMetricsId: () => string;

  /**
   * Constructs a new RemoteFeatureFlagController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The controller messenger used for communication.
   * @param options.state - The initial state of the controller.
   * @param options.clientConfigApiService - The service instance to fetch remote feature flags.
   * @param options.fetchInterval - The interval in milliseconds before cached flags expire. Defaults to 1 day.
   * @param options.disabled - Determines if the controller should be disabled initially. Defaults to false.
   * @param options.getMetaMetricsId - Promise that resolves to a metaMetricsId.
   */
  constructor({
    messenger,
    state,
    clientConfigApiService,
    fetchInterval = DEFAULT_CACHE_DURATION,
    disabled = false,
    getMetaMetricsId,
  }: {
    messenger: RemoteFeatureFlagControllerMessenger;
    state?: Partial<RemoteFeatureFlagControllerState>;
    clientConfigApiService: AbstractClientConfigApiService;
    getMetaMetricsId: () => string;
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
    this.#getMetaMetricsId = getMetaMetricsId;
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
  async updateRemoteFeatureFlags(): Promise<void> {
    if (this.#disabled || !this.#isCacheExpired()) {
      return;
    }

    let serverData;

    if (this.#inProgressFlagUpdate) {
      await this.#inProgressFlagUpdate;
      return;
    }

    try {
      this.#inProgressFlagUpdate =
        this.#clientConfigApiService.fetchRemoteFeatureFlags();

      serverData = await this.#inProgressFlagUpdate;
    } finally {
      this.#inProgressFlagUpdate = undefined;
    }

    await this.#updateCache(serverData.remoteFeatureFlags);
  }

  /**
   * Updates the controller's state with new feature flags and resets the cache timestamp.
   *
   * @param remoteFeatureFlags - The new feature flags to cache.
   * @private
   */
  async #updateCache(remoteFeatureFlags: FeatureFlags) {
    const processedRemoteFeatureFlags = await this.#processRemoteFeatureFlags(
      remoteFeatureFlags,
    );
    this.update(() => {
      return {
        remoteFeatureFlags: processedRemoteFeatureFlags,
        cacheTimestamp: Date.now(),
      };
    });
  }

  async #processRemoteFeatureFlags(
    remoteFeatureFlags: FeatureFlags,
  ): Promise<FeatureFlags> {
    const processedRemoteFeatureFlags: FeatureFlags = {};
    const metaMetricsId = this.#getMetaMetricsId();

    const clientType = this.#clientConfigApiService.getClient();
    const thresholdValue = generateDeterministicRandomNumber(
      clientType,
      metaMetricsId,
    );

    for (const [
      remoteFeatureFlagName,
      remoteFeatureFlagValue,
    ] of Object.entries(remoteFeatureFlags)) {
      let processedValue = remoteFeatureFlagValue;

      if (Array.isArray(remoteFeatureFlagValue) && thresholdValue) {
        const selectedGroup = remoteFeatureFlagValue.find(
          (featureFlag): featureFlag is FeatureFlagScopeValue => {
            if (!isFeatureFlagWithScopeValue(featureFlag)) {
              return false;
            }

            return thresholdValue <= featureFlag.scope.value;
          },
        );
        if (selectedGroup) {
          processedValue = {
            name: selectedGroup.name,
            value: selectedGroup.value,
          };
        }
      }

      processedRemoteFeatureFlags[remoteFeatureFlagName] = processedValue;
    }
    return processedRemoteFeatureFlags;
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
