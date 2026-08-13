import { Messenger } from '@metamask/messenger';
import { CaipAssetId, Duration, inMilliseconds, Json } from '@metamask/utils';
import { ConstantBackoff } from 'cockatiel';

import {
  BaseDataService,
  DataServiceInvalidateQueriesAction,
  DataServiceCacheUpdatedEvent,
  DataServiceGranularCacheUpdatedEvent,
  PersistenceConfiguration,
} from '../src/BaseDataService.js';
import { ExampleDataServiceMethodActions } from './ExampleDataService-method-action-types.js';

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

export type PageParam = {
  before?: string;
  after?: string;
};

const MESSENGER_EXPOSED_METHODS = ['getAssets', 'getActivity'] as const;

export class ExampleDataService extends BaseDataService<
  typeof serviceName,
  ExampleMessenger
> {
  readonly #accountsBaseUrl = 'https://accounts.api.cx.metamask.io';

  readonly #tokensBaseUrl = 'https://tokens.api.cx.metamask.io';

  // Records the page params that `getActivityWithoutCallbacks`'s query function
  // is invoked with, so tests can assert what actually reached it.
  readonly pageParamsSeen: (PageParam | null | undefined)[] = [];

  constructor(
    messenger: ExampleMessenger,
    { persistenceConfig }: { persistenceConfig?: PersistenceConfiguration } = {
      persistenceConfig: { maxAge: inMilliseconds(1, Duration.Day) },
    },
  ) {
    super({
      name: serviceName,
      messenger,
      policyOptions: {
        maxRetries: 2,
        maxConsecutiveFailures: 3,
        backoff: new ConstantBackoff(0),
      },
      persistenceConfig,
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
      gcTime: inMilliseconds(1, Duration.Day),
    });
  }

  async getActivity(
    address: string,
    page?: PageParam,
  ): Promise<GetActivityResponse> {
    return this.fetchInfiniteQuery<
      GetActivityResponse,
      unknown,
      GetActivityResponse,
      [string, string],
      PageParam
    >(
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

  /**
   * Fetch activity without providing page-param callbacks, driving pagination
   * purely by the explicit page param passed to the base method (the way a
   * consumer that paginates by cursor does). Uses `null` as its first-page
   * param and a zero `staleTime` so refetches can be exercised, and records
   * every page param the query function receives in `pageParamsSeen`.
   *
   * @param address - The account address.
   * @param page - The page to fetch. Passed last so this method works when
   * invoked through `createUIQueryClient`, which appends the page param as the
   * final argument.
   * @returns A page of activity.
   */
  async getActivityWithoutCallbacks(
    address: string,
    page?: PageParam,
  ): Promise<GetActivityResponse> {
    return this.fetchInfiniteQuery<
      GetActivityResponse,
      unknown,
      GetActivityResponse,
      [string, string],
      PageParam | null
    >(
      {
        queryKey: [`${this.name}:getActivityWithoutCallbacks`, address],
        queryFn: async ({ pageParam }) => {
          this.pageParamsSeen.push(pageParam);

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
        initialPageParam: null,
        staleTime: 0,
      },
      page,
    );
  }

  destroy(): void {
    super.destroy();
  }
}
