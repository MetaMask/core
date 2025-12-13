import type { Json, SemVerVersion } from '@metamask/utils';

// Define accepted values for client, distribution, and environment
export enum ClientType {
  Extension = 'extension',
  Mobile = 'mobile',
}

export enum DistributionType {
  Main = 'main',
  Flask = 'flask',
  /**
   * @deprecated Use DistributionType Main with EnvironmentType Beta instead
   */
  Beta = 'beta',
}

export enum EnvironmentType {
  Production = 'prod',
  ReleaseCandidate = 'rc',
  Development = 'dev',
  Beta = 'beta',
  Test = 'test',
  Exp = 'exp',
}

/** Type representing a feature flag with multiple version entries */
export type MultiVersionFeatureFlagValue = {
  versions: Record<SemVerVersion, Json>;
};

/** Type representing the feature flags collection */
export type FeatureFlags = {
  [key: string]: Json;
};

export type FeatureFlagScope = {
  type: string;
  value: number;
};

export type FeatureFlagScopeValue = {
  name: string;
  scope: FeatureFlagScope;
  value: Json;
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
   * Local overrides for feature flags that take precedence over remote flags.
   */
  localOverrides: FeatureFlags;
  /**
   * Raw A/B test flag arrays for flags that were processed from arrays to single values.
   */
  rawRemoteFeatureFlags: FeatureFlags;
  /**
   * The timestamp of the last successful feature flag cache.
   */
  cacheTimestamp: number;
};
