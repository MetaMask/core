import type { ServicePolicy } from '@metamask/controller-utils';

import type { ServiceResponse } from '../remote-feature-flag-controller-types';

/**
 * A service object responsible for fetching feature flags.
 */
export type IAbstractClientConfigApiService = Partial<
  Pick<ServicePolicy, 'onBreak' | 'onDegraded'>
> & {
  /**
   * Fetches feature flags from the API with specific client, distribution, and
   * environment parameters. Provides structured error handling, including
   * fallback to cached data if available.
   *
   * @returns An object of feature flags and their boolean values or a
   * structured error object.
   */
  fetchRemoteFeatureFlags(): Promise<ServiceResponse>;
};
