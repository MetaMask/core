import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';
import type { QueryClient } from '@tanstack/query-core';

import { createUIQueryClient } from '.';

/**
 * An example action for a data service that returns some assets.
 */
type FirstDataServiceGetAssetsAction = {
  type: 'FirstDataService:getAssets';
  handler: (assetIds: string[]) => Promise<unknown>;
};

/**
 * An example action for a second data service that returns some tokens.
 */
type SecondDataServiceGetTokensAction = {
  type: 'SecondDataService:getTokens';
  handler: (tokenIds: string[]) => Promise<unknown>;
};

/**
 * An example event for the second data service that is unrelated to the cache.
 */
type SecondDataServiceAssetsFetchedEvent = {
  type: 'SecondDataService:assetsFetched';
  payload: unknown[];
};

/**
 * The actions that the example root messenger supports.
 */
type RootMessengerActions =
  | FirstDataServiceGetAssetsAction
  | DataServiceInvalidateQueriesAction<'FirstDataService'>
  | SecondDataServiceGetTokensAction
  | DataServiceInvalidateQueriesAction<'SecondDataService'>;

/**
 * The events that the example root messenger supports.
 */
type RootMessengerEvents =
  | SecondDataServiceAssetsFetchedEvent
  | DataServiceGranularCacheUpdatedEvent<'FirstDataService'>
  | DataServiceGranularCacheUpdatedEvent<'SecondDataService'>;

const messenger = new Messenger<
  'Root',
  RootMessengerActions,
  RootMessengerEvents
>({ namespace: 'Root' });

// Assert that `createUIQueryClient` takes a messenger that supports calling any
// action and subscribing to `:cacheUpdated:${hash}` events, as long as they are
// namespaced under the given data service names, and that it returns a
// `QueryClient`.
createUIQueryClient(
  ['FirstDataService', 'SecondDataService'] as const,
  messenger,
) satisfies QueryClient;

// Assert that `createUIQueryClient` rejects a messenger that does not support
// the given data service names.
//
// Note: `@ts-expect-error` is used here so that the negative case is validated
// by `tsc` itself. If the messenger ever became assignable (e.g. a regression
// widened the adapter type), the unused directive would cause `tsc` to fail.
createUIQueryClient(
  ['UnsupportedDataService'] as const,
  // @ts-expect-error The messenger does not support `UnsupportedDataService`.
  messenger,
);
