/**
 * This file is intended to be run via `tsc` (using `tsconfig.type-tests.json`)
 * instead of Jest. If `tsc` runs successfully, the test file succeeds with no
 * output, otherwise it fails.
 *
 * This file exists because if a type error occurs in a test it is not caught by
 * ESLint or Jest. In the future we may need to figure out how to run `tsc`
 * across the monorepo; this is more of a stopgap solution.
 */

import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';
import type { QueryClient } from '@tanstack/query-core';

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

type ThirdDataServiceGetTransactionsAction = {
  type: 'ThirdDataService:getTransactions';
  handler: (transactionIds: string[]) => Promise<unknown>;
};

type RootMessengerActions =
  | FirstDataServiceGetAssetsAction
  | DataServiceInvalidateQueriesAction<'FirstDataService'>
  | SecondDataServiceGetTokensAction
  | DataServiceInvalidateQueriesAction<'SecondDataService'>
  | ThirdDataServiceGetTransactionsAction;

type RootMessengerEvents =
  | SecondDataServiceAssetsFetchedEvent
  | DataServiceGranularCacheUpdatedEvent<'FirstDataService'>
  | DataServiceGranularCacheUpdatedEvent<'SecondDataService'>;

const messenger = new Messenger<
  'Root',
  RootMessengerActions,
  RootMessengerEvents
>({ namespace: 'Root' });

// "Assert" that `createUIQueryClient` 1) takes a messenger that minimally
// supports actions and `:cacheUpdated:${hash}` events for the given data
// service names, even when the messenger additionally supports actions and
// events from other namespaces (here, `ThirdDataService`), and 2) it returns a
// `QueryClient`.
createUIQueryClient(
  ['FirstDataService', 'SecondDataService'] as const,
  messenger,
) satisfies QueryClient;

// "Assert" that `createUIQueryClient` rejects a messenger that does not support
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
