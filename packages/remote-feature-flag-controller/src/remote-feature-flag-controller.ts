import type {
  ControllerGetStateAction,
  ControllerStateChangeEvent,
  RestrictedControllerMessenger,
} from '@metamask/base-controller';
import { BaseController } from '@metamask/base-controller';
import { createDeferredPromise } from '@metamask/utils';

import type { AbstractClientConfigApiService } from './client-config-api-service/abstract-client-config-api-service';
import type { FeatureFlags } from './remote-feature-flag-controller-types';

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

  #inProgressFlagUpdate?: Promise<FeatureFlags>;

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

  #isCacheExpired(): boolean {
    return Date.now() - this.state.cacheTimestamp < this.#fetchInterval;
  }

  async getRemoteFeatureFlags(): Promise<FeatureFlags> {
    if (this.#disabled) {
      return [];
    }

    if (this.#isCacheExpired()) {
      return this.state.remoteFeatureFlags;
    }

    if (this.#inProgressFlagUpdate) {
      return await this.#inProgressFlagUpdate;
    }

    const { promise, resolve } = createDeferredPromise<FeatureFlags>({
      suppressUnhandledRejection: true,
    });
    this.#inProgressFlagUpdate = promise;

    try {
      const flags =
        await this.#clientConfigApiService.fetchRemoteFeatureFlags();
      if (flags.cachedData.length > 0) {
        this.updateCache(flags.cachedData);
        resolve(flags.cachedData);
      }
      return await promise;
    } finally {
      this.#inProgressFlagUpdate = undefined;
    }
  }

  private updateCache(remoteFeatureFlags: FeatureFlags) {
    this.update(() => {
      return {
        remoteFeatureFlags,
        cacheTimestamp: Date.now(),
      };
    });
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
