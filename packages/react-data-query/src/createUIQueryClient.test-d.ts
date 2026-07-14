import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';
import type { QueryClient } from '@tanstack/query-core';
import { expectType } from 'tsd';

import { createUIQueryClient } from '.';

type FirstDataServiceGetAssetsAction = {
  type: 'FirstDataService:getAssets';
  handler: (assetIds: string[]) => Promise<unknown>;
};

type SecondDataServiceGetTokensAction = {
  type: 'SecondDataService:getTokens';
  handler: (tokenIds: string[]) => Promise<unknown>;
};

type SecondDataServiceAssetsFetchedEvent = {
  type: 'SecondDataService:assetsFetched';
  payload: unknown[];
};

type RootMessengerActions =
  | FirstDataServiceGetAssetsAction
  | DataServiceInvalidateQueriesAction<'FirstDataService'>
  | SecondDataServiceGetTokensAction
  | DataServiceInvalidateQueriesAction<'SecondDataService'>;

type RootMessengerEvents =
  | SecondDataServiceAssetsFetchedEvent
  | DataServiceGranularCacheUpdatedEvent<'FirstDataService'>
  | DataServiceGranularCacheUpdatedEvent<'SecondDataService'>;

const messenger = new Messenger<
  'Root',
  RootMessengerActions,
  RootMessengerEvents
>({ namespace: 'Root' });

// Assert that `createUIQueryClient` takes a messenger that supports calling
// any action and `:cacheUpdated:${hash}` events, as long as they are namespaced
// under the given data service names.
expectType<QueryClient>(
  createUIQueryClient(
    ['FirstDataService', 'SecondDataService'] as const,
    messenger,
  ),
);
// Assert that `createUIQueryClient` rejects a messenger that does not support
// the given data service names.
//
// Note: `@ts-expect-error` is used here rather than `expectError` so that the
// negative case is validated by `tsc` itself. This way, a regression that
// changes the positive case above (or removes the expected error here) causes
// `tsc` to fail, instead of being silently swallowed.
createUIQueryClient(
  ['UnsupportedDataService'] as const,
  // @ts-expect-error The messenger does not support `UnsupportedDataService`.
  messenger,
);
