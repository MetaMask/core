import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import type { FeatureFlags } from './remote-feature-flag-controller-types';

// === GENERAL ===

export const controllerName = 'RemoteFeatureFlagController';
const DEFAULT_CACHE_DURATION = 24 * 60 * 60 * 1000; // 1 day

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

export type RemoteFeatureFlagControllerGetRemoteFeatureFlagsAction = {
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
 * Returns the default state for the RemoteFeatureFlagController
 * @returns The default controller state
 */
export function getDefaultRemoteFeatureFlagControllerState(): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: [],
    cacheTimestamp: 0,
  };
}

// === CONTROLLER DEFINITION ===

export class RemoteFeatureFlagController extends BaseController<
  typeof controllerName,
  RemoteFeatureFlagControllerState,
  RemoteFeatureFlagControllerMessenger
> {
  readonly #fetchInterval: number;

  #disabled: boolean;

  #clientConfigApiService: AbstractClientConfigApiService;

  #inProgressFlagUpdate?: Promise<{ cachedData: FeatureFlags }>;

  constructor({
    messenger,
    state,
    clientConfigApiService,
    fetchInterval = DEFAULT_CACHE_DURATION,
    disabled = false,
  }: {
    messenger: RemoteFeatureFlagControllerMessenger;
    state: Partial<RemoteFeatureFlagControllerState>;
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

  private isCacheValid(): boolean {
    return Date.now() - this.state.cacheTimestamp < this.#fetchInterval;
  }

  async getRemoteFeatureFlags(): Promise<FeatureFlags> {
    if (this.#disabled) {
      return [];
    }

    if (this.isCacheValid()) {
      return this.state.remoteFeatureFlags;
    }

    if (this.#inProgressFlagUpdate) {
      await this.#inProgressFlagUpdate;
    }

    try {
      this.#inProgressFlagUpdate = this.#clientConfigApiService.fetchFlags();
      const flags = await this.#inProgressFlagUpdate;

      if (flags.cachedData.length > 0) {
        this.updateCache(flags.cachedData);
        return flags.cachedData;
      }
    } finally {
      this.#inProgressFlagUpdate = undefined;
    }

    return this.state.remoteFeatureFlags;
  }

  private updateCache(remoteFeatureFlags: FeatureFlags) {
    const newState: RemoteFeatureFlagControllerState = {
      remoteFeatureFlags,
      cacheTimestamp: Date.now(),
    };

    this.update(() => newState);
  }

  /**
   * Allows controller to make network request
   */
  enable(): void {
    this.#disabled = false;
  }

  /**
   * Blocks controller from making network request
   */
  disable(): void {
    this.#disabled = true;
  }
}
