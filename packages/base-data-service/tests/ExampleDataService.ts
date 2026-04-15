import { ConstantBackoff } from '@metamask/controller-utils';
import { Messenger } from '@metamask/messenger';
import { CaipAssetId, Duration, inMilliseconds, Json } from '@metamask/utils';

import {
  BaseDataService,
  DataServiceInvalidateQueriesAction,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
} from '../src/BaseDataService';
import { ExampleDataServiceMethodActions } from './ExampleDataService-method-action-types';

export const serviceName = 'ExampleDataService';

export type ExampleDataServiceActions =
  | ExampleDataServiceMethodActions
  | DataServiceInvalidateQueriesAction<typeof serviceName>;

export type ExampleDataServiceEvents =
  | DataServiceCacheUpdatedEvent<typeof serviceName>
  | DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type ExampleMessenger = Messenger<
  typeof serviceName,
  ExampleDataServiceActions,
  ExampleDataServiceEvents
>;

export type GetAssetsResponse = {
  assetId: CaipAssetId;
  decimals: number;
  name: string;
  symbol: string;
};

export type GetActivityResponse = {
  data: Json[];
  pageInfo: {
    count: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    startCursor: string;
    endCursor: string;
  };
};

export type PageParam =
  | {
      before: string;
    }
  | { after: string };

const MESSENGER_EXPOSED_METHODS = ['getAssets', 'getActivity'] as const;

export class ExampleDataService extends BaseDataService<
  typeof serviceName,
  ExampleMessenger
> {
  readonly #accountsBaseUrl = 'https://accounts.api.cx.metamask.io';

  readonly #tokensBaseUrl = 'https://tokens.api.cx.metamask.io';

  constructor(messenger: ExampleMessenger) {
    super({
      name: serviceName,
      messenger,
      policyOptions: {
        maxRetries: 2,
        maxConsecutiveFailures: 3,
        backoff: new ConstantBackoff(0),
      },
    });

    this.messenger.registerMethodActionHandlers(
      this,
      MESSENGER_EXPOSED_METHODS,
    );
  }

  async getAssets(assets: string[]): Promise<GetAssetsResponse> {
    return this.fetchQuery({
      queryKey: [`${this.name}:getAssets`, assets],
      queryFn: async () => {
        const url = new URL(
          `${this.#tokensBaseUrl}/v3/assets?assetIds=${assets.join(',')}`,
        );

        const response = await fetch(url);

        if (!response.ok) {
          throw new Error(`Query failed with status code: ${response.status}.`);
        }

        return response.json();
      },
      staleTime: inMilliseconds(1, Duration.Day),
      cacheTime: 0, // Not recommended in production, just for testing purposes.
    });
  }

  async getActivity(
    address: string,
    page?: PageParam,
  ): Promise<GetActivityResponse> {
    return this.fetchInfiniteQuery<GetActivityResponse>(
      {
        queryKey: [`${this.name}:getActivity`, address],
        queryFn: async ({ pageParam }) => {
          const caipAddress = `eip155:0:${address.toLowerCase()}`;
          const url = new URL(
            `${this.#accountsBaseUrl}/v4/multiaccount/transactions?limit=3&accountAddresses=${caipAddress}`,
          );

          if (pageParam?.after) {
            url.searchParams.set('after', pageParam.after);
          } else if (pageParam?.before) {
            url.searchParams.set('before', pageParam.before);
          }

          const response = await fetch(url);

          if (!response.ok) {
            throw new Error(
              `Query failed with status code: ${response.status}.`,
            );
          }

          return response.json();
        },
        getPreviousPageParam: ({ pageInfo }) =>
          pageInfo.hasPreviousPage
            ? { before: pageInfo.startCursor }
            : undefined,
        getNextPageParam: ({ pageInfo }) =>
          pageInfo.hasNextPage ? { after: pageInfo.endCursor } : undefined,
        staleTime: inMilliseconds(5, Duration.Minute),
      },
      page,
    );
  }

  destroy(): void {
    super.destroy();
  }
}
