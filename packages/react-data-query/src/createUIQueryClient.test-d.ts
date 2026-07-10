import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';
import type { QueryClient } from '@tanstack/query-core';
import { expectError, expectType } from 'tsd';

import { createUIQueryClient } from '.';

const DATA_SERVICES = ['ExampleDataService'] as const;

type ExampleDataServiceGetAssetsAction = {
  type: 'ExampleDataService:getAssets';
  handler: (assets: string[]) => Promise<unknown>;
};

type ExampleDataServiceActions =
  | ExampleDataServiceGetAssetsAction
  | DataServiceInvalidateQueriesAction<'ExampleDataService'>;

type ExampleDataServiceEvents =
  DataServiceGranularCacheUpdatedEvent<'ExampleDataService'>;

const messenger = new Messenger<
  'ExampleDataService',
  ExampleDataServiceActions,
  ExampleDataServiceEvents
>({ namespace: 'ExampleDataService' });

// Assert that we don't see type errors when attempting to use
// createUIQueryClient in the way we advertise.
// Such type errors don't show up when running ESLint or Jest tests.
expectType<QueryClient>(createUIQueryClient(DATA_SERVICES, messenger));

// Assert that the messenger supports calling actions and managing events for
// the given data services (i.e. the supported capabilities are namespaced
// appropriately).
expectError(createUIQueryClient(['OtherDataService'] as const, messenger));
