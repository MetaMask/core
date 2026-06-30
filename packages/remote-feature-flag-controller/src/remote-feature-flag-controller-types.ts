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

export enum ThresholdVersion {
  DirectValue = 2,
}

export enum FeatureFlagIdType {
  MetaMetrics = 'metametrics',
  Canonical = 'canonical',
}

export type FeatureFlagScopeValue = {
  name: string;
  /**
   * Optional label for direct-value threshold entries. This replaces `name` in
   * v2 configurations and is not emitted in processed controller state.
   */
  thresholdName?: string;
  /**
   * Selects which client identifier is used for deterministic threshold
   * assignment. Defaults to `metametrics` when omitted.
   */
  idType?: FeatureFlagIdType;
  /**
   * Selects the threshold entry output shape. Unrecognized versions fall back
   * to the legacy `{ name, value }` wrapper for backwards compatibility.
   */
  thresholdVersion?: ThresholdVersion;
  scope: FeatureFlagScope;
  value: Json;
};

export type ApiDataResponse = FeatureFlags[];

export type ServiceResponse = {
  remoteFeatureFlags: FeatureFlags;
  cacheTimestamp: number | null;
};
