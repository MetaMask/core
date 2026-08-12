import {
  BaseController,
  ControllerGetStateAction,
} from '@metamask/base-controller';
import type { ControllerStateChangeEvent } from '@metamask/base-controller';
import type { Messenger } from '@metamask/messenger';
import { isValidSemVerVersion } from '@metamask/utils';
import type { Json, SemVerVersion } from '@metamask/utils';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service.js';
import type { RemoteFeatureFlagControllerMethodActions } from './remote-feature-flag-controller-method-action-types.js';
import type {
  FeatureFlags,
  ServiceResponse,
  FeatureFlagScopeValue,
} from './remote-feature-flag-controller-types.js';
import {
  calculateThresholdForFlag,
  isFeatureFlagWithScopeValue,
} from './utils/user-segmentation-utils.js';
import { isVersionFeatureFlag, getVersionData } from './utils/version.js';

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
  featureFlagThresholdGroups?: Record<string, string>;
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
  featureFlagThresholdGroups: {
    includeInStateLogs: true,
    persist: true,
    includeInDebugSnapshot: true,
    usedInUi: false,
  },
};

// === MESSENGER ===

const MESSENGER_EXPOSED_METHODS = [
  'clearAllFlagOverrides',
  'disable',
  'enable',
  'removeFlagOverride',
  'setFlagOverride',
  'updateRemoteFeatureFlags',
] as const;

export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    typeof controllerName,
    RemoteFeatureFlagControllerState
  >;

export type RemoteFeatureFlagControllerActions =
  | RemoteFeatureFlagControllerGetStateAction
  | RemoteFeatureFlagControllerMethodActions;

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
 * Searches threshold entries for an explicit MetaMetrics ID match.
 * Returns the first entry whose `metaMetricsIds` list contains the given
 * normalized ID. Entries with malformed `metaMetricsIds` (not an array) are
 * skipped without throwing.
 *
 * @param entries - The array of raw threshold entries for a feature flag.
 * @param normalizedId - The current user's MetaMetrics ID, already trimmed and
 * lower-cased.
 * @returns The first matching entry, or `undefined` if none match.
 */
function findExplicitIdMatch(
  entries: Json[],
  normalizedId: string,
): FeatureFlagScopeValue | undefined {
  for (const entry of entries) {
    if (!isFeatureFlagWithScopeValue(entry)) {
      continue;
    }
    const { metaMetricsIds } = entry;
    if (!Array.isArray(metaMetricsIds)) {
      continue;
    }
    const hasMatch = metaMetricsIds.some(
      (id) =>
        typeof id === 'string' && id.trim().toLowerCase() === normalizedId,
    );
    if (hasMatch) {
      return entry;
    }
  }
  return undefined;
}

/**
 * Merges the feature flag layers into the effective flags that consumers read,
 * with precedence: defaults < processed remote < local overrides.
 *
 * @param options - The feature flag layers to merge.
 * @param options.defaultFeatureFlags - Client-side default feature flags.
 * @param options.processedRemoteFeatureFlags - Remote feature flags after
 * version and threshold processing, without defaults or overrides applied.
 * @param options.localOverrides - Local overrides.
 * @returns The effective feature flags.
 */
function getEffectiveFeatureFlags({
  defaultFeatureFlags,
  processedRemoteFeatureFlags,
  localOverrides,
}: {
  defaultFeatureFlags: FeatureFlags;
  processedRemoteFeatureFlags?: FeatureFlags;
  localOverrides?: FeatureFlags;
}): FeatureFlags {
  return {
    ...defaultFeatureFlags,
    ...processedRemoteFeatureFlags,
    ...localOverrides,
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

  readonly #defaultFeatureFlags: FeatureFlags;

  #processedRemoteFeatureFlags: FeatureFlags;

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
   * @param options.prevClientVersion - The previous client version for feature flag cache invalidation.
   * @param options.defaultFeatureFlags - Client-side default feature flags used as the lowest-precedence layer under processed remote flags and local overrides. Not persisted.
   */
  constructor({
    messenger,
    state,
    clientConfigApiService,
    fetchInterval = DEFAULT_CACHE_DURATION,
    disabled = false,
    getMetaMetricsId,
    clientVersion,
    prevClientVersion,
    defaultFeatureFlags = {},
  }: {
    messenger: RemoteFeatureFlagControllerMessenger;
    state?: Partial<RemoteFeatureFlagControllerState>;
    clientConfigApiService: AbstractClientConfigApiService;
    getMetaMetricsId: () => string;
    fetchInterval?: number;
    disabled?: boolean;
    clientVersion: string;
    prevClientVersion?: string;
    defaultFeatureFlags?: FeatureFlags;
  }) {
    if (!isValidSemVerVersion(clientVersion)) {
      throw new Error(
        `Invalid clientVersion: "${clientVersion}". Must be a valid 3-part SemVer version string`,
      );
    }

    const initialState: RemoteFeatureFlagControllerState = {
      ...getDefaultRemoteFeatureFlagControllerState(),
      ...state,
    };

    const hasClientVersionChanged =
      isValidSemVerVersion(prevClientVersion) &&
      prevClientVersion !== clientVersion;

    // Last session's effective flags stand in for the remote layer until
    // `init` re-derives it from the persisted raw flags, or a fetch replaces
    // it. Overrides are layered on top rather than subtracted out, so a remote
    // flag that happens to share an override's value is not lost.
    const processedRemoteFeatureFlags = initialState.remoteFeatureFlags;

    super({
      name: controllerName,
      metadata: remoteFeatureFlagControllerMetadata,
      messenger,
      state: {
        ...initialState,
        remoteFeatureFlags: getEffectiveFeatureFlags({
          defaultFeatureFlags,
          processedRemoteFeatureFlags,
          localOverrides: initialState.localOverrides,
        }),
        cacheTimestamp: hasClientVersionChanged
          ? 0
          : initialState.cacheTimestamp,
      },
    });

    this.#defaultFeatureFlags = defaultFeatureFlags;
    this.#processedRemoteFeatureFlags = processedRemoteFeatureFlags;
    this.#fetchInterval = fetchInterval;
    this.#disabled = disabled;
    this.#clientConfigApiService = clientConfigApiService;
    this.#getMetaMetricsId = getMetaMetricsId;
    this.#clientVersion = clientVersion;

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  /**
   * Computes effective feature flags with precedence:
   * defaults < processed remote < local overrides.
   *
   * @param options - The layers to merge. Each defaults to the current layer.
   * @param options.processedRemoteFeatureFlags - The processed remote feature
   * flags. Defaults to the currently resolved remote layer.
   * @param options.localOverrides - Local overrides. Defaults to current state
   * overrides.
   * @returns The effective feature flags.
   */
  #getEffectiveFeatureFlags({
    processedRemoteFeatureFlags = this.#processedRemoteFeatureFlags,
    localOverrides = this.state.localOverrides,
  }: {
    processedRemoteFeatureFlags?: FeatureFlags;
    localOverrides?: FeatureFlags;
  }): FeatureFlags {
    return getEffectiveFeatureFlags({
      defaultFeatureFlags: this.#defaultFeatureFlags,
      processedRemoteFeatureFlags,
      localOverrides,
    });
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
   * Re-derives feature flags from the raw flags already in state, without
   * making a network request. Threshold selection needs to await a hash and so
   * cannot run in the constructor; clients should call this once after
   * construction. Calling it more than once is safe.
   *
   * Does nothing when there are no persisted raw flags, so that a fresh
   * install or state persisted before raw flags were stored keeps the flags
   * carried over from the previous session.
   */
  async init(): Promise<void> {
    const { rawRemoteFeatureFlags } = this.state;

    if (
      !rawRemoteFeatureFlags ||
      Object.keys(rawRemoteFeatureFlags).length === 0
    ) {
      return;
    }

    const resolved = await this.#resolveFeatureFlags(rawRemoteFeatureFlags);

    this.#processedRemoteFeatureFlags = resolved.processedFlags;

    this.update(() => {
      return {
        ...this.state,
        remoteFeatureFlags: this.#getEffectiveFeatureFlags({
          processedRemoteFeatureFlags: resolved.processedFlags,
        }),
        thresholdCache: resolved.thresholdCache,
        featureFlagThresholdGroups: resolved.featureFlagThresholdGroups,
      };
    });
  }

  /**
   * Resolves raw feature flags into the values that apply to this client and
   * user, selecting version and threshold entries and folding new thresholds
   * into the cached ones.
   *
   * @param rawRemoteFeatureFlags - The unprocessed feature flags.
   * @returns The processed flags, the updated threshold cache, and the
   * selected threshold group names.
   */
  async #resolveFeatureFlags(rawRemoteFeatureFlags: FeatureFlags): Promise<{
    processedFlags: FeatureFlags;
    thresholdCache: Record<string, number>;
    featureFlagThresholdGroups: Record<string, string>;
  }> {
    const {
      processedFlags,
      thresholdCacheUpdates,
      featureFlagThresholdGroupUpdates,
    } = await this.#processRemoteFeatureFlags(rawRemoteFeatureFlags);

    const metaMetricsId = this.#getMetaMetricsId();
    const currentFlagNames = Object.keys(rawRemoteFeatureFlags);

    // Build updated threshold cache
    const updatedThresholdCache = { ...(this.state.thresholdCache ?? {}) };

    // Apply new thresholds
    for (const [cacheKey, threshold] of Object.entries(thresholdCacheUpdates)) {
      updatedThresholdCache[cacheKey] = threshold;
    }

    // Clean up stale entries
    for (const cacheKey of Object.keys(updatedThresholdCache)) {
      const [cachedMetaMetricsId, ...cachedFlagNameParts] = cacheKey.split(':');
      const cachedFlagName = cachedFlagNameParts.join(':');
      if (
        cachedMetaMetricsId === metaMetricsId &&
        !currentFlagNames.includes(cachedFlagName)
      ) {
        delete updatedThresholdCache[cacheKey];
      }
    }

    return {
      processedFlags,
      thresholdCache: updatedThresholdCache,
      featureFlagThresholdGroups: featureFlagThresholdGroupUpdates,
    };
  }

  /**
   * Updates the controller's state with new feature flags and resets the cache timestamp.
   *
   * @param remoteFeatureFlags - The new feature flags to cache.
   */
  async #updateCache(remoteFeatureFlags: FeatureFlags): Promise<void> {
    const resolved = await this.#resolveFeatureFlags(remoteFeatureFlags);

    this.#processedRemoteFeatureFlags = resolved.processedFlags;

    // Single state update with all changes batched together
    this.update(() => {
      return {
        ...this.state,
        remoteFeatureFlags: this.#getEffectiveFeatureFlags({
          processedRemoteFeatureFlags: resolved.processedFlags,
        }),
        rawRemoteFeatureFlags: remoteFeatureFlags,
        cacheTimestamp: Date.now(),
        thresholdCache: resolved.thresholdCache,
        featureFlagThresholdGroups: resolved.featureFlagThresholdGroups,
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

  async #processRemoteFeatureFlags(remoteFeatureFlags: FeatureFlags): Promise<{
    processedFlags: FeatureFlags;
    thresholdCacheUpdates: Record<string, number>;
    featureFlagThresholdGroupUpdates: Record<string, string>;
  }> {
    const processedFlags: FeatureFlags = {};
    const metaMetricsId = this.#getMetaMetricsId();
    const thresholdCacheUpdates: Record<string, number> = {};
    const featureFlagThresholdGroupUpdates: Record<string, string> = {};

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

        // Skip threshold processing if metaMetricsId is not available
        if (!metaMetricsId) {
          // Preserve array as-is when user hasn't opted into MetaMetrics
          processedFlags[remoteFeatureFlagName] = processedValue;
          continue;
        }

        // Explicit-ID matching: check before hash-based threshold, bypasses cache
        const normalizedMetaMetricsId = metaMetricsId.trim().toLowerCase();
        const explicitMatch = findExplicitIdMatch(
          processedValue,
          normalizedMetaMetricsId,
        );

        if (explicitMatch) {
          processedValue = explicitMatch.value;
          if (explicitMatch.name) {
            featureFlagThresholdGroupUpdates[remoteFeatureFlagName] =
              explicitMatch.name;
          }
        } else {
          // Fall back to hash-based threshold selection with cache
          const cacheKey = `${metaMetricsId}:${remoteFeatureFlagName}` as const;
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
            processedValue = selectedGroup.value;
            if (selectedGroup.name) {
              featureFlagThresholdGroupUpdates[remoteFeatureFlagName] =
                selectedGroup.name;
            }
          }
        }
      }

      processedFlags[remoteFeatureFlagName] = processedValue;
    }

    return {
      processedFlags,
      thresholdCacheUpdates,
      featureFlagThresholdGroupUpdates,
    };
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
      const localOverrides = {
        ...this.state.localOverrides,
        [flagName]: value,
      };

      return {
        ...this.state,
        localOverrides,
        remoteFeatureFlags: this.#getEffectiveFeatureFlags({ localOverrides }),
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
        remoteFeatureFlags: this.#getEffectiveFeatureFlags({
          localOverrides: newLocalOverrides,
        }),
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
        remoteFeatureFlags: this.#getEffectiveFeatureFlags({
          localOverrides: {},
        }),
      };
    });
  }
}
