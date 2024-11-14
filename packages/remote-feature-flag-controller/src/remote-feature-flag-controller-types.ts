import type { ControllerGetStateAction } from '@metamask/base-controller';
import type { Json } from '@metamask/utils';

// Define accepted values for client, distribution, and environment
export enum ClientType {
  Extension = 'extension',
  Mobile = 'mobile',
}

export enum DistributionType {
  Main = 'main',
  Flask = 'flask',
}

export enum EnvironmentType {
  Production = 'prod',
  ReleaseCandidate = 'rc',
  Development = 'dev',
}

/** Type representing the feature flags collection */
export type FeatureFlag = {
  [key: string]: Json;
};

export type FeatureFlags = FeatureFlag[];

/**
 * Describes the shape of the state object for the {@link RemoteFeatureFlagController}.
 */
export type RemoteFeatureFlagControllerState = {
  /**
   * The collection of feature flags and their respective values, which can be objects.
   */
  remoteFeatureFlags: FeatureFlags;
  /**
   * The timestamp of the last successful feature flag cache.
   */
  cacheTimestamp: number;
};

/**
 * Constructs the default state for the {@link RemoteFeatureFlagController}.
 *
 * @returns The default {@link RemoteFeatureFlagController} state.
 */
export function getDefaultRemoteFeatureFlagControllerState(): RemoteFeatureFlagControllerState {
  return {
    remoteFeatureFlags: [],
    cacheTimestamp: 0,
  };
}

/**
 * The action to retrieve the state of the {@link RemoteFeatureFlagController}.
 */
export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    'RemoteFeatureFlagController',
    RemoteFeatureFlagControllerState
  >;
