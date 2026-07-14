import type {
  DataServiceGranularCacheUpdatedEvent,
  DataServiceInvalidateQueriesAction,
} from '@metamask/base-data-service';
import { Messenger } from '@metamask/messenger';
import { expect, test } from 'tstyche';

import { createUIQueryClient } from '.';

type FirstDataServiceGetAssetsAction = {
  type: 'FirstDataService:getAssets';
  handler: (assetIds: string[]) => Promise<unknown>;
};

type SecondDataServiceGetTokensAction = {
  type: 'SecondDataService:getTokens';
  handler: (tokenIds: string[]) => Promise<unknown>;
};

type RootMessengerActions =
  | FirstDataServiceGetAssetsAction
  | DataServiceInvalidateQueriesAction<'FirstDataService'>
  | SecondDataServiceGetTokensAction
  | DataServiceInvalidateQueriesAction<'SecondDataService'>;

type RootMessengerEvents =
  | DataServiceGranularCacheUpdatedEvent<'FirstDataService'>
  | DataServiceGranularCacheUpdatedEvent<'SecondDataService'>;

const messenger = new Messenger<'Root', RootMessengerActions, RootMessengerEvents>({
  namespace: 'Root',
});

test('createUIQueryClient', () => {
  expect(createUIQueryClient).type.toBeCallableWith(
    ['FirstDataService', 'SecondDataService'] as const,
    messenger,
  );
  expect(createUIQueryClient).type.not.toBeCallableWith(
    ['UnsupportedDataService'] as const,
    messenger,
  );
});
