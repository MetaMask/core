import { Messenger } from '@metamask/messenger';
import {
  StorageServiceGetItemAction,
  StorageServiceRemoveItemAction,
  StorageServiceSetItemAction,
} from '@metamask/storage-service';
import {
  object,
  number,
  string,
  array,
  Infer,
  nullable,
  optional,
} from '@metamask/superstruct';
import {
  CaipAssetTypeStruct,
  Duration,
  inMilliseconds,
  Json,
} from '@metamask/utils';
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
  | DataServiceInvalidateQueriesAction<typeof serviceName>
  | StorageServiceGetItemAction
  | StorageServiceSetItemAction
  | StorageServiceRemoveItemAction;

export type ExampleDataServiceEvents =
  | DataServiceCacheUpdatedEvent<typeof serviceName>
  | DataServiceGranularCacheUpdatedEvent<typeof serviceName>;

export type ExampleMessenger = Messenger<
  typeof serviceName,
  ExampleDataServiceActions,
  ExampleDataServiceEvents
>;

const GetAssetsResponseStruct = array(
  object({
    assetId: CaipAssetTypeStruct,
    decimals: number(),
    name: string(),
    symbol: string(),
  }),
);

export type GetAssetsResponse = Infer<typeof GetAssetsResponseStruct>;

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

export const AddFollowerResponseStruct = object({
  followed: array(
    object({
      profileId: string(),
      address: string(),
      name: string(),
      imageUrl: optional(nullable(string())),
    }),
  ),
});

export type AddFollowerResponse = Infer<typeof AddFollowerResponseStruct>;

export type PageParam =
  | {
      before: string;
    }
  | { after: string }
  | null;

const MESSENGER_EXPOSED_METHODS = [
  'getAssets',
  'getActivity',
  'addFollower',
  'createDataDeletionTask',
] as const;

export class ExampleDataService extends BaseDataService<
  typeof serviceName,
  ExampleMessenger
> {
  readonly #accountsBaseUrl = 'https://accounts.api.cx.metamask.io';

  readonly #tokensBaseUrl = 'https://tokens.api.cx.metamask.io';

  readonly #socialBaseUrl = 'https://social.api.cx.metamask.io';

  readonly #segmentRegulationsUrl = 'https://proxy.example.com/v1beta';

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
      responseStruct: GetAssetsResponseStruct,
    });
  }

  async getActivity(
    address: string,
    page?: PageParam,
  ): Promise<GetActivityResponse> {
    return this.fetchInfiniteQuery(
      {
        queryKey: [`${this.name}:getActivity`, address],
        initialPageParam: null as PageParam,
        queryFn: async ({ pageParam }) => {
          const caipAddress = `eip155:0:${address.toLowerCase()}`;
          const url = new URL(
            `${this.#accountsBaseUrl}/v4/multiaccount/transactions?limit=3&accountAddresses=${caipAddress}`,
          );

          // eslint-disable-next-line no-restricted-syntax
          if (pageParam && 'after' in pageParam) {
            url.searchParams.set('after', pageParam.after);
            // eslint-disable-next-line no-restricted-syntax
          } else if (pageParam && 'before' in pageParam) {
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
          pageInfo.hasPreviousPage ? { before: pageInfo.startCursor } : null,
        getNextPageParam: ({ pageInfo }) =>
          pageInfo.hasNextPage ? { after: pageInfo.endCursor } : null,
        staleTime: inMilliseconds(5, Duration.Minute),
      },
      page,
    );
  }

  async addFollower(followerId: string): Promise<AddFollowerResponse> {
    return this.executeMutation({
      mutationKey: [`${this.name}:addFollower`, followerId],
      mutationFn: async () => {
        const url = new URL(`${this.#socialBaseUrl}/api/v1/users/me/follows`);

        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ followerId }),
        });

        if (!response.ok) {
          // NOTE: Can't use HttpError from controller-utils due to lint:tsc not
          // being fully rolled out across the monorepo.
          throw new Error(
            `Mutation failed with status code: ${response.status}.`,
          );
        }

        return response.json() as Promise<Json>;
      },
      gcTime: inMilliseconds(1, Duration.Day),
      responseStruct: AddFollowerResponseStruct,
    });
  }

  async createDataDeletionTask(
    analyticsId: string,
    segmentSourceId: string,
  ): Promise<{
    status: 'ok' | 'error';
    regulateId: string;
  }> {
    return this.executeMutation({
      mutationKey: [
        `${this.name}:createDataDeletionTask`,
        analyticsId,
        segmentSourceId,
      ],
      mutationFn: async () => {
        const url = `${this.#segmentRegulationsUrl}/regulations/sources/${segmentSourceId}`;

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            regulationType: 'DELETE_ONLY',
            subjectType: 'USER_ID',
            subjectIds: [analyticsId],
          }),
        });

        if (!response.ok) {
          // NOTE: Can't use HttpError from controller-utils due to lint:tsc not
          // being fully rolled out across the monorepo.
          throw new Error(
            `Creating data deletion task failed with status '${response.status}'`,
          );
        }

        return response.json();
      },
      gcTime: inMilliseconds(1, Duration.Day),
    });
  }

  destroy(): void {
    super.destroy();
  }
}
