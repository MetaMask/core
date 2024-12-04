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
export type FeatureFlags = {
  [key: string]: Json;
};

export type ApiDataResponse = FeatureFlags[];

export type ServiceResponse = {
  remoteFeatureFlags: FeatureFlags;
  cacheTimestamp: number | null;
};

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
 * The action to retrieve the state of the {@link RemoteFeatureFlagController}.
 */
export type RemoteFeatureFlagControllerGetStateAction =
  ControllerGetStateAction<
    'RemoteFeatureFlagController',
    RemoteFeatureFlagControllerState
  >;
