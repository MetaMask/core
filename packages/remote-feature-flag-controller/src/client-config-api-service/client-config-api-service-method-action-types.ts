/**
 * This file is auto generated.
 * Do not edit manually.
 */

import type { ClientConfigApiService } from './client-config-api-service.js';

/**
 * Fetches feature flags from the API with specific client, distribution, and
 * environment parameters. Always requests fresh data from the network, and
 * concurrent calls share a single request. Throws if the request fails or
 * the response is not an array of flag objects.
 *
 * @returns The feature flags merged into a single object, and the time they
 * were fetched.
 */
export type ClientConfigApiServiceFetchRemoteFeatureFlagsAction = {
  type: `ClientConfigApiService:fetchRemoteFeatureFlags`;
  handler: ClientConfigApiService['fetchRemoteFeatureFlags'];
};

/**
 * Union of all ClientConfigApiService action types.
 */
export type ClientConfigApiServiceMethodActions =
  ClientConfigApiServiceFetchRemoteFeatureFlagsAction;
