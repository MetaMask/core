import { Messenger } from '@metamask/messenger';
import { BaseDataService } from './BaseDataService';
import { Json } from '@metamask/utils';

const serviceName = 'ExampleDataService';

type ExampleMessenger = Messenger<typeof serviceName, any, any>;

class ExampleDataService extends BaseDataService<
  typeof serviceName,
  ExampleMessenger
> {
  #accountsBaseUrl = 'https://accounts.api.cx.metamask.io';
  #tokensBaseUrl = 'https://tokens.api.cx.metamask.io';

  constructor(messenger: ExampleMessenger) {
    super({
      name: serviceName,
      messenger,
    });

    messenger.registerActionHandler(
      `${this.name}:getAssets`,
      // @ts-expect-error TODO.
      this.getAssets.bind(this),
    );

    messenger.registerActionHandler(
      `${this.name}:getActivity`,
      // @ts-expect-error TODO.
      this.getActivity.bind(this),
    );
  }

  async getAssets(assets: string[]) {
    return this.fetchQuery({
      queryKey: [`${this.name}:getAssets`, ...assets],
      queryFn: async () => {
        const url = new URL(
          `${this.#tokensBaseUrl}/v3/assets?assetIds=${assets.join(',')}`,
        );

        const response = await fetch(url);

        return response.json();
      },
    });
  }

  async getActivity(address: string, pageParam?: string) {
    return this.fetchInfiniteQuery<{ data: Json; pageInfo: { hasNextPage: boolean; endCursor: string } }>({
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
    }, pageParam);
  }
}

describe('BaseDataService', () => {
  it('handles basic queries', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    expect(
      await service.getAssets([
        'eip155:1/slip44:60',
        'bip122:000000000019d6689c085ae165831e93/slip44:0',
        'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
      ]),
    ).toStrictEqual([
      {
        assetId: 'bip122:000000000019d6689c085ae165831e93/slip44:0',
        decimals: 8,
        name: 'Bitcoin',
        symbol: 'BTC',
      },
      {
        assetId: 'eip155:1/slip44:60',
        decimals: 18,
        name: 'Ethereum',
        symbol: 'ETH',
      },
      {
        assetId: 'eip155:1/erc20:0x6b175474e89094c44da98b954eedeac495271d0f',
        decimals: 18,
        name: 'Dai Stablecoin',
        symbol: 'DAI',
      },
    ]);
  });

  it('handles paginated queries', async () => {
    const messenger = new Messenger({ namespace: serviceName });
    const service = new ExampleDataService(messenger);

    const page1 = await service.getActivity(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
    );

    // expect(page1.data).toStrictEqual([]);

    const page2 = await service.getActivity(
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      page1.pageInfo.endCursor,
    );

    expect(page2.data).not.toStrictEqual(page1.data);
  });
});