import { BaseController } from '@metamask/base-controller';
import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
} from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { isValidSemVerVersion } from '@metamask/utils';
import type { Json, SemVerVersion } from '@metamask/utils';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import type {
  FeatureFlags,
  ServiceResponse,
  FeatureFlagScopeValue,
} from './remote-feature-flag-controller-types';
import {
  calculateThresholdForFlag,
  isFeatureFlagWithScopeValue,
} from './utils/user-segmentation-utils';
import { isVersionFeatureFlag, getVersionData } from './utils/version';

// === GENERAL ===

export const controllerName = 'RemoteFeatureFlagController';
export const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

// === STATE ===

export type RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: FeatureFlags;
  localOverrides?: FeatureFlags;
  rawRemoteFeatureFlags?: FeatureFlags;
  cacheTimestamp: number;
  thresholdCache?: Record<string, number>;
};

const remoteFeatureFlagControllerMetadata = {
  remoteFeatureFlags: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  localOverrides: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: true,
  },
  rawRemoteFeatureFlags: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  cacheTimestamp: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
  thresholdCache: {
    includeInStateLogs: false,
    persist: true,
    includeInDebugSnapshot: false,
    usedInUi: false,
  },
};

// === MESSENGER ===

/**
 * The action to retrieve the state of the {@link RemoteFeatureFlagController}.
 */
export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerUpdateRemoteFeatureFlagsAction = {
  type: `${typeof controllerName}:updateRemoteFeatureFlags`;
  handler: RemoteFeatureFlagController['updateRemoteFeatureFlags'];
};

export type RemoteFeatureFlagControllerSetFlagOverrideAction = {
  type: `${typeof controllerName}:setFlagOverride`;
  handler: RemoteFeatureFlagController['setFlagOverride'];
};

export type RemoteFeatureFlagControllerRemoveFlagOverrideAction = {
  type: `${typeof controllerName}:removeFlagOverride`;
  handler: RemoteFeatureFlagController['removeFlagOverride'];
};

export type RemoteFeatureFlagControllerClearAllFlagOverridesAction = {
  type: `${typeof controllerName}:clearAllFlagOverrides`;
  handler: RemoteFeatureFlagController['clearAllFlagOverrides'];
};

export type RemoteFeatureFlagControllerActions =
  | RemoteFeatureFlagControllerGetStateAction
  | RemoteFeatureFlagControllerUpdateRemoteFeatureFlagsAction
  | RemoteFeatureFlagControllerSetFlagOverrideAction
  | RemoteFeatureFlagControllerRemoveFlagOverrideAction
  | RemoteFeatureFlagControllerClearAllFlagOverridesAction;

export type RemoteFeatureFlagControllerStateChangeEvent =
  ControllerStateChangeEvent<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerEvents =
  RemoteFeatureFlagControllerStateChangeEvent;

export type RemoteFeatureFlagControllerMessenger = Messenger<
  typeof controllerName,
  RemoteFeatureFlagControllerActions,
  RemoteFeatureFlagControllerEvents
>;

/**
 * Returns the default state for the RemoteFeatureFlagController.
 *
 * @returns The default controller state.
 */
export function getDefaultRemoteFeatureFlagControllerState(): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: {},
    localOverrides: {},
    rawRemoteFeatureFlags: {},
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

  readonly #clientConfigApiService: AbstractClientConfigApiService;

  #inProgressFlagUpdate?: Promise<ServiceResponse>;

  readonly #getMetaMetricsId: () => string;

  readonly #clientVersion: SemVerVersion;

  /**
   * Constructs a new RemoteFeatureFlagController instance.
   *
   * @param options - The controller options.
   * @param options.messenger - The messenger used for communication.
   * @param options.state - The initial state of the controller.
   * @param options.clientConfigApiService - The service instance to fetch remote feature flags.
   * @param options.fetchInterval - The interval in milliseconds before cached flags expire. Defaults to 1 day.
   * @param options.disabled - Determines if the controller should be disabled initially. Defaults to false.
   * @param options.getMetaMetricsId - Returns metaMetricsId.
   * @param options.clientVersion - The current client version for version-based feature flag filtering. Must be a valid 3-part SemVer version string.
   */
  constructor({
    messenger,
    state,
    clientConfigApiService,
    fetchInterval = DEFAULT_CACHE_DURATION,
    disabled = false,
    getMetaMetricsId,
    clientVersion,
  }: {
    messenger: RemoteFeatureFlagControllerMessenger;
    state?: Partial<RemoteFeatureFlagControllerState>;
    clientConfigApiService: AbstractClientConfigApiService;
    getMetaMetricsId: () => string;
    fetchInterval?: number;
    disabled?: boolean;
    clientVersion: string;
  }) {
    if (!isValidSemVerVersion(clientVersion)) {
      throw new Error(
        `Invalid clientVersion: "${clientVersion}". Must be a valid 3-part SemVer version string`,
      );
    }

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
    this.#clientVersion = clientVersion;
  }

  /**
   * Checks if the cached feature flags are expired based on the fetch interval.
   *
   * @returns Whether the cache is expired (`true`) or still valid (`false`).
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
   */
  async #updateCache(remoteFeatureFlags: FeatureFlags): Promise<void> {
    const { processedFlags, thresholdCacheUpdates } =
      await this.#processRemoteFeatureFlags(remoteFeatureFlags);

    const metaMetricsId = this.#getMetaMetricsId();
    const currentFlagNames = Object.keys(remoteFeatureFlags);

    // Build updated threshold cache
    const updatedThresholdCache = { ...(this.state.thresholdCache ?? {}) };

    // Apply new thresholds
    for (const [cacheKey, threshold] of Object.entries(
      thresholdCacheUpdates,
    )) {
      updatedThresholdCache[cacheKey] = threshold;
    }

    // Clean up stale entries
    for (const cacheKey of Object.keys(updatedThresholdCache)) {
      const [cachedMetaMetricsId, cachedFlagName] = cacheKey.split(':');
      if (
        cachedMetaMetricsId === metaMetricsId &&
        !currentFlagNames.includes(cachedFlagName)
      ) {
        delete updatedThresholdCache[cacheKey];
      }
    }

    // Single state update with all changes batched together
    this.update(() => {
      return {
        ...this.state,
        remoteFeatureFlags: processedFlags,
        rawRemoteFeatureFlags: remoteFeatureFlags,
        cacheTimestamp: Date.now(),
        thresholdCache: updatedThresholdCache,
      };
    });
  }

  /**
   * Processes a version-based feature flag to get the appropriate value for the current client version.
   *
   * @param flagValue - The feature flag value to process
   * @returns The processed value, or null if no version qualifies (skip this flag)
   */
  #processVersionBasedFlag(flagValue: Json): Json | null {
    if (!isVersionFeatureFlag(flagValue)) {
      return flagValue;
    }

    return getVersionData(flagValue, this.#clientVersion);
  }


  async #processRemoteFeatureFlags(
    remoteFeatureFlags: FeatureFlags,
  ): Promise<{
    processedFlags: FeatureFlags;
    thresholdCacheUpdates: Record<string, number>;
  }> {
    const processedFlags: FeatureFlags = {};
    const metaMetricsId = this.#getMetaMetricsId();
    const thresholdCacheUpdates: Record<string, number> = {};

    for (const [
      remoteFeatureFlagName,
      remoteFeatureFlagValue,
    ] of Object.entries(remoteFeatureFlags)) {
      let processedValue = this.#processVersionBasedFlag(
        remoteFeatureFlagValue,
      );
      if (processedValue === null) {
        continue;
      }

      if (Array.isArray(processedValue)) {
        // Validate array has valid threshold items before doing expensive crypto operation
        const hasValidThresholds = processedValue.some(
          isFeatureFlagWithScopeValue,
        );

        if (!hasValidThresholds) {
          // Not a threshold array - preserve as-is
          processedFlags[remoteFeatureFlagName] = processedValue;
          continue;
        }

        // Check cache first, calculate only if needed
        const cacheKey: `${string}:${string}` = `${metaMetricsId}:${remoteFeatureFlagName}`;
        let thresholdValue = this.state.thresholdCache?.[cacheKey];

        if (thresholdValue === undefined) {
          thresholdValue = await calculateThresholdForFlag(
            metaMetricsId,
            remoteFeatureFlagName,
          );

          // Collect new threshold for batched state update
          thresholdCacheUpdates[cacheKey] = thresholdValue;
        }

        const threshold = thresholdValue;
        const selectedGroup = processedValue.find(
          (featureFlag): featureFlag is FeatureFlagScopeValue => {
            if (!isFeatureFlagWithScopeValue(featureFlag)) {
              return false;
            }

            return threshold <= featureFlag.scope.value;
          },
        );
        if (selectedGroup) {
          processedValue = {
            name: selectedGroup.name,
            value: selectedGroup.value,
          };
        }
      }

      processedFlags[remoteFeatureFlagName] = processedValue;
    }

    return { processedFlags, thresholdCacheUpdates };
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

  /**
   * Sets a local override for a specific feature flag.
   *
   * @param flagName - The name of the feature flag to override.
   * @param value - The override value for the feature flag.
   */
  setFlagOverride(flagName: string, value: Json): void {
    this.update(() => {
      return {
        ...this.state,
        localOverrides: {
          ...this.state.localOverrides,
          [flagName]: value,
        },
      };
    });
  }

  /**
   * Clears the local override for a specific feature flag.
   *
   * @param flagName - The name of the feature flag to clear.
   */
  removeFlagOverride(flagName: string): void {
    const newLocalOverrides = { ...this.state.localOverrides };
    delete newLocalOverrides[flagName];
    this.update(() => {
      return {
        ...this.state,
        localOverrides: newLocalOverrides,
      };
    });
  }

  /**
   * Clears all local feature flag overrides.
   */
  clearAllFlagOverrides(): void {
    this.update(() => {
      return {
        ...this.state,
        localOverrides: {},
      };
    });
  }
}
