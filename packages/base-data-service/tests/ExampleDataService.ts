import { Messenger } from '@metamask/messenger';
import { CaipAssetId, Duration, inMilliseconds, Json } from '@metamask/utils';

import { BaseDataService, DataServiceActions } from '../src/BaseDataService';

export const serviceName = 'ExampleDataService';

export type ExampleDataServiceGetAssetsAction = {
  type: `${typeof serviceName}:getAssets`;
  handler: ExampleDataService['getAssets'];
};

export type ExampleDataServiceGetActivityAction = {
  type: `${typeof serviceName}:getActivity`;
  handler: ExampleDataService['getActivity'];
};

export type ExampleDataServiceActions =
  | ExampleDataServiceGetAssetsAction
  | ExampleDataServiceGetActivityAction
  | DataServiceActions<typeof serviceName>;

export type ExampleMessenger = Messenger<
  typeof serviceName,
  ExampleDataServiceActions,
  never
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
    });

    messenger.registerActionHandler(
      `${this.name}:getAssets`,
      this.getAssets.bind(this),
    );

    messenger.registerActionHandler(
      `${this.name}:getActivity`,
      this.getActivity.bind(this),
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

        return response.json();
      },
      staleTime: inMilliseconds(1, Duration.Day),
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
}
