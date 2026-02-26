import { Messenger } from '@metamask/messenger';
import { Duration, inMilliseconds, Json } from '@metamask/utils';

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

  async getAssets(assets: string[]) {
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

  async getActivity(address: string, page?: string) {
    return this.fetchInfiniteQuery<{
      data: Json;
      pageInfo: { hasNextPage: boolean; endCursor: string };
    }>(
      {
        queryKey: [`${this.name}:getActivity`, address],
        queryFn: async ({ pageParam }) => {
          const caipAddress = `eip155:0:${address.toLowerCase()}`;
          const url = new URL(
            `${this.#accountsBaseUrl}/v4/multiaccount/transactions?limit=10&accountAddresses=${caipAddress}`,
          );

          if (pageParam) {
            url.searchParams.set('cursor', pageParam);
          }

          const response = await fetch(url);

          return response.json();
        },
        getNextPageParam: ({ pageInfo }) =>
          pageInfo.hasNextPage ? pageInfo.endCursor : undefined,
      },
      page,
    );
  }
}
