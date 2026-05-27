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

export enum FeatureFlagScopeType {
  Threshold = 'threshold',
  MetaMetricsId = 'metaMetricsId',
}

export type FeatureFlagThresholdScope = {
  type: FeatureFlagScopeType.Threshold;
  value: number;
};

export type FeatureFlagMetaMetricsIdScope = {
  type: FeatureFlagScopeType.MetaMetricsId;
  value: string;
};

export type FeatureFlagScope =
  | FeatureFlagThresholdScope
  | FeatureFlagMetaMetricsIdScope;

export type FeatureFlagScopeValue = {
  name: string;
  scope: FeatureFlagScope;
  value: Json;
};

export type FeatureFlagThresholdScopeValue = FeatureFlagScopeValue & {
  scope: FeatureFlagThresholdScope;
};

export type FeatureFlagMetaMetricsIdScopeValue = FeatureFlagScopeValue & {
  scope: FeatureFlagMetaMetricsIdScope;
};

export type ApiDataResponse = FeatureFlags[];

export type ServiceResponse = {
  remoteFeatureFlags: FeatureFlags;
  cacheTimestamp: number | null;
};
