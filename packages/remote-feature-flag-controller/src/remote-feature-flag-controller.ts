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
  FeatureFlagScope,
} from './remote-feature-flag-controller-types';

import {
  generateDeterministicRandomNumber,
  isFeatureFlagWithScopeValue,
} from './utils/user-segmentation-utils';
import { isVersionFeatureFlag, getVersionData } from './utils/version';

// === GENERAL ===

export const controllerName = 'RemoteFeatureFlagController';
export const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

// === STATE ===

export type RemoteFeatureFlagControllerState = {
  remoteFeatureFlags: FeatureFlags;
  localOverrides: FeatureFlags;
  abTestRawFlags: FeatureFlags;
  cacheTimestamp: number;
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
  abTestRawFlags: {
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

export type RemoteFeatureFlagControllerGetFlagOverrideAction = {
  type: `${typeof controllerName}:getFlagOverride`;
  handler: RemoteFeatureFlagController['getFlagOverride'];
};

export type RemoteFeatureFlagControllerClearFlagOverrideAction = {
  type: `${typeof controllerName}:clearFlagOverride`;
  handler: RemoteFeatureFlagController['clearFlagOverride'];
};

export type RemoteFeatureFlagControllerClearAllOverridesAction = {
  type: `${typeof controllerName}:clearAllOverrides`;
  handler: RemoteFeatureFlagController['clearAllOverrides'];
};

export type RemoteFeatureFlagControllerGetFlagAction = {
  type: `${typeof controllerName}:getFlag`;
  handler: RemoteFeatureFlagController['getFlag'];
};

export type RemoteFeatureFlagControllerGetAllFlagsAction = {
  type: `${typeof controllerName}:getAllFlags`;
  handler: RemoteFeatureFlagController['getAllFlags'];
};

export type RemoteFeatureFlagControllerGetAvailableABTestGroupsAction = {
  type: `${typeof controllerName}:getAvailableABTestGroups`;
  handler: RemoteFeatureFlagController['getAvailableABTestGroups'];
};

export type RemoteFeatureFlagControllerGetAllABTestFlagsAction = {
  type: `${typeof controllerName}:getAllABTestFlags`;
  handler: RemoteFeatureFlagController['getAllABTestFlags'];
};

export type RemoteFeatureFlagControllerActions =
  | RemoteFeatureFlagControllerGetStateAction
  | RemoteFeatureFlagControllerUpdateRemoteFeatureFlagsAction
  | RemoteFeatureFlagControllerSetFlagOverrideAction
  | RemoteFeatureFlagControllerGetFlagOverrideAction
  | RemoteFeatureFlagControllerClearFlagOverrideAction
  | RemoteFeatureFlagControllerClearAllOverridesAction
  | RemoteFeatureFlagControllerGetFlagAction
  | RemoteFeatureFlagControllerGetAllFlagsAction
  | RemoteFeatureFlagControllerGetAvailableABTestGroupsAction
  | RemoteFeatureFlagControllerGetAllABTestFlagsAction;

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
    abTestRawFlags: {},
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
  async #updateCache(remoteFeatureFlags: FeatureFlags) {
    const { processedFlags, abTestRawFlags } =
      await this.#processRemoteFeatureFlags(remoteFeatureFlags);
    this.update(() => {
      return {
        remoteFeatureFlags: processedFlags,
        localOverrides: this.state.localOverrides,
        abTestRawFlags,
        cacheTimestamp: Date.now(),
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
  ): Promise<{ processedFlags: FeatureFlags; abTestRawFlags: FeatureFlags }> {
    const processedRemoteFeatureFlags: FeatureFlags = {};
    const abTestRawFlags: FeatureFlags = {};
    const metaMetricsId = this.#getMetaMetricsId();
    const thresholdValue = generateDeterministicRandomNumber(metaMetricsId);

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

      if (Array.isArray(processedValue) && thresholdValue) {
        // Store the raw A/B test array for later use
        abTestRawFlags[remoteFeatureFlagName] = remoteFeatureFlagValue;
        
        const selectedGroup = processedValue.find(
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
    return { processedFlags: processedRemoteFeatureFlags, abTestRawFlags };
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
        remoteFeatureFlags: this.state.remoteFeatureFlags,
        localOverrides: {
          ...this.state.localOverrides,
          [flagName]: value,
        },
        abTestRawFlags: this.state.abTestRawFlags,
        cacheTimestamp: this.state.cacheTimestamp,
      };
    });
  }

  /**
   * Gets the current override value for a specific feature flag.
   *
   * @param flagName - The name of the feature flag.
   * @returns The override value if it exists, undefined otherwise.
   */
  getFlagOverride(flagName: string): Json | undefined {
    return this.state.localOverrides[flagName];
  }

  /**
   * Clears the local override for a specific feature flag.
   *
   * @param flagName - The name of the feature flag to clear.
   */
  clearFlagOverride(flagName: string): void {
    const newOverrides = { ...this.state.localOverrides };
    delete newOverrides[flagName];
    this.update(() => {
      return {
        remoteFeatureFlags: this.state.remoteFeatureFlags,
        localOverrides: newOverrides,
        abTestRawFlags: this.state.abTestRawFlags,
        cacheTimestamp: this.state.cacheTimestamp,
      };
    });
  }

  /**
   * Clears all local feature flag overrides.
   */
  clearAllOverrides(): void {
    this.update(() => {
      return {
        remoteFeatureFlags: this.state.remoteFeatureFlags,
        localOverrides: {},
        abTestRawFlags: this.state.abTestRawFlags,
        cacheTimestamp: this.state.cacheTimestamp,
      };
    });
  }

  /**
   * Gets the effective value of a feature flag, considering both remote flags and local overrides.
   * Local overrides take precedence over remote flags.
   *
   * @param flagName - The name of the feature flag.
   * @returns The effective flag value (override if exists, otherwise remote flag).
   */
  getFlag(flagName: string): Json | undefined {
    // Check local overrides first
    if (flagName in this.state.localOverrides) {
      return this.state.localOverrides[flagName];
    }
    // Fall back to remote flags
    return this.state.remoteFeatureFlags[flagName];
  }

  /**
   * Gets all effective feature flags, combining remote flags with local overrides.
   * Local overrides take precedence over remote flags with the same name.
   *
   * @returns An object containing all effective feature flags.
   */
  getAllFlags(): FeatureFlags {
    return {
      ...this.state.remoteFeatureFlags,
      ...this.state.localOverrides,
    };
  }

  /**
   * Gets available A/B test groups for a specific feature flag.
   * Returns all available options that can be used for overriding.
   *
   * @param flagName - The name of the feature flag.
   * @returns Array of available A/B test groups with their names and values, or undefined if not an A/B test flag.
   */
  getAvailableABTestGroups(
    flagName: string,
  ):
    | { name: string; value: Json; scope?: FeatureFlagScope }[]
    | undefined {
    const rawFlag = this.state.abTestRawFlags[flagName];

    if (!Array.isArray(rawFlag)) {
      return undefined;
    }

    return rawFlag
      .filter(
        (item): item is FeatureFlagScopeValue =>
          typeof item === 'object' &&
          item !== null &&
          'name' in item &&
          'value' in item,
      )
      .map((group) => ({
        name: group.name,
        value: group.value,
        scope: group.scope,
      }));
  }

  /**
   * Gets all feature flags that have A/B test groups available.
   * Useful for discovering which flags can be overridden with specific group values.
   *
   * @returns Object mapping flag names to their available A/B test groups.
   */
  getAllABTestFlags(): Record<
    string,
    { name: string; value: Json; scope?: FeatureFlagScope }[]
  > {
    const abTestFlags: Record<
      string,
      { name: string; value: Json; scope?: FeatureFlagScope }[]
    > = {};

    for (const [flagName] of Object.entries(this.state.abTestRawFlags)) {
      const groups = this.getAvailableABTestGroups(flagName);
      if (groups) {
        abTestFlags[flagName] = groups;
      }
    }

    return abTestFlags;
  }
}
